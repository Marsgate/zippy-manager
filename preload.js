const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  changePage: (url) => ipcRenderer.send('change-page', url),
  createTournament: (data) => ipcRenderer.send('create-tournament', data),
  getTournamentData: () => ipcRenderer.invoke('get-tournament-data'),
  loadTournament: () => ipcRenderer.send('load-tournament'),
  saveTournamentData: (data) => ipcRenderer.send('save-tournament-data', data)
});