$(async function(){
    let tournamentData = await window.electronAPI.getTournamentData();

    let currentMatch = null;

    function updateMatchNumber(matchNumber) {
        $('#match-number').text(matchNumber);
        tournamentData.currentMatch = matchNumber;
        currentMatch = tournamentData.schedule.find(match => match.matchNumber == tournamentData.currentMatch);
        $('#match-complete').prop('checked', currentMatch.complete);
    }

    updateMatchNumber(tournamentData.currentMatch);

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
        minutes = parseInt(currentTime / 60, 10);
        seconds = parseInt(currentTime % 60, 10);

        minutes = minutes < 10 ? "" + minutes : minutes;
        seconds = seconds < 10 ? "0" + seconds : seconds;

        (display).text(minutes + ":" + seconds);

        
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
        if (counting == false) {
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

    function resetScore(reset = true) {
        counting = false;
        currentTime = matchTime;
        if (reset) {
            currentMatch.redScore = 0;
            currentMatch.blueScore = 0;
        }
        scoreUpdate();
        count();
    }
    resetScore(false);

    $('#btn-reset').on('click', function() {
        resetScore();
    });

    function scoreUpdate() {
        redScoreDisplay.text(currentMatch.redScore);
        blueScoreDisplay.text(currentMatch.blueScore);
    }

    function addScore(score, color) {
        
        if (color == 'red') {
            currentMatch.redScore += score;
        } else {
            currentMatch.blueScore += score;
        }

        scoreUpdate();
    }

    $(document).on('keydown', function() {
        holdingShift = true;
    })

    $(document).on('keyup', function() {
        holdingShift = false;
    })

    $('#btn-plus-blue').on('click', function() {addScore(1, 'blue');});
    $('#btn-minus-blue').on('click', function() {addScore(-1, 'blue');});

    $('#btn-plus-red').on('click', function() {addScore(1, 'red');});
    $('#btn-minus-red').on('click', function() {addScore(-1, 'red');});


    $('#match-complete-container').on('click', function(event) {
        currentMatch.complete = !currentMatch.complete;
        $('#match-complete').prop('checked', currentMatch.complete);
    });

    function saveTournamentData() {
        window.electronAPI.saveTournamentData(tournamentData);
    }

    $('#view-schedule').on('click', function() {
        window.electronAPI.changePage('schedule/schedule.html');
        saveTournamentData();
    });
    $('#prev-match').on('click', function() {
        if (tournamentData.currentMatch > 1) {
            updateMatchNumber(tournamentData.currentMatch-1)
            saveTournamentData();
            resetScore(false);
        }
    });
    $('#next-match').on('click', function() {
        if (tournamentData.currentMatch < tournamentData.schedule.length){
            updateMatchNumber(tournamentData.currentMatch+1)
            saveTournamentData();
            resetScore(false);
        }
    });
});
