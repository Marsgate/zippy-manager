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

    async function runTournamentPage(setupPage) {
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
            setStageAndGoToTimer: setStageAndGoToTimer
        });
    }

    window.pageUtils = {
        goTo: goTo,
        loadData: loadData,
        runTournamentPage: runTournamentPage
    };
})();
