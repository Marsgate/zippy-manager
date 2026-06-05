function buildRankings(tournamentData) {
    const rankings = [];

    tournamentData.teams.forEach(team => {
        rankings.push({
            name: team.name,
            score: 0,
            win: 0,
            loss: 0,
            tie: 0
        });
    });

    tournamentData.schedule.forEach(matchData => {
        if (matchData.complete == false) {
            return;
        }

        const red1 = rankings.find(team => team.name == matchData.red1);
        const red2 = rankings.find(team => team.name == matchData.red2);
        const blue1 = rankings.find(team => team.name == matchData.blue1);
        const blue2 = rankings.find(team => team.name == matchData.blue2);

        red1.score += matchData.redScore;
        red2.score += matchData.redScore;
        blue1.score += matchData.blueScore;
        blue2.score += matchData.blueScore;

        if (matchData.redScore > matchData.blueScore) {
            red1.win++;
            red2.win++;
            blue1.loss++;
            blue2.loss++;
        } else if (matchData.redScore < matchData.blueScore) {
            red1.loss++;
            red2.loss++;
            blue1.win++;
            blue2.win++;
        } else {
            red1.tie++;
            red2.tie++;
            blue1.tie++;
            blue2.tie++;
        }
    });

    rankings.sort((a, b) => {
        const wpDif = (b.win - a.win) * 2 + b.tie - a.tie;
        if (wpDif != 0) {
            return wpDif;
        }
        return b.score - a.score;
    });

    return rankings;
}

$(async function(){
    const tournamentData = await window.electronAPI.getTournamentData();

    const schedule = tournamentData.schedule;
    const rankings = buildRankings(tournamentData);
    
    const scheduleTable = $('#schedule');
    const rankingTable = $('#rankings');

    schedule.forEach(matchData => {
        // write schedule data
        if (matchData.matchNumber == tournamentData.currentMatch) {
            element = '<tr class="current">';
        } else if (matchData.complete == true){
            element = '<tr class="complete">';
        } else {
            element = '<tr>';
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

    // write ranking data
    for (let i = 0; i < rankings.length; i++) {
        let team = rankings[i];
        element = '<tr>';
        element += '<td>' + (i + 1) + '</td>';
        element += '<td>' + team.name + '</td>';
        element += '<td>' + team.win + '</td>';
        element += '<td>' + team.loss + '</td>';
        element += '<td>' + team.tie + '</td>';
        element += '<td>' + team.score + '</td>';
        element += '</tr>';
        rankingTable.append(element);
    }
});

$('#view-timer').on('click', function(){
    window.electronAPI.changePage('timer/timer.html');
});

$('#view-alliance-selection').on('click', function(){
    window.electronAPI.changePage('alliance-selection/alliance-selection.html');
});
