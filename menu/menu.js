$('#create-btn').on('click', () => {
    window.pageUtils.goTo('create/create.html');
});

$('#load-btn').on('click', () => {
    window.electronAPI.loadTournament();
});

$('#quit-btn').on('click', () => {
    window.electronAPI.quitApp();
});

// Game art for the "This season" card.
document.getElementById('game-art').innerHTML =
    window.Icons.tower({ hex: 'red' }) + window.Icons.hex({ top: 'blue', bottom: 'red' }) + window.Icons.tower({ hex: 'blue' });

// Offer to jump back into the last tournament. When it's available it becomes the main
// action, and Create/Load step back to outlined buttons.
window.electronAPI.getResumeInfo().then(info => {
    if (!info) {
        return;
    }
    $('#resume-name').text(info.name);
    $('#resume-btn').prop('hidden', false).on('click', () => window.electronAPI.resumeTournament());
    $('#create-btn').addClass('btn-light-outline');
});
