(function() {
    function goTo(page) {
        window.electronAPI.changePage(page);
    }

    function saveData(data) {
        window.electronAPI.saveTournamentData(data);
    }

    async function loadData() {
        const data = await window.electronAPI.getTournamentData();
        window.tournamentUtils.ensureTournamentDataShape(data);
        return data;
    }

    async function setStageAndGoToTimer(stage) {
        const data = await loadData();
        data.currentStage = stage;
        saveData(data);
        goTo('timer/timer.html');
    }

    // Opens the match screen on a given match. A match already under way (timer running,
    // paused, or being scored) is never abandoned: the button just goes to it.
    async function playMatch(stage, matchNumber) {
        const phase = await window.electronAPI.getLivePhase();
        if (phase === 'running' || phase === 'paused' || phase === 'scoring') {
            goTo('timer/timer.html');
            return;
        }
        const data = await loadData();
        data.currentStage = stage;
        if (stage === 'elimination') {
            data.eliminations.currentMatch = matchNumber;
        } else {
            data.currentMatch = matchNumber;
        }
        saveData(data);
        goTo('timer/timer.html');
    }

    // Live tools are reachable from every tournament page, no menu or shortcut needed.
    function bindLiveButtons() {
        const display = document.getElementById('open-display');
        const pairing = document.getElementById('open-pairing');
        if (display) {
            display.addEventListener('click', () => window.electronAPI.openDisplay());
        }
        if (pairing) {
            pairing.addEventListener('click', () => window.electronAPI.openPairing());
        }
    }

    async function runTournamentPage(setupPage) {
        bindLiveButtons();
        // A ref device changed the tournament (alliance picks): start over from the new data.
        window.electronAPI.onTournamentChanged(() => location.reload());
        const data = await loadData();

        return setupPage({
            data: data,
            save: function() {
                saveData(data);
            },
            goTo: goTo,
            saveAndGoTo: function(page) {
                saveData(data);
                goTo(page);
            },
            setStageAndGoToTimer: setStageAndGoToTimer,
            playMatch: playMatch
        });
    }

    // Header nav buttons: data-goto="page.html" navigates, data-timer="stage" opens the match screen.
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('[data-goto]').forEach(button => {
            button.addEventListener('click', () => goTo(button.dataset.goto));
        });
        document.querySelectorAll('[data-timer]').forEach(button => {
            button.addEventListener('click', () => setStageAndGoToTimer(button.dataset.timer));
        });
    });

    window.pageUtils = {
        goTo: goTo,
        loadData: loadData,
        runTournamentPage: runTournamentPage
    };
})();
