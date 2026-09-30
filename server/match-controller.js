// Authoritative live match state: timer, current match, and scoring.
// Every screen (operator window, ref phones/tablets, audience display) renders snapshots from here.
const { EventEmitter } = require('node:events');
const scoring = require('../shared/scoring');
const tournament = require('../shared/tournament');

const MATCH_MS = scoring.GAME.matchSeconds * 1000;
// Timed sounds while the clock runs: the VEX-style warning at 0:30, then a beep every second from 0:10.
const TIMED_CUES = [{ at: 30000, name: 'warning' }]
    .concat([10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(seconds => ({ at: seconds * 1000, name: 'beep' })));
const SCORING_ACTIONS = new Set([
    'bonus', 'penalty', 'undo', 'setTower', 'setZone', 'setHanging', 'toggleHang', 'setBonus', 'setPenalties'
]);

function emptyReady() {
    return { red: [false, false], blue: [false, false] };
}

class MatchController extends EventEmitter {
    constructor({ getData, saveData, now = Date.now }) {
        super();
        this.getData = getData;
        this.saveData = saveData;
        this.now = now;
        this.phase = 'pre';
        this.endsAt = null;
        this.remainingMs = MATCH_MS;
        this.timeout = null;
        this.sound = { seq: 0, name: null };
        this.ready = emptyReady();
        this.allianceSelection = false;
        this.matchKey = null;
        this.syncToCurrentMatch();
    }

    // ---------- tournament lookups ----------
    stage() {
        const data = this.getData();
        if (!data) {
            return null;
        }
        const elimination = data.currentStage === 'elimination';
        return {
            name: elimination ? 'elimination' : 'qualification',
            label: elimination ? 'Elimination' : 'Qualification',
            prefix: elimination ? 'E' : 'Q',
            state: elimination ? data.eliminations : data,
            matches: elimination ? tournament.getVisibleEliminationMatches(data) : data.schedule
        };
    }

    matchIndex(stage = this.stage()) {
        if (!stage) {
            return -1;
        }
        return stage.matches.findIndex(match => match.matchNumber === stage.state.currentMatch);
    }

    currentMatch() {
        const stage = this.stage();
        const match = stage ? stage.matches[this.matchIndex(stage)] || null : null;
        if (match) {
            scoring.normalizeScoring(match);
        }
        return match;
    }

    // Called after the tournament data changes underneath us (load, page saves).
    syncToCurrentMatch() {
        const stage = this.stage();
        const match = this.currentMatch();
        const key = stage && match ? stage.name + ':' + match.matchNumber : null;
        if (key === this.matchKey) {
            return;
        }
        this.matchKey = key;
        this.ready = emptyReady();
        this.allianceSelection = false;
        this.stopClock();
        this.remainingMs = MATCH_MS;
        this.phase = match && match.scoring.submitted ? 'final' : 'pre';
        this.emitChange();
    }

    // ---------- clock ----------
    remaining() {
        if (this.phase === 'running') {
            return Math.max(0, this.endsAt - this.now());
        }
        return this.remainingMs;
    }

    stopClock() {
        clearTimeout(this.timeout);
        this.timeout = null;
        (this.cueTimers || []).forEach(clearTimeout);
        this.cueTimers = [];
        this.endsAt = null;
    }

    startClock() {
        this.endsAt = this.now() + this.remainingMs;
        this.phase = 'running';
        this.timeout = setTimeout(() => this.finishClock(), this.remainingMs);
        // Only cues still ahead: resuming at 0:25 doesn't replay the 0:30 warning.
        this.cueTimers = TIMED_CUES
            .filter(cue => this.remainingMs > cue.at)
            .map(cue => setTimeout(() => {
                this.playSound(cue.name);
                this.emitChange();
            }, this.remainingMs - cue.at));
    }

    finishClock() {
        this.stopClock();
        this.remainingMs = 0;
        this.phase = 'scoring';
        this.playSound('end');
        this.emitChange();
    }

    playSound(name) {
        this.sound = { seq: this.sound.seq + 1, name };
    }

    // ---------- actions ----------
    dispatch(action) {
        const match = this.currentMatch();
        if (!action || typeof action.type !== 'string') {
            return { ok: false, error: 'Invalid action' };
        }
        if (action.type === 'allianceSelection') {
            if (!this.qualsComplete()) {
                return { ok: false, error: 'Finish every qualification match first' };
            }
            this.allianceSelection = true;
            this.emitChange();
            return { ok: true };
        }
        if (action.type === 'pickPartner' || action.type === 'undoPick' || action.type === 'startBracket') {
            return this.allianceAction(action);
        }
        if (!match && action.type !== 'prevMatch' && action.type !== 'nextMatch') {
            return { ok: false, error: 'No match selected' };
        }

        switch (action.type) {
            case 'start':
            case 'resume':
                if (this.phase !== 'pre' && this.phase !== 'paused') {
                    return { ok: false, error: 'Timer is not ready to start' };
                }
                this.playSound('start');
                this.startClock();
                break;
            case 'pause':
                if (this.phase !== 'running') {
                    return { ok: false, error: 'Timer is not running' };
                }
                this.remainingMs = this.remaining();
                this.stopClock();
                this.phase = 'paused';
                this.playSound('stop');
                break;
            case 'reset': {
                // Also replays a match that was already submitted: its result comes off the
                // rankings, and in eliminations the bracket steps back to before it.
                const wasComplete = match.complete;
                this.stopClock();
                this.remainingMs = MATCH_MS;
                this.phase = 'pre';
                match.scoring = scoring.emptyScoring();
                match.complete = false;
                this.persist(match, { advanceBracket: wasComplete });
                break;
            }
            case 'endMatch':
                if (this.phase === 'running') {
                    this.playSound('stop');
                }
                this.remainingMs = this.remaining();
                this.stopClock();
                this.phase = 'scoring';
                break;
            case 'submit':
                if (this.phase === 'running') {
                    return { ok: false, error: 'Stop the timer before submitting' };
                }
                this.stopClock();
                match.scoring = scoring.applyAction(match.scoring, { type: 'submit' });
                match.complete = true;
                this.phase = 'final';
                this.persist(match, { advanceBracket: true });
                break;
            case 'reopen':
                if (this.phase !== 'final') {
                    return { ok: false, error: 'Match is not submitted' };
                }
                match.scoring = scoring.applyAction(match.scoring, { type: 'unsubmit' });
                this.phase = 'scoring';
                this.persist(match);
                break;
            case 'toggleReady': {
                const slots = this.ready[action.alliance];
                if (!slots || !(action.slot in slots)) {
                    return { ok: false, error: 'Unknown team' };
                }
                slots[action.slot] = !slots[action.slot];
                break;
            }
            case 'prevMatch':
            case 'nextMatch':
                if (this.phase === 'running') {
                    return { ok: false, error: 'Stop the timer before changing matches' };
                }
                return this.moveMatch(action.type === 'nextMatch' ? 1 : -1);
            default:
                if (!SCORING_ACTIONS.has(action.type)) {
                    return { ok: false, error: 'Unknown action ' + action.type };
                }
                if (this.phase === 'final') {
                    return { ok: false, error: 'Reopen the match to change its score' };
                }
                match.scoring = scoring.applyAction(match.scoring, Object.assign({}, action, { t: this.now() }));
                this.persist(match);
        }

        this.emitChange();
        return { ok: true };
    }

    moveMatch(offset) {
        const stage = this.stage();
        const next = stage && stage.matches[this.matchIndex(stage) + offset];
        if (!next) {
            return { ok: false, error: 'No more matches that way' };
        }
        stage.state.currentMatch = next.matchNumber;
        this.saveData(this.getData());
        this.syncToCurrentMatch();
        return { ok: true };
    }

    persist(match, { advanceBracket = false } = {}) {
        scoring.applyTotalsToMatch(match);
        const data = this.getData();
        if (advanceBracket && data.currentStage === 'elimination') {
            const viewing = data.eliminations.currentMatch;
            tournament.updateEliminationProgress(data);
            // Stay on the match that was just scored so its result can be shown.
            data.eliminations.currentMatch = viewing;
        }
        this.saveData(data);
    }

    // A renderer page may save a copy of the tournament it loaded before the ref scored.
    // Carry the live match's score over so that save cannot erase it.
    protectLiveMatch(incoming) {
        if (this.phase === 'pre' || this.phase === 'final') {
            return incoming;
        }
        const match = this.currentMatch();
        const stage = this.stage();
        if (!match || !stage || !incoming) {
            return incoming;
        }
        const list = stage.name === 'elimination'
            ? (incoming.eliminations && incoming.eliminations.matches) || []
            : incoming.schedule || [];
        const target = list.find(candidate => candidate.matchNumber === match.matchNumber);
        if (target) {
            target.scoring = JSON.parse(JSON.stringify(match.scoring));
            target.redScore = match.redScore;
            target.blueScore = match.blueScore;
            target.complete = match.complete;
        }
        return incoming;
    }

    // ---------- check-in ----------
    // Empty slots (an elimination alliance still being decided) never hold up a match.
    checkIn(match) {
        const teams = { red: [match.red1, match.red2], blue: [match.blue1, match.blue2] };
        const ready = {
            red: this.ready.red.map((value, i) => value || !teams.red[i]),
            blue: this.ready.blue.map((value, i) => value || !teams.blue[i])
        };
        return Object.assign(ready, { allReady: ready.red.concat(ready.blue).every(Boolean) });
    }

    // ---------- alliance selection ----------
    qualsComplete() {
        const data = this.getData();
        return Boolean(data && data.currentStage !== 'elimination' && data.schedule.length &&
            data.schedule.every(match => match.complete));
    }

    // Picks made from a ref phone or tablet, with the same rules as the server's alliance page.
    allianceAction(action) {
        if (!this.qualsComplete()) {
            return { ok: false, error: 'Finish every qualification match first' };
        }
        const data = this.getData();
        data.alliances = data.alliances || [];
        const board = this.allianceBoard();
        if (action.type === 'pickPartner') {
            const partner = board.available.find(team => team.name === action.team && !team.captain);
            if (!board.captain || !partner) {
                return { ok: false, error: 'That team can\'t be picked' };
            }
            data.alliances.push({ captain: board.captain, partner: partner.name });
        } else if (action.type === 'undoPick') {
            if (!data.alliances.length) {
                return { ok: false, error: 'No picks to undo' };
            }
            data.alliances.pop();
        } else {
            if (!board.complete || data.alliances.length < 2) {
                return { ok: false, error: 'Finish alliance selection first' };
            }
            tournament.regenerateEliminationBracket(data);
            data.currentStage = 'elimination';
            this.saveData(data);
            this.emit('data-changed');
            this.syncToCurrentMatch();
            this.emitChange();
            return { ok: true };
        }
        // Keep the bracket in step with the picks, as the alliance page does.
        if (this.allianceBoard().complete && data.alliances.length >= 2) {
            tournament.regenerateEliminationBracket(data);
        } else {
            tournament.resetEliminations(data);
        }
        this.allianceSelection = true;
        this.saveData(data);
        this.emit('data-changed');
        this.emitChange();
        return { ok: true };
    }

    // Alliance selection as the audience sees it: seeds so far, who is picking, who is left.
    allianceBoard() {
        const data = this.getData();
        const rankings = tournament.buildRankings(data);
        const alliances = data.alliances || [];
        const picked = new Set(alliances.flatMap(alliance => [alliance.captain, alliance.partner]));
        const remaining = rankings.filter(team => !picked.has(team.name));
        // Same rule as the server page: the top remaining team captains while two or more are left.
        const captain = remaining.length >= 2 ? remaining[0].name : null;
        return {
            seedCount: Math.floor(rankings.length / 2),
            alliances: alliances.map((alliance, i) => ({ seed: i + 1, captain: alliance.captain, partner: alliance.partner })),
            captain,
            complete: !captain,
            available: remaining.map(team => ({
                rank: rankings.indexOf(team) + 1,
                name: team.name,
                points: team.score,
                captain: team.name === captain
            }))
        };
    }

    // Alliance selection takes over once the ref or the server opens it after the last
    // qualification match. Otherwise, until every team is checked in, the audience display
    // rotates rankings and the schedule.
    displayMode(match) {
        if (this.allianceSelection && this.qualsComplete()) {
            return 'alliance';
        }
        return match && this.phase === 'pre' && !this.checkIn(match).allReady ? 'boards' : 'match';
    }

    // ---------- snapshots ----------
    snapshot() {
        const stage = this.stage();
        const match = this.currentMatch();
        const index = this.matchIndex(stage);
        const next = match && index !== -1 ? stage.matches[index + 1] : null;
        const displayMode = this.displayMode(match);
        return {
            serverNow: this.now(),
            phase: this.phase,
            endsAt: this.phase === 'running' ? this.endsAt : null,
            remainingMs: this.remaining(),
            matchMs: MATCH_MS,
            sound: this.sound,
            match: match ? {
                key: this.matchKey,
                label: match.label || (stage.prefix + match.matchNumber),
                stageName: stage.label,
                red: [match.red1, match.red2],
                blue: [match.blue1, match.blue2],
                hasPrev: index > 0,
                hasNext: index !== -1 && index < stage.matches.length - 1
            } : null,
            checkIn: match ? this.checkIn(match) : null,
            displayMode,
            // Only sent while the audience display is showing the boards, to keep updates small.
            boards: displayMode === 'boards' ? this.boards(stage, index) : null,
            alliance: displayMode === 'alliance' ? this.allianceBoard() : null,
            // What the ref's button offers once this match is submitted.
            nextStep: match && index !== -1 && index < stage.matches.length - 1 ? 'nextMatch'
                : (stage && stage.name === 'qualification' ? 'allianceSelection' : null),
            // The following match, so the audience display can show who is on deck.
            onDeck: next ? {
                label: next.label || (stage.prefix + next.matchNumber),
                red: [next.red1, next.red2],
                blue: [next.blue1, next.blue2]
            } : null,
            scoring: match ? match.scoring : scoring.emptyScoring()
        };
    }

    // Rankings and the current stage's schedule, for the audience display's boards.
    boards(stage, currentIndex) {
        const data = this.getData();
        if (!data || !stage) {
            return null;
        }
        // Eliminations show the bracket instead of rankings and the schedule.
        if (stage.name === 'elimination') {
            return { stageName: stage.label, bracket: this.bracketBoard(stage, currentIndex) };
        }
        return {
            stageName: stage.label,
            rankings: tournament.buildRankings(data).map((team, i) => ({
                rank: i + 1,
                name: team.name,
                win: team.win,
                loss: team.loss,
                tie: team.tie,
                points: team.score
            })),
            schedule: stage.matches.map((match, i) => ({
                label: match.label || (stage.prefix + match.matchNumber),
                red: [match.red1, match.red2],
                blue: [match.blue1, match.blue2],
                redScore: match.redScore,
                blueScore: match.blueScore,
                complete: Boolean(match.complete),
                current: i === currentIndex
            }))
        };
    }

    bracketBoard(stage, currentIndex) {
        const current = stage.matches[currentIndex];
        const rounds = [];
        stage.matches.forEach(match => {
            const round = rounds[match.roundIndex] || (rounds[match.roundIndex] = { name: match.roundName, matches: [] });
            const winner = match.complete && match.redScore !== match.blueScore
                ? (match.redScore > match.blueScore ? 'red' : 'blue') : null;
            round.matches.push({
                label: match.label,
                slot: match.slotIndex,
                red: { seed: match.redSeed, teams: [match.red1, match.red2], score: match.redScore },
                blue: { seed: match.blueSeed, teams: [match.blue1, match.blue2], score: match.blueScore },
                complete: Boolean(match.complete),
                winner,
                current: match === current
            });
        });
        return rounds.filter(Boolean).map(round => Object.assign(round, {
            matches: round.matches.sort((a, b) => a.slot - b.slot)
        }));
    }

    emitChange() {
        this.emit('change', this.snapshot());
    }

    dispose() {
        this.stopClock();
        this.removeAllListeners();
    }
}

module.exports = { MatchController, MATCH_MS };
