// Qualification schedule generator. Builds many candidate schedules greedily (each
// match is the lowest-cost choice given what has been scheduled so far) and keeps
// the best one overall. Loaded by the create page and by the tests.
(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.scheduleUtils = api;
    }
})(typeof self !== 'undefined' ? self : this, function() {
    const POOL_SIZE = 10;
    const COST = {
        extraMatch: 5000,      // a team playing beyond its quota
        behind: 1000,          // per match a team is ahead of the least-played team
        repeatPartner: 700,    // worse than a back-to-back: variety matters more than rest
        backToBack: 400,       // played in the previous match
        oneMatchRest: 40,      // played two matches ago
        repeatOpponent: 60,
        jitter: 6
    };

    function combinations(items, size, start = 0, prefix = [], out = []) {
        if (prefix.length === size) {
            out.push(prefix.slice());
            return out;
        }
        for (let i = start; i <= items.length - (size - prefix.length); i++) {
            prefix.push(items[i]);
            combinations(items, size, i + 1, prefix, out);
            prefix.pop();
        }
        return out;
    }

    function matrix(size) {
        return Array.from({ length: size }, () => new Array(size).fill(0));
    }

    function buildOnce(names, matchesPerTeam, random) {
        const teams = names.map((name, index) => ({ name, index, played: 0, red: 0, blue: 0, last: -Infinity }));
        const partners = matrix(teams.length);
        const opponents = matrix(teams.length);
        const matchCount = Math.ceil(teams.length * matchesPerTeam / 4);
        const matches = [];

        for (let m = 0; m < matchCount; m++) {
            const minPlayed = Math.min(...teams.map(team => team.played));
            const order = teams.map(team => ({ team, tiebreak: random() }));
            order.sort((a, b) => a.team.played - b.team.played || a.team.last - b.team.last || a.tiebreak - b.tiebreak);
            const pool = order.slice(0, Math.min(POOL_SIZE, teams.length)).map(entry => entry.team);

            const teamCost = team => {
                let cost = (team.played - minPlayed) * COST.behind;
                if (team.played >= matchesPerTeam) {
                    cost += COST.extraMatch;
                }
                const gap = m - team.last;
                if (gap === 1) {
                    cost += COST.backToBack;
                } else if (gap === 2) {
                    cost += COST.oneMatchRest;
                }
                return cost;
            };

            let best = null;
            for (const four of combinations(pool, 4)) {
                const base = four.reduce((sum, team) => sum + teamCost(team), 0);
                const [a, b, c, d] = four;
                for (const [p, q] of [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]]) {
                    let cost = base + random() * COST.jitter;
                    cost += (partners[p[0].index][p[1].index] + partners[q[0].index][q[1].index]) * COST.repeatPartner;
                    for (const x of p) {
                        for (const y of q) {
                            cost += opponents[x.index][y.index] * COST.repeatOpponent;
                        }
                    }
                    if (!best || cost < best.cost) {
                        best = { cost, p, q };
                    }
                }
            }

            // Give each alliance the color that best evens out its teams' red/blue history.
            const lean = pair => pair.reduce((sum, team) => sum + team.red - team.blue, 0);
            const pFirst = lean(best.p) < lean(best.q) || (lean(best.p) === lean(best.q) && random() < 0.5);
            const redPair = (pFirst ? best.p : best.q).slice();
            const bluePair = (pFirst ? best.q : best.p).slice();
            if (random() < 0.5) {
                redPair.reverse();
            }
            if (random() < 0.5) {
                bluePair.reverse();
            }

            redPair.forEach(team => { team.red++; });
            bluePair.forEach(team => { team.blue++; });
            [...redPair, ...bluePair].forEach(team => {
                team.played++;
                team.last = m;
            });
            partners[redPair[0].index][redPair[1].index]++;
            partners[redPair[1].index][redPair[0].index]++;
            partners[bluePair[0].index][bluePair[1].index]++;
            partners[bluePair[1].index][bluePair[0].index]++;
            for (const x of redPair) {
                for (const y of bluePair) {
                    opponents[x.index][y.index]++;
                    opponents[y.index][x.index]++;
                }
            }

            matches.push({
                red1: redPair[0].name,
                red2: redPair[1].name,
                blue1: bluePair[0].name,
                blue2: bluePair[1].name
            });
        }

        return { matches, teams };
    }

    function evaluate(matches, names, matchesPerTeam) {
        const stats = {
            backToBack: 0,
            repeatPartners: 0,
            repeatOpponents: 0,
            worstColorImbalance: 0,
            extraMatches: 0
        };
        const partners = {};
        const opponents = {};
        const color = {};
        const played = {};
        matches.forEach((match, i) => {
            const red = [match.red1, match.red2];
            const blue = [match.blue1, match.blue2];
            const all = red.concat(blue);
            if (i > 0) {
                const prev = matches[i - 1];
                stats.backToBack += all.filter(team => [prev.red1, prev.red2, prev.blue1, prev.blue2].includes(team)).length;
            }
            red.forEach(team => { color[team] = (color[team] || 0) + 1; });
            blue.forEach(team => { color[team] = (color[team] || 0) - 1; });
            all.forEach(team => { played[team] = (played[team] || 0) + 1; });
            [red, blue].forEach(pair => {
                const key = pair.slice().sort().join('|');
                partners[key] = (partners[key] || 0) + 1;
            });
            red.forEach(x => blue.forEach(y => {
                const key = [x, y].sort().join('|');
                opponents[key] = (opponents[key] || 0) + 1;
            }));
        });
        stats.repeatPartners = Object.values(partners).reduce((sum, n) => sum + n - 1, 0);
        stats.repeatOpponents = Object.values(opponents).reduce((sum, n) => sum + Math.max(0, n - 1), 0);
        stats.worstColorImbalance = Math.max(0, ...names.map(name => Math.abs(color[name] || 0)));
        stats.extraMatches = names.reduce((sum, name) => sum + Math.max(0, (played[name] || 0) - matchesPerTeam), 0);
        stats.score = stats.backToBack * 100 + stats.repeatPartners * 300 + stats.repeatOpponents * 12 +
            stats.worstColorImbalance * 30 + stats.extraMatches * 500;
        return stats;
    }

    // Returns { matches: [{matchNumber, red1, red2, blue1, blue2}], teams: [{name, matchCount}], stats }.
    function generateSchedule(names, matchesPerTeam, { attempts, random = Math.random } = {}) {
        const perAttempt = Math.ceil(names.length * matchesPerTeam / 4) * 630;
        const tries = attempts || Math.max(20, Math.min(400, Math.floor(4e6 / perAttempt)));
        let best = null;

        for (let i = 0; i < tries; i++) {
            const candidate = buildOnce(names, matchesPerTeam, random);
            const stats = evaluate(candidate.matches, names, matchesPerTeam);
            if (!best || stats.score < best.stats.score) {
                best = { ...candidate, stats };
            }
        }

        return {
            matches: best.matches.map((match, i) => ({ matchNumber: i + 1, ...match })),
            teams: best.teams.map(team => ({ name: team.name, matchCount: team.played })),
            stats: best.stats
        };
    }

    return { generateSchedule, evaluate };
});
