window.pageUtils.runTournamentPage(function({ data, save, goTo }) {
    const matchTime = 120;
    const stageName = data.currentStage === 'elimination' ? 'elimination' : 'qualification';
    const stage = stageName === 'elimination'
        ? {
            matches: window.tournamentUtils.getVisibleEliminationMatches(data),
            page: 'bracket/bracket.html',
            button: 'View Bracket',
            prefix: 'E'
        }
        : {
            matches: data.schedule,
            page: 'schedule/schedule.html',
            button: 'View Schedule',
            prefix: 'Q'
        };

    const controls = $('#btn-start, #btn-stop, #btn-reset, #btn-plus-blue, #btn-minus-blue, #btn-plus-red, #btn-minus-red');
    const prevButton = $('#prev-match');
    const nextButton = $('#next-match');
    const matchComplete = $('#match-complete');
    const matchNumber = $('#match-number');
    const redScoreDisplay = $('#red .score p');
    const blueScoreDisplay = $('#blue .score p');
    const display = $('#timer');

    const startAudio = new Audio('soundeffects/Start.mp3');
    const stopAudio = new Audio('soundeffects/Stop.wav');
    const endAudio = new Audio('soundeffects/End.wav');

    let currentTime = matchTime;
    let counting = false;

    function getStageState() {
        return stageName === 'elimination' ? data.eliminations : data;
    }

    function getMatchIndex() {
        return stage.matches.findIndex(match => match.matchNumber === getStageState().currentMatch);
    }

    function getCurrentMatch() {
        return stage.matches[getMatchIndex()] || null;
    }

    function saveTournament(preserveViewedMatch = false) {
        if (stageName !== 'elimination') {
            save();
            return;
        }

        const viewedMatch = preserveViewedMatch ? getStageState().currentMatch : null;
        window.tournamentUtils.updateEliminationProgress(data);
        if (viewedMatch !== null) {
            data.eliminations.currentMatch = viewedMatch;
        }
        save();
    }

    function renderTime() {
        const minutes = Math.floor(currentTime / 60);
        const seconds = String(currentTime % 60).padStart(2, '0');
        display.text(minutes + ':' + seconds);
    }

    function renderMatch() {
        const match = getCurrentMatch();
        const matchIndex = getMatchIndex();

        prevButton.prop('disabled', matchIndex <= 0);
        nextButton.prop('disabled', matchIndex === -1 || matchIndex >= stage.matches.length - 1);

        if (!match) {
            matchNumber.text('Unavailable');
            matchComplete.prop('checked', false);
            redScoreDisplay.text(0);
            blueScoreDisplay.text(0);
            return;
        }

        matchNumber.text(match.label || (stage.prefix + match.matchNumber));
        matchComplete.prop('checked', match.complete);
        redScoreDisplay.text(match.redScore);
        blueScoreDisplay.text(match.blueScore);
    }

    function stopTimer() {
        counting = false;
    }

    function resetTimer(resetScore = true) {
        const match = getCurrentMatch();

        stopTimer();
        currentTime = matchTime;

        if (resetScore && match) {
            match.redScore = 0;
            match.blueScore = 0;
            if (stageName === 'elimination') {
                match.complete = false;
            }
        }

        renderMatch();
        renderTime();
    }

    function tick() {
        renderTime();

        if (!counting) {
            return;
        }

        currentTime--;
        if (currentTime < 0) {
            currentTime = 0;
            counting = false;
            endAudio.play();
            renderTime();
            return;
        }

        setTimeout(tick, 1000);
    }

    function moveToMatch(offset) {
        const nextMatch = stage.matches[getMatchIndex() + offset];
        if (!nextMatch) {
            return;
        }

        getStageState().currentMatch = nextMatch.matchNumber;
        renderMatch();
        saveTournament(true);
        resetTimer(false);
    }

    function addScore(value, color) {
        const match = getCurrentMatch();
        if (!match) {
            return;
        }

        match[color + 'Score'] += value;
        renderMatch();
    }

    function bindScoreButton(selector, value, color) {
        $(selector).on('click', function() {
            addScore(value, color);
        });
    }

    $('#view-schedule').val(stage.button);

    if (stageName === 'elimination' && stage.matches.length === 0) {
        controls.prop('disabled', true);
        renderMatch();
        renderTime();
    } else {
        controls.prop('disabled', false);
        renderMatch();
        resetTimer(false);
    }

    $('#btn-start').on('click', function() {
        if (counting || !getCurrentMatch()) {
            return;
        }

        startAudio.play();
        counting = true;
        tick();
    });

    $('#btn-stop').on('click', function() {
        if (counting) {
            stopAudio.play();
            currentTime++;
        }

        stopTimer();
        renderTime();
    });

    $('#btn-reset').on('click', function() {
        resetTimer();
    });

    bindScoreButton('#btn-plus-blue', 1, 'blue');
    bindScoreButton('#btn-minus-blue', -1, 'blue');
    bindScoreButton('#btn-plus-red', 1, 'red');
    bindScoreButton('#btn-minus-red', -1, 'red');

    matchComplete.on('change', function() {
        const match = getCurrentMatch();
        if (!match) {
            return;
        }

        match.complete = $(this).prop('checked');
        saveTournament(true);
        renderMatch();
    });

    $('#match-complete-container').on('click', function(event) {
        if ($(event.target).is('#match-complete')) {
            return;
        }

        matchComplete.prop('checked', !matchComplete.prop('checked'));
        matchComplete.trigger('change');
    });

    $('#view-schedule').on('click', function() {
        saveTournament(stageName === 'elimination');
        goTo(stage.page);
    });

    $('#prev-match').on('click', function() {
        moveToMatch(-1);
    });

    $('#next-match').on('click', function() {
        moveToMatch(1);
    });
});
