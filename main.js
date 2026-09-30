const { app, BrowserWindow, ipcMain, dialog, Menu, screen } = require('electron/main');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const QRCode = require('qrcode');
const { MatchController } = require('./server/match-controller');
const { LiveServer } = require('./server/live-server');

const MENU_PAGE = 'menu/menu.html';
const CREATE_PAGE = 'create/create.html';
const SCHEDULE_PAGE = 'schedule/schedule.html';
const TIMER_PAGE = 'timer/timer.html';

let win = null;
let displayWin = null;
let pairWin = null;
let audioWin = null;
let filepath = '';
let tournamentData = null;
let controller = null;
let liveServer = null;

function liveUrl(pathname) {
    return 'http://127.0.0.1:' + liveServer.port + pathname;
}

function loadPage(page) {
    if (!win) {
        return;
    }
    // The match screen is the shared live ref UI, served by the local live server.
    if (page === TIMER_PAGE) {
        win.loadURL(liveUrl('/live/ref.html'));
        return;
    }
    win.loadFile(page);
}

// LAN addresses a ref phone or tablet can reach, e.g. 192.168.1.20 (Wi-Fi first when available).
function lanAddresses() {
    const addresses = [];
    for (const [name, entries] of Object.entries(os.networkInterfaces())) {
        for (const entry of entries || []) {
            if (entry.family === 'IPv4' && !entry.internal) {
                addresses.push({ name, address: entry.address });
            }
        }
    }
    // Prefer private LAN ranges; VPN/overlay addresses (e.g. 100.64.0.0/10) aren't reachable from a phone or tablet.
    const isPrivate = ({ address }) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address);
    const lan = addresses.some(isPrivate) ? addresses.filter(isPrivate) : addresses;
    return lan.sort((a, b) => (a.name === 'en0' ? -1 : 0) - (b.name === 'en0' ? -1 : 0));
}

async function getPairingInfo() {
    const urls = lanAddresses().map(({ name, address }) => ({
        name,
        url: 'http://' + address + ':' + liveServer.port + '/ref'
    }));
    const primary = urls[0];
    return {
        pin: liveServer.pin,
        pairedCount: liveServer.tokens.size,
        urls,
        displayUrl: primary ? primary.url.replace(/\/ref$/, '/display') : null,
        // The PIN rides in the URL fragment, which browsers never send to the server.
        qr: primary ? await QRCode.toDataURL(primary.url + '#pin=' + liveServer.pin, { margin: 1, width: 360 }) : null
    };
}

function openPairWindow() {
    if (pairWin && !pairWin.isDestroyed()) {
        pairWin.focus();
        return;
    }
    pairWin = new BrowserWindow({
        width: 560,
        height: 760,
        // Width/height describe the page area, not counting the title bar.
        useContentSize: true,
        show: false,
        parent: win || undefined,
        resizable: false,
        acceptFirstMouse: true,
        title: 'Pair a device',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });
    pairWin.setMenuBarVisibility(false);
    pairWin.loadFile('pair/pair.html');
    // Fit the window to its content (the address and tips vary in length), within the screen.
    pairWin.webContents.once('did-finish-load', async () => {
        const target = pairWin;
        const height = await target.webContents.executeJavaScript(
            'new Promise(done => setTimeout(() => done(Math.ceil(document.querySelector(".pair").getBoundingClientRect().bottom)), 250))'
        ).catch(() => 760);
        if (target.isDestroyed()) {
            return;
        }
        const workArea = screen.getDisplayMatching(target.getBounds()).workArea;
        target.setContentSize(560, Math.min(height, workArea.height - 40));
        target.center();
        target.show();
    });
    pairWin.on('closed', () => {
        pairWin = null;
    });
}

function tokensPath() {
    return path.join(app.getPath('userData'), 'paired-devices.json');
}

function readSavedTokens() {
    try {
        return JSON.parse(fs.readFileSync(tokensPath(), 'utf8'));
    } catch (error) {
        return [];
    }
}

function saveTokens(tokens) {
    fs.writeFileSync(tokensPath(), JSON.stringify(tokens), 'utf8');
}

function readTournamentData() {
    return tournamentData;
}

function writeTournamentFile() {
    if (filepath && tournamentData) {
        fs.writeFileSync(filepath, JSON.stringify(tournamentData), 'utf8');
    }
}

// Remembers the last opened tournament so Home can offer to resume it, even after a restart.
function settingsPath() {
    return path.join(app.getPath('userData'), 'settings.json');
}

function readSettings() {
    try {
        return JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    } catch (error) {
        return {};
    }
}

function writeSettings(settings) {
    fs.writeFileSync(settingsPath(), JSON.stringify(settings), 'utf8');
}

function getResumeInfo() {
    const lastPath = filepath || readSettings().lastTournamentPath;
    if (!lastPath || !fs.existsSync(lastPath)) {
        return null;
    }
    return { name: path.basename(lastPath, path.extname(lastPath)) };
}

function resumeTournament() {
    if (filepath && tournamentData) {
        loadPage(SCHEDULE_PAGE);
        return;
    }
    const lastPath = readSettings().lastTournamentPath;
    try {
        openTournament(lastPath, JSON.parse(fs.readFileSync(lastPath, 'utf8')));
    } catch (error) {
        dialog.showErrorBox('Could not reopen the last tournament', error.message);
        return;
    }
    loadPage(SCHEDULE_PAGE);
}

function openTournament(selectedPath, data) {
    if (!process.env.ZIPPY_SHOT) {
        writeSettings(Object.assign(readSettings(), { lastTournamentPath: selectedPath }));
    }
    filepath = selectedPath;
    tournamentData = data;
    writeTournamentFile();
    controller.syncToCurrentMatch();
    controller.emitChange();
}

function saveTournamentData(data) {
    tournamentData = controller.protectLiveMatch(data);
    writeTournamentFile();
    controller.syncToCurrentMatch();
    controller.emitChange();
}

function chooseFile(dialogMethod, options = {}) {
    try {
        return dialogMethod(options);
    } catch (error) {
        return null;
    }
}

function chooseTournamentToLoad() {
    const [selectedPath] = chooseFile(dialog.showOpenDialogSync) || [];
    if (!selectedPath) {
        return false;
    }

    let data;
    try {
        data = JSON.parse(fs.readFileSync(selectedPath, 'utf8'));
    } catch (error) {
        dialog.showErrorBox('Could not open tournament', error.message);
        return false;
    }

    openTournament(selectedPath, data);
    loadPage(SCHEDULE_PAGE);
    return true;
}

function chooseTournamentSavePath() {
    return chooseFile(dialog.showSaveDialogSync, {
        filters: [{ name: 'text', extensions: ['txt'] }]
    });
}

function createWindow() {
    const devShot = process.env.ZIPPY_SHOT;
    win = new BrowserWindow({
        width: 1366,
        height: 900,
        show: !devShot,
        // Let the first click press a button even if the window isn't focused yet.
        acceptFirstMouse: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    if (devShot) {
        runDevCapture(devShot);
        return;
    }
    // Closing the main window (red button) quits the whole app, including the display,
    // pairing, and hidden audio windows, rather than macOS's default of staying open.
    win.on('closed', () => {
        win = null;
        app.quit();
    });

    // Fill the screen but keep the title bar and window controls visible.
    win.maximize();
    // When launched from a terminal the app may not become active on its own.
    app.focus({ steal: true });
    win.focus();
    loadPage(MENU_PAGE);
}

// Dev aid for design reviews: ZIPPY_FILE=<tournament> ZIPPY_PAGE=<page> ZIPPY_SHOT=<out.png>
// (optional ZIPPY_JS=<script> runs in the page first)
// renders a page in a hidden window, saves a screenshot, and quits.
function runDevCapture(outPath) {
    if (process.env.ZIPPY_FILE) {
        openTournament(process.env.ZIPPY_FILE, JSON.parse(fs.readFileSync(process.env.ZIPPY_FILE, 'utf8')));
    }
    // ZIPPY_PAGE=pair captures the pairing window itself, at the size it picks.
    if (process.env.ZIPPY_PAGE === 'pair') {
        openPairWindow();
        pairWin.once('show', () => setTimeout(async () => {
            const image = await pairWin.webContents.capturePage();
            fs.writeFileSync(outPath, image.toPNG());
            console.log('pair window content size', pairWin.getContentSize().join('x'));
            app.quit();
        }, 500));
        return;
    }
    win.webContents.once('did-finish-load', () => {
        setTimeout(async () => {
            if (process.env.ZIPPY_JS) {
                await win.webContents.executeJavaScript(process.env.ZIPPY_JS);
            }
            const image = await win.webContents.capturePage();
            fs.writeFileSync(outPath, image.toPNG());
            app.quit();
        }, Number(process.env.ZIPPY_DELAY) || 1500);
    });
    loadPage(process.env.ZIPPY_PAGE || MENU_PAGE);
}

// Sound cues play from a hidden window so they use the server's current audio output
// (built-in speakers, headphones, HDMI...) whether or not any display is open.
function createAudioWindow() {
    audioWin = new BrowserWindow({
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            autoplayPolicy: 'no-user-gesture-required',
            backgroundThrottling: false
        }
    });
    audioWin.loadFile('audio/audio.html');
    audioWin.on('closed', () => {
        audioWin = null;
    });

    let lastSeq = controller.snapshot().sound.seq;
    controller.on('change', snapshot => {
        if (snapshot.sound.seq === lastSeq) {
            return;
        }
        lastSeq = snapshot.sound.seq;
        if (audioWin && snapshot.sound.name) {
            audioWin.webContents.send('play-cue', snapshot.sound.name);
        }
    });
}

// Audience display: fullscreen on an external monitor/TV when one is connected.
// With a single screen it opens as a floating 16:9 preview that stays above the
// fullscreen operator window, so it can be watched while developing or refereeing.
function openDisplayWindow() {
    if (displayWin && !displayWin.isDestroyed()) {
        displayWin.show();
        displayWin.focus();
        return;
    }

    const primary = screen.getPrimaryDisplay();
    const external = screen.getAllDisplays().find(display => display.id !== primary.id);
    const previewWidth = 640;
    const previewHeight = 360;
    const bounds = external
        ? { x: external.bounds.x + 40, y: external.bounds.y + 40, width: 1280, height: 720 }
        : {
            x: primary.workArea.x + primary.workArea.width - previewWidth - 24,
            y: primary.workArea.y + primary.workArea.height - previewHeight - 24,
            width: previewWidth,
            height: previewHeight
        };

    displayWin = new BrowserWindow(Object.assign({}, bounds, {
        backgroundColor: '#0b0e14',
        title: 'Zippy Manager Display',
        acceptFirstMouse: true,
        minWidth: 320,
        minHeight: 180,
        webPreferences: {
            autoplayPolicy: 'no-user-gesture-required'
        }
    }));
    displayWin.setMenuBarVisibility(false);

    if (external) {
        displayWin.setFullScreen(true);
    } else {
        displayWin.setAspectRatio(16 / 9);
        displayWin.setAlwaysOnTop(true, 'floating');
        displayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }

    displayWin.loadURL(liveUrl('/live/display.html'));
    displayWin.on('closed', () => {
        displayWin = null;
    });
}

function createAppMenu() {
    return Menu.buildFromTemplate([
        {
            label: 'File',
            submenu: [
                { label: 'Create', click: () => loadPage(CREATE_PAGE) },
                { label: 'Load', click: chooseTournamentToLoad },
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
                { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
                { type: 'separator' },
                { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
                { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
                { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
                { label: 'Select All', accelerator: 'CmdOrCtrl+A', selector: 'selectAll:' }
            ]
        },
        {
            label: 'Live',
            submenu: [
                { label: 'Open Audience Display', accelerator: 'CmdOrCtrl+D', click: openDisplayWindow },
                { label: 'Pair Device…', accelerator: 'CmdOrCtrl+P', click: openPairWindow }
            ]
        },
        { role: 'viewMenu' },
        { role: 'windowMenu' }
    ]);
}

app.whenReady().then(async () => {
    controller = new MatchController({
        getData: () => tournamentData,
        saveData: data => {
            tournamentData = data;
            writeTournamentFile();
        }
    });
    // A ref device changed alliance picks: the page open on the server reloads so it can't
    // save an older copy over them.
    controller.on('data-changed', () => {
        if (win && !win.isDestroyed() && win.webContents.getURL().startsWith('file:')) {
            win.webContents.send('tournament-changed');
        }
    });
    liveServer = new LiveServer({
        controller,
        host: '0.0.0.0',
        tokens: readSavedTokens(),
        onTokensChanged: saveTokens
    });
    await liveServer.listen();

    Menu.setApplicationMenu(createAppMenu());

    ipcMain.on('change-page', (_event, page) => loadPage(page));

    ipcMain.on('create-tournament', (_event, data) => {
        const selectedPath = chooseTournamentSavePath();
        if (!selectedPath) {
            return;
        }

        openTournament(selectedPath, data);
        loadPage(SCHEDULE_PAGE);
    });

    ipcMain.on('load-tournament', chooseTournamentToLoad);
    ipcMain.on('open-display', openDisplayWindow);
    ipcMain.on('open-pairing', openPairWindow);
    ipcMain.on('quit-app', () => app.quit());
    ipcMain.handle('get-resume-info', getResumeInfo);
    ipcMain.on('resume-tournament', resumeTournament);
    ipcMain.on('save-tournament-data', (_event, data) => saveTournamentData(data));
// The server opened alliance selection: the TV follows, once qualifications are finished.
ipcMain.on('show-alliance-selection', () => controller.dispatch({ type: 'allianceSelection' }));
    ipcMain.handle('get-tournament-data', readTournamentData);
ipcMain.handle('get-live-phase', () => controller.phase);
    ipcMain.handle('get-pairing-info', getPairingInfo);
    ipcMain.handle('reset-pairing', () => {
        liveServer.resetPairing();
        return getPairingInfo();
    });

    createAudioWindow();
    createWindow();
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', () => {
    if (controller) {
        controller.dispose();
    }
    if (liveServer) {
        liveServer.close();
    }
});
