$('#create-btn').on('click', () => {
    window.pageUtils.goTo('create/create.html');
});

$('#load-btn').on('click', () => {
    window.electronAPI.loadTournament();
});
