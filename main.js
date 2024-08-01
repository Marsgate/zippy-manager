const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron/main');
const path = require('node:path');
const fs = require('fs');

win = null;

let filepath = '';

async function getTournamentData () {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function saveTournamentData (data) {
    fs.writeFileSync(filepath, JSON.stringify(data), 'utf-8');
}

function loadTournament () {
    try { 
        filepath = dialog.showOpenDialogSync()[0];
    } catch(e) {
        console.log('Failed to load the file!');
        return;
    }
    win.loadFile('schedule/schedule.html');
}

function createWindow () {
    win = new BrowserWindow({
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    })
    
    win.setFullScreen(true);

    win.loadFile('menu/menu.html');

}

app.whenReady().then(() => {
    // top bar menu
    const menu = Menu.buildFromTemplate([
        {
            label: 'File',
            submenu: [
                {
                    label: 'Create',
                    click: function() {win.loadFile('create/create.html')}
                },
                {
                    label: 'Load',
                    click: loadTournament
                },
                {
                    role: 'quit'
                }
            ]
        },
        {
            role: 'viewMenu'
        },
        {
            role: 'windowMenu'
        },
    ]);
    Menu.setApplicationMenu(menu);
    
    // change page
    ipcMain.on('change-page', function(event, url) {
        win.loadFile(url)
    });

    // create tournament
    ipcMain.on('create-tournament', function(event, data) {
        try { 
            filepath = dialog.showSaveDialogSync({
                filters: [
                    { name: 'text', extensions: ['txt'] }
                ]
            });
            saveTournamentData(data);
            win.loadFile('schedule/schedule.html');

        } catch(e) {
            console.log('Failed to save the file!');
            return;
        }
    });

    ipcMain.on('load-tournament', function(event) {
        loadTournament();
    })

    ipcMain.on('save-tournament-data', function(event, data) {
        saveTournamentData(data);
    });

    ipcMain.handle('get-tournament-data', getTournamentData);

    createWindow();
})

