$(async function(){
    let tournamentData = await window.electronAPI.getTournamentData();
    window.tournamentUtils.ensureTournamentDataShape(tournamentData);

    const stageConfig = {
        qualification: {
            matches: tournamentData.schedule,
            page: 'schedule/schedule.html',
            buttonLabel: 'View Schedule',
            matchPrefix: 'Q'
        },
        elimination: {
            matches: tournamentData.eliminations.matches,
            page: 'bracket/bracket.html',
            buttonLabel: 'View Bracket',
            matchPrefix: 'E'
        }
    };

    let currentStage = tournamentData.currentStage == 'elimination' ? 'elimination' : 'qualification';
    let currentStageData = stageConfig[currentStage];
    let currentMatch = null;

    function getStageMatchNumber() {
        if (currentStage == 'qualification') {
            return tournamentData.currentMatch;
        }
        return tournamentData.eliminations.currentMatch;
    }

    function setStageMatchNumber(matchNumber) {
        if (currentStage == 'qualification') {
            tournamentData.currentMatch = matchNumber;
        } else {
            tournamentData.eliminations.currentMatch = matchNumber;
        }
    }

    function findCurrentMatch(matchNumber) {
        return currentStageData.matches.find(match => match.matchNumber == matchNumber) || null;
    }

    function saveTournamentData(preserveViewedMatch = false) {
        const viewedMatchNumber = preserveViewedMatch ? getStageMatchNumber() : null;

        if (currentStage == 'elimination') {
            window.tournamentUtils.updateEliminationProgress(tournamentData);
            if (preserveViewedMatch && viewedMatchNumber != null) {
                tournamentData.eliminations.currentMatch = viewedMatchNumber;
            }
        }

        window.electronAPI.saveTournamentData(tournamentData);
    }

    function refreshNavState() {
        const matchIndex = currentStageData.matches.findIndex(match => match.matchNumber == getStageMatchNumber());
        $('#prev-match').prop('disabled', matchIndex <= 0);
        $('#next-match').prop('disabled', matchIndex == -1 || matchIndex >= currentStageData.matches.length - 1);
    }

    function updateMatchNumber(matchNumber) {
        setStageMatchNumber(matchNumber);
        currentMatch = findCurrentMatch(getStageMatchNumber());

        if (!currentMatch) {
            $('#match-number').text('Unavailable');
            $('#match-complete').prop('checked', false);
            refreshNavState();
            return;
        }

        const label = currentMatch.label || (currentStageData.matchPrefix + currentMatch.matchNumber);
        $('#match-number').text(label);
        $('#match-complete').prop('checked', currentMatch.complete);
        refreshNavState();
    }

    $('#view-schedule').val(currentStageData.buttonLabel);

    let matchTime = 120;
    let currentTime = matchTime;
    let display = $('#timer');
    let counting = false;

    let startAudio = new Audio('soundeffects/Start.mp3');
    let stopAudio = new Audio('soundeffects/Stop.wav');
    let endAudio = new Audio('soundeffects/End.wav');

    let redScoreDisplay = $('#red .score p');
    let blueScoreDisplay = $('#blue .score p');

    function count() {
        let minutes = parseInt(currentTime / 60, 10);
        let seconds = parseInt(currentTime % 60, 10);

        minutes = minutes < 10 ? '' + minutes : minutes;
        seconds = seconds < 10 ? '0' + seconds : seconds;

        display.text(minutes + ':' + seconds);

        if (counting == true) {
            if (--currentTime < 0) {
                currentTime = 0;
                counting = false;
                endAudio.play();
            }

            setTimeout(count, 1000);
        }
    }

    $('#btn-start').on('click', function() {
        if (counting == false && currentMatch) {
            startAudio.play();
            counting = true;
            count();
        }
    });

    $('#btn-stop').on('click', function() {
        if (counting == true) {
            stopAudio.play();
            currentTime++;
            counting = false;
        }
        count();
    });

    function scoreUpdate() {
        if (!currentMatch) {
            redScoreDisplay.text('0');
            blueScoreDisplay.text('0');
            return;
        }

        redScoreDisplay.text(currentMatch.redScore);
        blueScoreDisplay.text(currentMatch.blueScore);
    }

    function resetScore(reset = true) {
        counting = false;
        currentTime = matchTime;
        if (reset && currentMatch) {
            currentMatch.redScore = 0;
            currentMatch.blueScore = 0;
            if (currentStage == 'elimination') {
                currentMatch.complete = false;
            }
        }
        scoreUpdate();
        count();
    }

    function addScore(score, color) {
        if (!currentMatch) {
            return;
        }

        if (color == 'red') {
            currentMatch.redScore += score;
        } else {
            currentMatch.blueScore += score;
        }

        scoreUpdate();
    }

    $('#btn-reset').on('click', function() {
        resetScore();
    });

    $('#btn-plus-blue').on('click', function() { addScore(1, 'blue'); });
    $('#btn-minus-blue').on('click', function() { addScore(-1, 'blue'); });
    $('#btn-plus-red').on('click', function() { addScore(1, 'red'); });
    $('#btn-minus-red').on('click', function() { addScore(-1, 'red'); });

    $('#match-complete').on('change', function() {
        if (!currentMatch) {
            return;
        }

        currentMatch.complete = $(this).prop('checked');
        saveTournamentData(true);
        updateMatchNumber(getStageMatchNumber());
    });

    $('#match-complete-container').on('click', function(event) {
        if ($(event.target).is('#match-complete')) {
            return;
        }

        const checkbox = $('#match-complete');
        checkbox.prop('checked', !checkbox.prop('checked'));
        checkbox.trigger('change');
    });

    $('#view-schedule').on('click', function() {
        saveTournamentData(currentStage == 'elimination');
        window.electronAPI.changePage(currentStageData.page);
    });

    $('#prev-match').on('click', function() {
        const matchIndex = currentStageData.matches.findIndex(match => match.matchNumber == getStageMatchNumber());
        if (matchIndex > 0) {
            updateMatchNumber(currentStageData.matches[matchIndex - 1].matchNumber);
            saveTournamentData(true);
            resetScore(false);
        }
    });

    $('#next-match').on('click', function() {
        const matchIndex = currentStageData.matches.findIndex(match => match.matchNumber == getStageMatchNumber());
        if (matchIndex >= 0 && matchIndex < currentStageData.matches.length - 1) {
            updateMatchNumber(currentStageData.matches[matchIndex + 1].matchNumber);
            saveTournamentData(true);
            resetScore(false);
        }
    });

    if (currentStage == 'elimination' && currentStageData.matches.length == 0) {
        $('#match-number').text('Unavailable');
        $('#match-complete').prop('checked', false);
        $('#btn-start, #btn-stop, #btn-reset, #btn-plus-blue, #btn-minus-blue, #btn-plus-red, #btn-minus-red').prop('disabled', true);
        refreshNavState();
        scoreUpdate();
        count();
        return;
    }

    updateMatchNumber(getStageMatchNumber());
    resetScore(false);
});
