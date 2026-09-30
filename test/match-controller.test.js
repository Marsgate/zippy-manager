const test = require('node:test');
const assert = require('node:assert/strict');
const { MatchController, MATCH_MS } = require('../server/match-controller');

function makeData() {
    return {
        currentStage: 'qualification',
        currentMatch: 1,
        teams: ['R1', 'r1', 'B1', 'b1', 'R2', 'r2', 'B2', 'b2'].map(name => ({ name, matchCount: 1 })),
        alliances: [],
        eliminations: { matches: [], currentMatch: 1 },
        schedule: [1, 2].map(n => ({
            matchNumber: n, red1: 'R' + n, red2: 'r' + n, blue1: 'B' + n, blue2: 'b' + n,
            redScore: 0, blueScore: 0, complete: false
        }))
    };
}

function setup() {
    let clock = 1000000;
    let data = makeData();
    let saves = 0;
    const controller = new MatchController({
        getData: () => data,
        saveData: next => { data = next; saves++; },
        now: () => clock
    });
    return {
        controller,
        advance: ms => { clock += ms; },
        data: () => data,
        saves: () => saves
    };
}

test('starts in pre phase on the current match', () => {
    const { controller } = setup();
    const snap = controller.snapshot();
    assert.equal(snap.phase, 'pre');
    assert.equal(snap.remainingMs, MATCH_MS);
    assert.equal(snap.match.label, 'Q1');
    assert.deepEqual(snap.match.red, ['R1', 'r1']);
    controller.dispose();
});

test('pause keeps the remaining time and resume continues it', () => {
    const { controller, advance } = setup();
    controller.dispatch({ type: 'start' });
    advance(30000);
    controller.dispatch({ type: 'pause' });
    assert.equal(controller.snapshot().remainingMs, MATCH_MS - 30000);
    advance(60000);
    assert.equal(controller.snapshot().remainingMs, MATCH_MS - 30000, 'time does not pass while paused');
    controller.dispatch({ type: 'resume' });
    advance(10000);
    assert.equal(controller.snapshot().remainingMs, MATCH_MS - 40000);
    assert.ok(controller.snapshot().endsAt);
    controller.dispose();
});

test('cannot change matches or submit while running', () => {
    const { controller } = setup();
    controller.dispatch({ type: 'start' });
    assert.equal(controller.dispatch({ type: 'nextMatch' }).ok, false);
    assert.equal(controller.dispatch({ type: 'submit' }).ok, false);
    controller.dispose();
});

test('scoring actions update totals on the stored match', () => {
    const { controller, data } = setup();
    controller.dispatch({ type: 'bonus', alliance: 'red' });
    controller.dispatch({ type: 'penalty', alliance: 'blue', value: 2 });
    controller.dispatch({ type: 'setZone', alliance: 'blue', value: 5 });
    const match = data().schedule[0];
    assert.equal(match.redScore, 1);
    assert.equal(match.blueScore, 3);
    assert.equal(match.complete, false);
    controller.dispose();
});

test('submit completes the match and locks scoring until reopened', () => {
    const { controller, data } = setup();
    controller.dispatch({ type: 'endMatch' });
    controller.dispatch({ type: 'setHanging', alliance: 'red', value: 2 });
    controller.dispatch({ type: 'submit' });

    const match = data().schedule[0];
    assert.equal(controller.snapshot().phase, 'final');
    assert.equal(match.complete, true);
    assert.equal(match.redScore, 6);
    assert.equal(controller.dispatch({ type: 'bonus', alliance: 'red' }).ok, false);

    controller.dispatch({ type: 'reopen' });
    assert.equal(controller.snapshot().phase, 'scoring');
    assert.equal(controller.dispatch({ type: 'bonus', alliance: 'red' }).ok, true);
    assert.equal(match.redScore, 7);
    controller.dispose();
});

test('moving to a submitted match opens it in final phase', () => {
    const { controller } = setup();
    controller.dispatch({ type: 'submit' });
    controller.dispatch({ type: 'nextMatch' });
    assert.equal(controller.snapshot().match.label, 'Q2');
    assert.equal(controller.snapshot().phase, 'pre');
    controller.dispatch({ type: 'prevMatch' });
    assert.equal(controller.snapshot().phase, 'final');
    controller.dispose();
});

test('reset clears the score and the timer', () => {
    const { controller, advance, data } = setup();
    controller.dispatch({ type: 'start' });
    controller.dispatch({ type: 'bonus', alliance: 'blue' });
    advance(5000);
    controller.dispatch({ type: 'reset' });
    const snap = controller.snapshot();
    assert.equal(snap.phase, 'pre');
    assert.equal(snap.remainingMs, MATCH_MS);
    assert.equal(snap.scoring.blue.bonus, 0);
    assert.equal(data().schedule[0].blueScore, 0);
    controller.dispose();
});

test('each timer transition bumps the sound cue', () => {
    const { controller } = setup();
    controller.dispatch({ type: 'start' });
    assert.deepEqual(controller.snapshot().sound, { seq: 1, name: 'start' });
    controller.dispatch({ type: 'pause' });
    assert.deepEqual(controller.snapshot().sound, { seq: 2, name: 'stop' });
    controller.dispose();
});

test('snapshot names the on-deck match, and none after the last match', () => {
    const { controller } = setup();
    assert.deepEqual(controller.snapshot().onDeck, { label: 'Q2', red: ['R2', 'r2'], blue: ['B2', 'b2'] });
    controller.dispatch({ type: 'nextMatch' });
    assert.equal(controller.snapshot().onDeck, null);
    controller.dispose();
});

test('the display shows the boards until every team is checked in', () => {
    const { controller } = setup();
    let snap = controller.snapshot();
    assert.equal(snap.displayMode, 'boards');
    assert.deepEqual(snap.checkIn, { red: [false, false], blue: [false, false], allReady: false });
    assert.equal(snap.boards.schedule.length, 2);
    assert.equal(snap.boards.schedule[0].current, true);
    assert.deepEqual(snap.boards.schedule[1].red, ['R2', 'r2']);

    controller.dispatch({ type: 'toggleReady', alliance: 'red', slot: 0 });
    controller.dispatch({ type: 'toggleReady', alliance: 'red', slot: 1 });
    controller.dispatch({ type: 'toggleReady', alliance: 'blue', slot: 0 });
    assert.equal(controller.snapshot().displayMode, 'boards');
    controller.dispatch({ type: 'toggleReady', alliance: 'blue', slot: 1 });
    snap = controller.snapshot();
    assert.equal(snap.checkIn.allReady, true);
    assert.equal(snap.displayMode, 'match');
    assert.equal(snap.boards, null);

    controller.dispatch({ type: 'toggleReady', alliance: 'blue', slot: 1 });
    assert.equal(controller.snapshot().displayMode, 'boards', 'unchecking a team goes back to the boards');
    assert.equal(controller.dispatch({ type: 'toggleReady', alliance: 'green', slot: 0 }).ok, false);
    controller.dispose();
});

test('once a match starts the display keeps the match, and check-in resets on the next match', () => {
    const { controller } = setup();
    controller.dispatch({ type: 'start' });
    assert.equal(controller.snapshot().displayMode, 'match', 'starting without everyone still shows the clock');
    controller.dispatch({ type: 'endMatch' });
    controller.dispatch({ type: 'submit' });
    assert.equal(controller.snapshot().displayMode, 'match', 'the final score stays up');

    controller.dispatch({ type: 'nextMatch' });
    const snap = controller.snapshot();
    assert.equal(snap.displayMode, 'boards');
    assert.equal(snap.checkIn.allReady, false);
    controller.dispose();
});

test('empty alliance slots count as checked in', () => {
    const { controller, data } = setup();
    data().schedule[0].red2 = null;
    data().schedule[0].blue2 = '';
    ['red', 'blue'].forEach(alliance => controller.dispatch({ type: 'toggleReady', alliance, slot: 0 }));
    assert.equal(controller.snapshot().checkIn.allReady, true);
    controller.dispose();
});

test('a submitted match can be replayed from scratch', () => {
    const { controller, data } = setup();
    controller.dispatch({ type: 'toggleReady', alliance: 'red', slot: 0 });
    controller.dispatch({ type: 'endMatch' });
    controller.dispatch({ type: 'setZone', alliance: 'red', value: 4 });
    controller.dispatch({ type: 'submit' });
    assert.equal(data().schedule[0].complete, true);

    assert.equal(controller.dispatch({ type: 'reset' }).ok, true);
    const snap = controller.snapshot();
    const match = data().schedule[0];
    assert.equal(snap.phase, 'pre');
    assert.equal(snap.remainingMs, MATCH_MS);
    assert.equal(match.complete, false);
    assert.equal(match.redScore, 0);
    assert.equal(snap.scoring.submitted, false);
    assert.equal(snap.checkIn.red[0], true, 'teams already at the field stay checked in');
    controller.dispose();
});

test('replaying an elimination match steps the bracket back', () => {
    const { controller, data } = setup();
    const tournament = require('../shared/tournament');
    const alliances = [['A1', 'A2'], ['B1', 'B2'], ['C1', 'C2'], ['D1', 'D2']]
        .map(([captain, partner]) => ({ captain, partner }));
    data().alliances = alliances;
    tournament.regenerateEliminationBracket(data());
    data().currentStage = 'elimination';
    controller.syncToCurrentMatch();

    const first = controller.currentMatch();
    controller.dispatch({ type: 'endMatch' });
    controller.dispatch({ type: 'setZone', alliance: 'red', value: 5 });
    controller.dispatch({ type: 'submit' });
    const final = data().eliminations.matches.find(match => match.roundIndex === 1);
    assert.equal(final.red1, first.red1, 'the winner moved on to the final');

    controller.dispatch({ type: 'reset' });
    assert.equal(first.complete, false);
    assert.equal(final.red1, '', 'the final no longer has the replayed match\'s winner');
    assert.equal(controller.currentMatch(), first, 'the ref stays on the match being replayed');
    controller.dispose();
});

test('the clock cues a warning at 0:30 and a beep each second from 0:10', t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { controller, advance } = setup();
    const heard = [];
    controller.on('change', snap => {
        if (snap.sound.name && !heard.some(h => h.seq === snap.sound.seq)) {
            heard.push({ seq: snap.sound.seq, name: snap.sound.name, left: Math.round(snap.remainingMs / 1000) });
        }
    });
    const tick = ms => { advance(ms); t.mock.timers.tick(ms); };

    controller.dispatch({ type: 'start' });
    tick(MATCH_MS - 30000);
    assert.deepEqual(heard.map(h => h.name), ['start', 'warning']);
    assert.equal(heard[1].left, 30);

    // Pausing mid-countdown stops the beeps; resuming carries on without repeats.
    tick(25000);
    controller.dispatch({ type: 'pause' });
    tick(60000);
    const beepsBeforeResume = heard.filter(h => h.name === 'beep').length;
    assert.equal(beepsBeforeResume, 6, '0:10 through 0:05');
    controller.dispatch({ type: 'resume' });
    tick(5000);

    const names = heard.map(h => h.name);
    assert.equal(names.filter(n => n === 'warning').length, 1, 'the warning is not replayed');
    assert.equal(names.filter(n => n === 'beep').length, 10);
    assert.equal(names[names.length - 1], 'end');
    controller.dispose();
});

test('after the last qualification match the display can switch to alliance selection', () => {
    const { controller, data } = setup();
    assert.equal(controller.snapshot().nextStep, 'nextMatch');
    assert.equal(controller.dispatch({ type: 'allianceSelection' }).ok, false, 'not before quals are done');

    controller.dispatch({ type: 'submit' });
    controller.dispatch({ type: 'nextMatch' });
    controller.dispatch({ type: 'endMatch' });
    controller.dispatch({ type: 'setZone', alliance: 'blue', value: 3 });
    controller.dispatch({ type: 'submit' });
    assert.equal(controller.snapshot().nextStep, 'allianceSelection');
    assert.equal(controller.snapshot().displayMode, 'match', 'the final score shows first');

    assert.equal(controller.dispatch({ type: 'allianceSelection' }).ok, true);
    let snap = controller.snapshot();
    assert.equal(snap.displayMode, 'alliance');
    assert.equal(snap.alliance.seedCount, 4);
    assert.equal(snap.alliance.alliances.length, 0);
    const top = snap.alliance.available[0];
    assert.equal(snap.alliance.captain, top.name);
    assert.equal(top.captain, true);

    // A pick made on the laptop shows up, and the next captain steps up.
    data().alliances = [{ captain: top.name, partner: snap.alliance.available[3].name }];
    snap = controller.snapshot();
    assert.equal(snap.alliance.alliances[0].seed, 1);
    assert.equal(snap.alliance.available.length, 6);
    assert.notEqual(snap.alliance.captain, top.name);

    // Going back to replay a match leaves alliance selection.
    controller.dispatch({ type: 'prevMatch' });
    assert.notEqual(controller.snapshot().displayMode, 'alliance');
    controller.dispose();
});

test('a ref device can make picks, undo them, and start the bracket', () => {
    const { controller, data } = setup();
    let changes = 0;
    controller.on('data-changed', () => { changes++; });
    assert.equal(controller.dispatch({ type: 'pickPartner', team: 'B1' }).ok, false, 'not before quals are done');

    data().schedule.forEach((match, i) => Object.assign(match, { complete: true, redScore: 10 + i, blueScore: 5 }));
    controller.dispatch({ type: 'allianceSelection' });
    let board = controller.snapshot().alliance;
    const captain = board.captain;
    assert.equal(controller.dispatch({ type: 'pickPartner', team: captain }).ok, false, 'a captain cannot pick itself');

    const partner = board.available[1].name;
    assert.equal(controller.dispatch({ type: 'pickPartner', team: partner }).ok, true);
    assert.deepEqual(data().alliances[0], { captain, partner });
    assert.equal(changes, 1, 'the server pages are told to refresh');
    assert.equal(controller.dispatch({ type: 'startBracket' }).ok, false, 'selection is not finished');

    assert.equal(controller.dispatch({ type: 'undoPick' }).ok, true);
    assert.equal(data().alliances.length, 0);

    // Finish selection: 8 teams make 4 alliances.
    while (!controller.snapshot().alliance.complete) {
        board = controller.snapshot().alliance;
        controller.dispatch({ type: 'pickPartner', team: board.available.find(team => !team.captain).name });
    }
    assert.equal(data().alliances.length, 4);
    assert.ok(data().eliminations.matches.length > 0, 'the bracket is generated');

    assert.equal(controller.dispatch({ type: 'startBracket' }).ok, true);
    const snap = controller.snapshot();
    assert.equal(data().currentStage, 'elimination');
    assert.equal(snap.match.stageName, 'Elimination');
    assert.equal(snap.displayMode, 'boards', 'the first elimination match starts at check-in');
    controller.dispose();
});

test('during eliminations the display shows the bracket while teams check in', () => {
    const { controller, data } = setup();
    const tournament = require('../shared/tournament');
    data().alliances = [['A1', 'A2'], ['B1', 'B2'], ['C1', 'C2'], ['D1', 'D2']]
        .map(([captain, partner]) => ({ captain, partner }));
    tournament.regenerateEliminationBracket(data());
    data().currentStage = 'elimination';
    controller.syncToCurrentMatch();

    const snap = controller.snapshot();
    assert.equal(snap.displayMode, 'boards');
    assert.equal(snap.boards.rankings, undefined);
    const rounds = snap.boards.bracket;
    assert.deepEqual(rounds.map(round => round.matches.length), [2, 1]);
    assert.equal(rounds[0].matches[0].current, true);
    assert.equal(rounds[0].matches[0].red.seed, 1);
    assert.deepEqual(rounds[0].matches[0].red.teams, ['A1', 'A2']);
    assert.equal(rounds[1].matches[0].red.teams[0], '', 'the final waits for its alliances');
    controller.dispose();
});
