$(async function(){
    const tournamentData = await window.electronAPI.getTournamentData();

    let schedule = tournamentData.schedule;
    let teamArray = tournamentData.teams;
    
    let scheduleTable = $('#schedule');
    let rankingTable = $('#rankings');

    // clear wins and losses for recalculating
    rankings = [];
    teamArray.forEach(team => {
        rankings.push({
            'name': team.name,
            'score': 0,
            'win': 0,
            'loss': 0,
            'tie': 0
        })
    });


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

        // check if match complete
        if (matchData.complete == false) {
            return; // do not score unfinished matches
        }

        // find teams
        let red1 = rankings.find(team => team.name == matchData.red1);
        let red2 = rankings.find(team => team.name == matchData.red2);
        let blue1 = rankings.find(team => team.name == matchData.blue1);
        let blue2 = rankings.find(team => team.name == matchData.blue2);
        
        // add scores to team array
        red1.score += matchData.redScore;
        red2.score += matchData.redScore;
        blue1.score += matchData.blueScore;
        blue2.score += matchData.blueScore;

        // add win/loss/tie
        if (matchData.redScore > matchData.blueScore) {
            red1.win ++;
            red2.win ++;
            blue1.loss ++;
            blue2.loss ++;
        } else if (matchData.redScore < matchData.blueScore) {
            red1.loss ++;
            red2.loss ++;
            blue1.win ++;
            blue2.win ++;
        } else {
            red1.tie ++;
            red2.tie ++;
            blue1.tie ++;
            blue2.tie ++;
        }
    });

    // sort teams by wins
    rankings.sort((a,b) => {
        let wpDif = (b.win - a.win)*2 + b.tie - a.tie; // wins = 2wp, ties = 1wp
        if (wpDif != 0) {
            return wpDif; // if there is a difference in wp, return it
        }
        return b.score - a.score; // if two teams have the same wp, tie break with total score
    });

    // write ranking data
    for(i=0;i<rankings.length;i++) {
        let team = rankings[i];
        element = '<tr>';
        element += '<td>' + i + '</td>';
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