const test = require('node:test');
const assert = require('node:assert/strict');
const tournament = require('../shared/tournament');

function makeData(names) {
    return {
        teams: names.map(name => ({ name, matchCount: 1 })),
        schedule: [{ matchNumber: 1, red1: names[0], red2: names[1], blue1: names[2], blue2: names[3], redScore: 0, blueScore: 0, complete: false }],
        alliances: [{ captain: names[0], partner: names[1] }],
        currentStage: 'qualification',
        eliminations: { matches: [], currentMatch: 1 }
    };
}

test('lowercase team names are uppercased everywhere they appear', () => {
    const data = makeData(['abc1', 'Bee2', 'CAT3', 'dog4']);
    tournament.ensureTournamentDataShape(data);
    assert.deepEqual(data.teams.map(team => team.name), ['ABC1', 'BEE2', 'CAT3', 'DOG4']);
    assert.deepEqual([data.schedule[0].red1, data.schedule[0].blue2], ['ABC1', 'DOG4']);
    assert.deepEqual(data.alliances[0], { captain: 'ABC1', partner: 'BEE2' });
});

test('names are left alone if uppercasing would merge two teams', () => {
    const data = makeData(['abc', 'ABC', 'cat', 'dog']);
    tournament.ensureTournamentDataShape(data);
    assert.deepEqual(data.teams.map(team => team.name), ['abc', 'ABC', 'cat', 'dog']);
});

test('team name limit is 8 characters', () => {
    assert.equal(tournament.MAX_TEAM_NAME_LENGTH, 8);
});
