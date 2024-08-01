$('#create-btn').on('click', () => {
    window.electronAPI.changePage('create/create.html');
});

$('#load-btn').on('click', () => {
    window.electronAPI.loadTournament();
    window.electronAPI.changePage('schedule/schedule.html');
});