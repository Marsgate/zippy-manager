$(async function(){
    const tournamentData = await window.electronAPI.getTournamentData();
    window.tournamentUtils.ensureTournamentDataShape(tournamentData);

    const schedule = tournamentData.schedule;
    const rankings = window.tournamentUtils.buildRankings(tournamentData);
    const eliminations = tournamentData.eliminations;
    
    const scheduleTable = $('#schedule');
    const rankingTable = $('#rankings');
    const viewBracketButton = $('#view-bracket');

    schedule.forEach(matchData => {
        let element = '<tr>';
        if (matchData.matchNumber == tournamentData.currentMatch) {
            element = '<tr class="current">';
        } else if (matchData.complete == true){
            element = '<tr class="complete">';
        }
        element += '<td>' + matchData.matchNumber + '</td>';
        element += '<td>' + matchData.red1 + '</td>';
        element += '<td>' + matchData.red2 + '</td>';
        element += '<td>' + matchData.blue1 + '</td>';
        element += '<td>' + matchData.blue2 + '</td>';
        element += '<td>' + matchData.redScore + '</td>';
        element += '<td>' + matchData.blueScore + '</td>';
        element += '</tr>';
        scheduleTable.append(element);
    });

    for (let i = 0; i < rankings.length; i++) {
        const team = rankings[i];
        let element = '<tr>';
        element += '<td>' + (i + 1) + '</td>';
        element += '<td>' + team.name + '</td>';
        element += '<td>' + team.win + '</td>';
        element += '<td>' + team.loss + '</td>';
        element += '<td>' + team.tie + '</td>';
        element += '<td>' + team.score + '</td>';
        element += '</tr>';
        rankingTable.append(element);
    }

    const hasBracket = eliminations.matches.length > 0;
    viewBracketButton.prop('disabled', !hasBracket);
    if (!hasBracket) {
        viewBracketButton.val('Bracket Unavailable');
    }

    window.electronAPI.saveTournamentData(tournamentData);
});

$('#view-timer').on('click', async function(){
    const tournamentData = await window.electronAPI.getTournamentData();
    window.tournamentUtils.ensureTournamentDataShape(tournamentData);
    tournamentData.currentStage = 'qualification';
    window.electronAPI.saveTournamentData(tournamentData);
    window.electronAPI.changePage('timer/timer.html');
});

$('#view-alliance-selection').on('click', function(){
    window.electronAPI.changePage('alliance-selection/alliance-selection.html');
});

$('#view-bracket').on('click', function(){
    window.electronAPI.changePage('bracket/bracket.html');
});
