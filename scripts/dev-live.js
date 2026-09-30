// Runs the live server with an in-memory sample tournament, for developing the
// ref and display pages in a browser without launching Electron.
//   node scripts/dev-live.js [port]   (defaults to 8775 so it never shadows the app's 8765)
const { MatchController } = require('../server/match-controller');
const { LiveServer } = require('../server/live-server');

const teams = ['1234A', '5678B', '2468C', '1357D', '9090X', '4242Z', '7777K', '3141P'];
let data = {
    currentStage: 'qualification',
    currentMatch: 1,
    teams: teams.map(name => ({ name, matchCount: 0 })),
    alliances: [],
    eliminations: { matches: [], currentMatch: 1 },
    schedule: Array.from({ length: 6 }, (_, i) => ({
        matchNumber: i + 1,
        red1: teams[(i * 4) % 8],
        red2: teams[(i * 4 + 1) % 8],
        blue1: teams[(i * 4 + 2) % 8],
        blue2: teams[(i * 4 + 3) % 8],
        redScore: 0,
        blueScore: 0,
        complete: false
    }))
};

const controller = new MatchController({
    getData: () => data,
    saveData: next => { data = next; }
});
const server = new LiveServer({
    controller,
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.argv[2]) || 8775
});

server.listen().then(port => {
    console.log('Live dev server on http://127.0.0.1:' + port + '  (PIN ' + server.pin + ')');
});
