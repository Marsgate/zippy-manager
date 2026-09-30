// Fixture states for designing screens without the server: ?mock=checkin|pre|running|last30|last10|paused|scoring|final
(function() {
    const S = window.hexyScoring;

    function base(phase, remainingSec, edit) {
        const scoring = S.emptyScoring();
        if (edit) {
            edit(scoring);
        }
        return {
            phase,
            remainingMs: remainingSec * 1000,
            match: {
                label: 'Q12',
                stageName: 'Qualification',
                red: ['1234A', '5678B'],
                blue: ['2468C', '1357D']
            },
            onDeck: { label: 'Q13', red: ['9090X', '4242Z'], blue: ['7777K', '3141P'] },
            checkIn: { red: [true, true], blue: [true, true], allReady: true },
            displayMode: 'match',
            scoring
        };
    }

    function midMatch(scoring) {
        scoring.red.bonus = 3;
        scoring.red.penalties = 2;
        scoring.blue.bonus = 2;
        scoring.blue.penalties = 0;
    }

    function endGame(scoring) {
        midMatch(scoring);
        scoring.red.bonus = 5;
        scoring.blue.bonus = 4;
        scoring.blue.penalties = 1;
        scoring.red.zoneHexes = 4;
        scoring.blue.zoneHexes = 3;
        scoring.towers = ['red', 'blue', 'red', null];
        scoring.red.hanging = 2;
        scoring.red.hangSlots = [true, true];
        scoring.blue.hanging = 1;
        scoring.blue.hangSlots = [true, false];
    }

    // Waiting on teams: the display rotates the boards. `firstBoard` picks which one shows first.
    function withBoard(firstBoard, teamCount, ready = [true, false, false, true]) {
        const state = base('pre', 120);
        state.checkIn = { red: ready.slice(0, 2), blue: ready.slice(2), allReady: ready.every(Boolean) };
        state.firstBoard = firstBoard;
        const names = ['GOOSEY', 'BASED', 'WHAT', 'LOOSEY', 'HELP', 'BADOOSEY', 'MOOSEY', 'CRINGE', 'HONK', 'JAMBAND', 'QUACK', 'WADDLE'];
        const teams = Array.from({ length: teamCount }, (_, i) => names[i] || 'TEAM' + (i + 1));
        state.displayMode = 'boards';
        state.boards = {
            stageName: 'Qualification',
            rankings: teams.map((name, i) => ({
                rank: i + 1, name, win: Math.max(0, 4 - Math.floor(i / 3)), loss: Math.floor(i / 3), tie: 0, points: 60 - i * 4
            })),
            schedule: Array.from({ length: Math.ceil(teamCount * 5 / 4) }, (_, i) => ({
                label: 'Q' + (i + 1),
                red: [teams[(i * 4) % teamCount], teams[(i * 4 + 1) % teamCount]],
                blue: [teams[(i * 4 + 2) % teamCount], teams[(i * 4 + 3) % teamCount]],
                redScore: 10 + (i * 7) % 9,
                blueScore: 8 + (i * 5) % 11,
                complete: i < 5,
                current: i === 5
            }))
        };
        return state;
    }

    // Alliance selection on the TV: `picks` alliances already formed.
    function withAlliance(teamCount, picks) {
        const state = base('final', 0, s => { endGame(s); s.submitted = true; });
        const names = ['GOOSEY', 'BASED', 'WHAT', 'LOOSEY', 'HELP', 'BADOOSEY', 'MOOSEY', 'CRINGE', 'HONK', 'JAMBAND', 'QUACK', 'WADDLE'];
        const ranked = Array.from({ length: teamCount }, (_, i) => ({ rank: i + 1, name: names[i] || 'TEAM' + (i + 1), points: 60 - i }));
        const pool = ranked.slice();
        const alliances = [];
        for (let i = 0; i < picks && pool.length >= 2; i++) {
            const captain = pool.shift();
            const partner = pool.splice(Math.min(2, pool.length - 1), 1)[0];
            alliances.push({ seed: i + 1, captain: captain.name, partner: partner.name });
        }
        const captain = pool.length >= 2 ? pool[0].name : null;
        state.displayMode = 'alliance';
        state.nextStep = 'allianceSelection';
        state.alliance = {
            seedCount: Math.floor(teamCount / 2),
            alliances,
            captain,
            complete: !captain,
            available: pool.map(team => Object.assign({}, team, { captain: team.name === captain }))
        };
        return state;
    }

    // Eliminations waiting on check-in: the TV shows the bracket (8 alliances, 2 played).
    function withBracket() {
        const state = base('pre', 120);
        state.match = { label: 'E3', stageName: 'Elimination', red: ['BASED', 'BADOOSEY'], blue: ['TEAM13', 'TEAM14'] };
        state.checkIn = { red: [true, false], blue: [false, false], allReady: false };
        state.displayMode = 'boards';
        const a = ['GOOSEY / LOOSEY', 'BASED / BADOOSEY', 'WHAT / CRINGE', 'HELP / JAMBAND', 'MOOSEY / WADDLE', 'HONK / QUACK', 'TEAM13 / TEAM14', 'TEAM15 / TEAM16']
            .map((pair, i) => ({ seed: i + 1, teams: pair.split(' / ') }));
        const side = (alliance, score) => alliance ? { seed: alliance.seed, teams: alliance.teams, score } : { seed: null, teams: ['', ''], score: 0 };
        const match = (label, red, blue, extra) => Object.assign({ label, red, blue, complete: false, winner: null, current: false }, extra);
        state.boards = {
            stageName: 'Elimination',
            bracket: [
                { name: 'Quarterfinal', matches: [
                    match('E1', side(a[0], 18), side(a[7], 9), { complete: true, winner: 'red' }),
                    match('E2', side(a[3], 12), side(a[4], 15), { complete: true, winner: 'blue' }),
                    match('E3', side(a[1], 0), side(a[6], 0), { current: true }),
                    match('E4', side(a[2], 0), side(a[5], 0))
                ] },
                { name: 'Semifinal', matches: [
                    match('E5', side(a[0], 0), side(a[4], 0)),
                    match('E6', side(null), side(null))
                ] },
                { name: 'Final', matches: [match('E7', side(null), side(null))] }
            ]
        };
        return state;
    }

    const fixtures = {
        bracket: withBracket,
        alliance: () => withAlliance(12, 2),
        allianceBig: () => withAlliance(30, 4),
        allianceDone: () => withAlliance(12, 6),
        rankings: () => withBoard('rankings', 12),
        rankingsBig: () => withBoard('rankings', 30),
        schedule: () => withBoard('schedule', 12),
        scheduleBig: () => withBoard('schedule', 30),
        checkin: () => withBoard('rankings', 12),
        checkinNone: () => withBoard('rankings', 12, [false, false, false, false]),
        pre: () => base('pre', 120),
        running: () => base('running', 74, midMatch),
        paused: () => base('paused', 74, midMatch),
        last30: () => base('running', 27, midMatch),
        last10: () => base('running', 7, midMatch),
        scoring: () => base('scoring', 0, endGame),
        final: () => base('final', 0, s => { endGame(s); s.submitted = true; })
    };

    function getMockState() {
        const name = new URLSearchParams(location.search).get('mock');
        return name && fixtures[name] ? fixtures[name]() : null;
    }

    window.hexyMock = { getMockState, fixtures };
})();
