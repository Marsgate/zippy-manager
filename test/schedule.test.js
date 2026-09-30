const test = require('node:test');
const assert = require('node:assert/strict');
const { generateSchedule, evaluate } = require('../shared/schedule');

// Deterministic random numbers so the tests don't flake.
function seeded(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function teams(count) {
    return Array.from({ length: count }, (_, i) => 'T' + (i + 1));
}

function appearances(matches) {
    const counts = {};
    matches.forEach(match => [match.red1, match.red2, match.blue1, match.blue2].forEach(team => {
        counts[team] = (counts[team] || 0) + 1;
    }));
    return counts;
}

test('every team plays its quota and nobody is in a match twice', () => {
    const result = generateSchedule(teams(10), 5, { random: seeded(1) });
    const counts = appearances(result.matches);
    teams(10).forEach(team => assert.ok(counts[team] >= 5, team + ' plays at least 5'));
    result.matches.forEach(match => {
        assert.equal(new Set([match.red1, match.red2, match.blue1, match.blue2]).size, 4);
    });
    assert.equal(result.matches.length, 13, '10 teams x 5 = 50 slots needs 13 matches');
});

test('matches are numbered in order and team match counts are reported', () => {
    const result = generateSchedule(teams(8), 5, { random: seeded(2) });
    assert.deepEqual(result.matches.map(match => match.matchNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    assert.deepEqual(result.teams.map(team => team.matchCount), new Array(8).fill(5));
});

test('red and blue are balanced for every team', () => {
    for (const count of [8, 12, 16]) {
        const result = generateSchedule(teams(count), 5, { random: seeded(count) });
        assert.ok(result.stats.worstColorImbalance <= 1, count + ' teams: imbalance ' + result.stats.worstColorImbalance);
    }
});

test('no back-to-back matches once there are enough teams', () => {
    for (const count of [12, 16, 24]) {
        const result = generateSchedule(teams(count), 5, { random: seeded(count) });
        assert.equal(result.stats.backToBack, 0, count + ' teams');
    }
});

test('small events keep back-to-backs rare without repeating partners', () => {
    const result = generateSchedule(teams(8), 5, { random: seeded(3) });
    assert.ok(result.stats.backToBack <= 4, 'back-to-backs: ' + result.stats.backToBack);
    assert.equal(result.stats.repeatPartners, 0);
});

test('nobody plays three matches in a row', () => {
    const result = generateSchedule(teams(8), 6, { random: seeded(4) });
    const m = result.matches.map(match => [match.red1, match.red2, match.blue1, match.blue2]);
    for (let i = 2; i < m.length; i++) {
        const triple = m[i].filter(team => m[i - 1].includes(team) && m[i - 2].includes(team));
        assert.deepEqual(triple, [], 'match ' + (i + 1));
    }
});

test('evaluate counts back-to-backs and repeat partners', () => {
    const matches = [
        { red1: 'A', red2: 'B', blue1: 'C', blue2: 'D' },
        { red1: 'A', red2: 'B', blue1: 'E', blue2: 'F' }
    ];
    const stats = evaluate(matches, ['A', 'B', 'C', 'D', 'E', 'F'], 1);
    assert.equal(stats.backToBack, 2);
    assert.equal(stats.repeatPartners, 1);
    assert.equal(stats.worstColorImbalance, 2);
});
