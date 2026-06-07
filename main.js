const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron/main');
const path = require('node:path');
const fs = require('node:fs');

const MENU_PAGE = 'menu/menu.html';
const CREATE_PAGE = 'create/create.html';
const SCHEDULE_PAGE = 'schedule/schedule.html';

let win = null;
let filepath = '';

function loadPage(page) {
    if (win) {
        win.loadFile(page);
    }
}

function readTournamentData() {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function saveTournamentData(data) {
    fs.writeFileSync(filepath, JSON.stringify(data), 'utf8');
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

    filepath = selectedPath;
    loadPage(SCHEDULE_PAGE);
    return true;
}

function chooseTournamentSavePath() {
    return chooseFile(dialog.showSaveDialogSync, {
        filters: [{ name: 'text', extensions: ['txt'] }]
    });
}

function createWindow() {
    win = new BrowserWindow({
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    win.setFullScreen(true);
    loadPage(MENU_PAGE);
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
        { role: 'viewMenu' },
        { role: 'windowMenu' }
    ]);
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(createAppMenu());

    ipcMain.on('change-page', (_event, page) => loadPage(page));

    ipcMain.on('create-tournament', (_event, data) => {
        const selectedPath = chooseTournamentSavePath();
        if (!selectedPath) {
            return;
        }

        filepath = selectedPath;
        saveTournamentData(data);
        loadPage(SCHEDULE_PAGE);
    });

    ipcMain.on('load-tournament', chooseTournamentToLoad);
    ipcMain.on('save-tournament-data', (_event, data) => saveTournamentData(data));
    ipcMain.handle('get-tournament-data', readTournamentData);

    createWindow();
});

