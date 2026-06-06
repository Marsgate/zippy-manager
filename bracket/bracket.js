function getAllianceLabel(match, color) {
    const team1 = match[color + '1'];
    const team2 = match[color + '2'];
    const seed = match[color + 'Seed'];

    if (!team1 || !team2) {
        return {
            seed: seed ? 'Seed ' + seed : 'TBD',
            teams: 'TBD'
        };
    }

    return {
        seed: 'Seed ' + seed,
        teams: team1 + ' / ' + team2
    };
}

$(async function() {
    const tournamentData = await window.electronAPI.getTournamentData();
    window.tournamentUtils.ensureTournamentDataShape(tournamentData);

    const matches = window.tournamentUtils.getVisibleEliminationMatches(tournamentData);
    const bracket = $('#bracket');
    const status = $('#bracket-status');
    const viewTimerButton = $('#view-timer');

    if (matches.length == 0) {
        status.text('Complete alliance selection to generate the elimination bracket.');
        viewTimerButton.prop('disabled', true);
        return;
    }

    const rounds = [];
    matches.forEach(match => {
        if (!rounds[match.roundIndex]) {
            rounds[match.roundIndex] = [];
        }
        rounds[match.roundIndex].push(match);
    });

    rounds.forEach(roundMatches => {
        roundMatches.sort((a, b) => a.slotIndex - b.slotIndex);
        const roundName = roundMatches[0].roundName;
        const column = $('<div class="round-column"></div>');
        column.append('<h2>' + roundName + '</h2>');

        roundMatches.forEach(match => {
            const red = getAllianceLabel(match, 'red');
            const blue = getAllianceLabel(match, 'blue');
            let classes = 'match-card';

            if (match.matchNumber == tournamentData.eliminations.currentMatch) {
                classes += ' current';
            }
            if (match.complete) {
                classes += ' complete';
            }

            let card = '<div class="' + classes + '">';
            card += '<div class="match-header">' + match.label + '</div>';
            card += '<div class="match-body">';
            card += '<div class="alliance-row"><span class="seed">' + red.seed + '</span><span class="team-list">' + red.teams + '</span><span class="score">' + match.redScore + '</span></div>';
            card += '<div class="alliance-row"><span class="seed">' + blue.seed + '</span><span class="team-list">' + blue.teams + '</span><span class="score">' + match.blueScore + '</span></div>';
            card += '</div></div>';
            column.append(card);
        });

        bracket.append(column);
    });

    const nextMatch = matches.find(match => !match.complete && match.red1 && match.red2 && match.blue1 && match.blue2);
    if (nextMatch) {
        status.text('Next match: ' + nextMatch.label + '.');
    } else {
        const finalMatch = matches[matches.length - 1];
        if (finalMatch.winnerAlliance) {
            status.text('Champion: Seed ' + finalMatch.winnerAlliance.seed + ' (' + finalMatch.winnerAlliance.captain + ' / ' + finalMatch.winnerAlliance.partner + ').');
        } else {
            status.text('Bracket generated.');
        }
    }

    window.electronAPI.saveTournamentData(tournamentData);
});

$('#view-schedule').on('click', function() {
    window.electronAPI.changePage('schedule/schedule.html');
});

$('#view-timer').on('click', async function() {
    const tournamentData = await window.electronAPI.getTournamentData();
    window.tournamentUtils.ensureTournamentDataShape(tournamentData);
    tournamentData.currentStage = 'elimination';
    window.electronAPI.saveTournamentData(tournamentData);
    window.electronAPI.changePage('timer/timer.html');
});
