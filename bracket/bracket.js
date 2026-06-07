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

function buildAllianceRow(alliance, score) {
    const row = window.domUtils.createElement('div', { className: 'alliance-row' });
    row.appendChild(window.domUtils.createElement('span', { className: 'seed', text: alliance.seed }));
    row.appendChild(window.domUtils.createElement('span', { className: 'team-list', text: alliance.teams }));
    row.appendChild(window.domUtils.createElement('span', { className: 'score', text: score }));
    return row;
}

function buildMatchCard(match, currentMatch) {
    const red = getAllianceLabel(match, 'red');
    const blue = getAllianceLabel(match, 'blue');
    const classes = ['match-card'];

    if (match.matchNumber === currentMatch) {
        classes.push('current');
    }

    if (match.complete) {
        classes.push('complete');
    }

    const card = window.domUtils.createElement('div', { className: classes.join(' ') });
    const body = window.domUtils.createElement('div', { className: 'match-body' });

    card.appendChild(window.domUtils.createElement('div', { className: 'match-header', text: match.label }));
    body.appendChild(buildAllianceRow(red, match.redScore));
    body.appendChild(buildAllianceRow(blue, match.blueScore));
    card.appendChild(body);

    return card;
}

function groupMatchesByRound(matches) {
    return matches.reduce((rounds, match) => {
        if (!rounds[match.roundIndex]) {
            rounds[match.roundIndex] = [];
        }

        rounds[match.roundIndex].push(match);
        return rounds;
    }, []);
}

window.pageUtils.runTournamentPage(function({ data, save, goTo, setStageAndGoToTimer }) {
    const matches = window.tournamentUtils.getVisibleEliminationMatches(data);
    const bracket = $('#bracket');
    const viewTimerButton = $('#view-timer');

    if (matches.length === 0) {
        viewTimerButton.prop('disabled', true);
    } else {
        groupMatchesByRound(matches).forEach(roundMatches => {
            roundMatches.sort((a, b) => a.slotIndex - b.slotIndex);

            const column = $(window.domUtils.createElement('div', { className: 'round-column' }));
            column.append(window.domUtils.createElement('h2', { text: roundMatches[0].roundName }));

            roundMatches.forEach(match => {
                column.append(buildMatchCard(match, data.eliminations.currentMatch));
            });

            bracket.append(column);
        });
    }

    save();

    $('#view-schedule').on('click', function() {
        goTo('schedule/schedule.html');
    });

    $('#view-timer').on('click', function() {
        setStageAndGoToTimer('elimination');
    });
});
