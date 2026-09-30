// Hexy Hustle scoring rules. Loaded by the Electron main process (require)
// and by browser pages (<script>), so it has no dependencies.
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.hexyScoring = api;
    }
})(typeof self !== 'undefined' ? self : this, function() {
    const GAME = {
        matchSeconds: 120,
        towerCount: 4,
        totalHexes: 14,
        robotsPerAlliance: 2,
        points: {
            zoneHex: 1,
            towerHex: 1,
            towerBonus: 1,
            hanging: 3
        }
    };

    const ALLIANCES = ['red', 'blue'];
    const TOWER_CYCLE = [null, 'red', 'blue'];

    function emptyAlliance() {
        // hangSlots tracks each robot; hanging is the count used for points.
        return { bonus: 0, penalties: 0, zoneHexes: 0, hanging: 0, hangSlots: [false, false] };
    }

    function emptyScoring() {
        return {
            red: emptyAlliance(),
            blue: emptyAlliance(),
            towers: new Array(GAME.towerCount).fill(null),
            log: [],
            submitted: false,
            adjust: { red: 0, blue: 0 }
        };
    }

    function clone(scoring) {
        return JSON.parse(JSON.stringify(scoring));
    }

    function towersOwned(scoring, alliance) {
        return scoring.towers.filter(owner => owner === alliance).length;
    }

    function hexesPlaced(scoring) {
        return scoring.red.zoneHexes + scoring.blue.zoneHexes + scoring.towers.filter(Boolean).length;
    }

    function computeBreakdown(scoring, alliance) {
        const side = scoring[alliance];
        const zone = side.zoneHexes * GAME.points.zoneHex;
        const towers = towersOwned(scoring, alliance) * GAME.points.towerHex;
        const hanging = side.hanging * GAME.points.hanging;
        const bonus = side.bonus * GAME.points.towerBonus;
        const penalties = side.penalties;
        const adjust = (scoring.adjust && scoring.adjust[alliance]) || 0;

        return {
            zone,
            towers,
            hanging,
            bonus,
            penalties,
            adjust,
            total: zone + towers + hanging + bonus - penalties + adjust
        };
    }

    function computeTotals(scoring) {
        return {
            red: computeBreakdown(scoring, 'red').total,
            blue: computeBreakdown(scoring, 'blue').total
        };
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function maxZoneHexes(scoring, alliance) {
        const other = alliance === 'red' ? 'blue' : 'red';
        return GAME.totalHexes - scoring[other].zoneHexes - scoring.towers.filter(Boolean).length;
    }

    // Returns a new scoring object; never mutates the input.
    function applyAction(scoring, action) {
        const next = clone(scoring);
        const alliance = action.alliance;

        if (alliance && !ALLIANCES.includes(alliance)) {
            return next;
        }

        switch (action.type) {
            case 'bonus':
                next[alliance].bonus = Math.max(0, next[alliance].bonus + (action.value || 1));
                next.log.push({ t: action.t || Date.now(), alliance, type: 'bonus', value: action.value || 1 });
                break;
            case 'penalty': {
                const value = clamp(Math.round(action.value || 1), 1, 99);
                next[alliance].penalties += value;
                next.log.push({ t: action.t || Date.now(), alliance, type: 'penalty', value });
                break;
            }
            case 'undo': {
                const index = findLastIndex(next.log, entry => !alliance || entry.alliance === alliance);
                if (index === -1) {
                    break;
                }
                const [entry] = next.log.splice(index, 1);
                const field = entry.type === 'bonus' ? 'bonus' : 'penalties';
                next[entry.alliance][field] = Math.max(0, next[entry.alliance][field] - entry.value);
                break;
            }
            case 'setTower': {
                const index = action.index;
                if (index < 0 || index >= GAME.towerCount) {
                    break;
                }
                const owner = action.owner === undefined
                    ? TOWER_CYCLE[(TOWER_CYCLE.indexOf(next.towers[index]) + 1) % TOWER_CYCLE.length]
                    : action.owner;
                if (owner && !next.towers[index] && hexesPlaced(next) >= GAME.totalHexes) {
                    break;
                }
                next.towers[index] = owner;
                break;
            }
            case 'setZone':
                next[alliance].zoneHexes = clamp(Math.round(action.value), 0, maxZoneHexes(next, alliance));
                break;
            case 'setHanging': {
                const count = clamp(Math.round(action.value), 0, GAME.robotsPerAlliance);
                next[alliance].hangSlots = next[alliance].hangSlots.map((_, slot) => slot < count);
                next[alliance].hanging = count;
                break;
            }
            case 'toggleHang': {
                const slot = action.slot;
                if (!(slot >= 0 && slot < GAME.robotsPerAlliance)) {
                    break;
                }
                next[alliance].hangSlots[slot] = !next[alliance].hangSlots[slot];
                next[alliance].hanging = next[alliance].hangSlots.filter(Boolean).length;
                break;
            }
            case 'setBonus':
                next[alliance].bonus = Math.max(0, Math.round(action.value));
                break;
            case 'setPenalties':
                next[alliance].penalties = Math.max(0, Math.round(action.value));
                break;
            case 'submit':
                next.submitted = true;
                break;
            case 'unsubmit':
                next.submitted = false;
                break;
            case 'clear':
                return emptyScoring();
        }

        return next;
    }

    function findLastIndex(list, predicate) {
        for (let i = list.length - 1; i >= 0; i--) {
            if (predicate(list[i])) {
                return i;
            }
        }
        return -1;
    }

    // Brings any stored value (including older files with only redScore/blueScore) into shape.
    function normalizeScoring(match) {
        if (!match.scoring) {
            match.scoring = emptyScoring();
            match.scoring.adjust.red = Number(match.redScore) || 0;
            match.scoring.adjust.blue = Number(match.blueScore) || 0;
            match.scoring.submitted = Boolean(match.complete);
        }

        const scoring = match.scoring;
        for (const alliance of ALLIANCES) {
            const saved = scoring[alliance] || {};
            const hadSlots = Array.isArray(saved.hangSlots) && saved.hangSlots.length === GAME.robotsPerAlliance;
            scoring[alliance] = Object.assign(emptyAlliance(), saved);
            const side = scoring[alliance];
            if (!hadSlots) {
                side.hangSlots = Array.from({ length: GAME.robotsPerAlliance }, (_, slot) => slot < side.hanging);
            }
            side.hanging = side.hangSlots.filter(Boolean).length;
        }
        if (!Array.isArray(scoring.towers) || scoring.towers.length !== GAME.towerCount) {
            scoring.towers = new Array(GAME.towerCount).fill(null);
        }
        scoring.log = Array.isArray(scoring.log) ? scoring.log : [];
        scoring.adjust = Object.assign({ red: 0, blue: 0 }, scoring.adjust);
        scoring.submitted = Boolean(scoring.submitted);
        return scoring;
    }

    function applyTotalsToMatch(match) {
        const totals = computeTotals(match.scoring);
        match.redScore = totals.red;
        match.blueScore = totals.blue;
        return totals;
    }

    return {
        GAME,
        ALLIANCES,
        emptyScoring,
        computeBreakdown,
        computeTotals,
        applyAction,
        normalizeScoring,
        applyTotalsToMatch,
        hexesPlaced,
        maxZoneHexes,
        towersOwned
    };
});
