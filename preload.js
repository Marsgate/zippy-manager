const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  changePage: (url) => ipcRenderer.send('change-page', url),
  createTournament: (data) => ipcRenderer.send('create-tournament', data),
  getTournamentData: () => ipcRenderer.invoke('get-tournament-data'),
  loadTournament: () => ipcRenderer.send('load-tournament'),
  saveTournamentData: (data) => ipcRenderer.send('save-tournament-data', data),
  getPairingInfo: () => ipcRenderer.invoke('get-pairing-info'),
  resetPairing: () => ipcRenderer.invoke('reset-pairing'),
  openDisplay: () => ipcRenderer.send('open-display'),
  openPairing: () => ipcRenderer.send('open-pairing'),
  quitApp: () => ipcRenderer.send('quit-app'),
  getResumeInfo: () => ipcRenderer.invoke('get-resume-info'),
  resumeTournament: () => ipcRenderer.send('resume-tournament'),
  showAllianceSelection: () => ipcRenderer.send('show-alliance-selection'),
  getLivePhase: () => ipcRenderer.invoke('get-live-phase'),
  onTournamentChanged: (callback) => ipcRenderer.on('tournament-changed', () => callback()),
  onCue: (callback) => ipcRenderer.on('play-cue', (_event, name) => callback(name))
});