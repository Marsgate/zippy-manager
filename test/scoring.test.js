const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../shared/scoring');

function apply(scoring, ...actions) {
    return actions.reduce((current, action) => S.applyAction(current, action), scoring);
}

test('empty scoring totals zero', () => {
    assert.deepEqual(S.computeTotals(S.emptyScoring()), { red: 0, blue: 0 });
});

test('breakdown follows the Hexy Hustle point table', () => {
    const scoring = apply(S.emptyScoring(),
        { type: 'bonus', alliance: 'red' },
        { type: 'bonus', alliance: 'red' },
        { type: 'penalty', alliance: 'red', value: 2 },
        { type: 'setZone', alliance: 'red', value: 4 },
        { type: 'setTower', index: 0, owner: 'red' },
        { type: 'setTower', index: 1, owner: 'blue' },
        { type: 'setHanging', alliance: 'red', value: 2 }
    );

    assert.deepEqual(S.computeBreakdown(scoring, 'red'), {
        zone: 4, towers: 1, hanging: 6, bonus: 2, penalties: 2, adjust: 0, total: 11
    });
    assert.equal(S.computeBreakdown(scoring, 'blue').total, 1);
});

test('applyAction does not mutate its input', () => {
    const original = S.emptyScoring();
    S.applyAction(original, { type: 'bonus', alliance: 'blue' });
    assert.equal(original.blue.bonus, 0);
    assert.equal(original.log.length, 0);
});

test('undo reverts the last event for that alliance only', () => {
    const scoring = apply(S.emptyScoring(),
        { type: 'bonus', alliance: 'red' },
        { type: 'penalty', alliance: 'blue', value: 3 },
        { type: 'penalty', alliance: 'red', value: 1 },
        { type: 'undo', alliance: 'blue' }
    );
    assert.equal(scoring.blue.penalties, 0);
    assert.equal(scoring.red.penalties, 1);

    const again = apply(scoring, { type: 'undo', alliance: 'red' }, { type: 'undo', alliance: 'red' });
    assert.equal(again.red.penalties, 0);
    assert.equal(again.red.bonus, 0);
    assert.equal(again.log.length, 0);

    const nothing = S.applyAction(again, { type: 'undo', alliance: 'red' });
    assert.deepEqual(nothing, again);
});

test('tower tap cycles empty -> red -> blue -> empty', () => {
    const cycle = [];
    let scoring = S.emptyScoring();
    for (let i = 0; i < 4; i++) {
        scoring = S.applyAction(scoring, { type: 'setTower', index: 2 });
        cycle.push(scoring.towers[2]);
    }
    assert.deepEqual(cycle, ['red', 'blue', null, 'red']);
});

test('hanging is capped at 2 robots and zero', () => {
    const scoring = apply(S.emptyScoring(), { type: 'setHanging', alliance: 'blue', value: 5 });
    assert.equal(scoring.blue.hanging, 2);
    assert.equal(S.applyAction(scoring, { type: 'setHanging', alliance: 'blue', value: -1 }).blue.hanging, 0);
});

test('hexes on the field never exceed 14', () => {
    let scoring = apply(S.emptyScoring(),
        { type: 'setTower', index: 0, owner: 'red' },
        { type: 'setTower', index: 1, owner: 'red' },
        { type: 'setZone', alliance: 'blue', value: 10 },
        { type: 'setZone', alliance: 'red', value: 10 }
    );
    assert.equal(scoring.red.zoneHexes, 2);
    assert.equal(S.hexesPlaced(scoring), 14);

    scoring = S.applyAction(scoring, { type: 'setTower', index: 2, owner: 'blue' });
    assert.equal(scoring.towers[2], null, 'an empty tower cannot take a 15th hex');

    scoring = S.applyAction(scoring, { type: 'setTower', index: 0, owner: 'blue' });
    assert.equal(scoring.towers[0], 'blue', 'recoloring an occupied tower is allowed');
});

test('penalties cannot go negative and bonus edits clamp at zero', () => {
    const scoring = apply(S.emptyScoring(),
        { type: 'setPenalties', alliance: 'red', value: -4 },
        { type: 'setBonus', alliance: 'red', value: -1 }
    );
    assert.equal(scoring.red.penalties, 0);
    assert.equal(scoring.red.bonus, 0);
});

test('invalid alliance is ignored', () => {
    const scoring = S.applyAction(S.emptyScoring(), { type: 'bonus', alliance: 'green' });
    assert.deepEqual(S.computeTotals(scoring), { red: 0, blue: 0 });
});

test('legacy matches keep their old score as an adjustment', () => {
    const match = { redScore: 7, blueScore: 3, complete: true };
    S.normalizeScoring(match);
    assert.deepEqual(S.computeTotals(match.scoring), { red: 7, blue: 3 });
    assert.equal(match.scoring.submitted, true);

    S.applyTotalsToMatch(match);
    assert.equal(match.redScore, 7);
});

test('normalize repairs partial scoring objects', () => {
    const match = { scoring: { red: { bonus: 2 }, towers: ['red'] } };
    S.normalizeScoring(match);
    assert.deepEqual(match.scoring.red, { bonus: 2, penalties: 0, zoneHexes: 0, hanging: 0, hangSlots: [false, false] });
    assert.deepEqual(match.scoring.towers, [null, null, null, null]);
    assert.deepEqual(match.scoring.blue, { bonus: 0, penalties: 0, zoneHexes: 0, hanging: 0, hangSlots: [false, false] });
});

test('each robot hangs independently', () => {
    let scoring = S.applyAction(S.emptyScoring(), { type: 'toggleHang', alliance: 'red', slot: 1 });
    assert.deepEqual(scoring.red.hangSlots, [false, true]);
    assert.equal(scoring.red.hanging, 1);
    assert.equal(S.computeBreakdown(scoring, 'red').hanging, 3);

    scoring = S.applyAction(scoring, { type: 'toggleHang', alliance: 'red', slot: 0 });
    assert.equal(scoring.red.hanging, 2);
    scoring = S.applyAction(scoring, { type: 'toggleHang', alliance: 'red', slot: 1 });
    assert.deepEqual(scoring.red.hangSlots, [true, false]);
    assert.equal(scoring.red.hanging, 1);
});

test('older saves with only a hanging count get per-robot slots', () => {
    const match = { scoring: { red: { hanging: 1 }, blue: { hanging: 2 } } };
    S.normalizeScoring(match);
    assert.deepEqual(match.scoring.red.hangSlots, [true, false]);
    assert.deepEqual(match.scoring.blue.hangSlots, [true, true]);
});
