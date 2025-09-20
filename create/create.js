let schedule = [];
let teamArray = [];

$('#gen-btn').on('click', () => {
    // get data from DOM
    let totalMatchCount = $('#match-count').val();
    let teamList = $('#team-list').val();

    // remove white space
    teamList.trim();
    teamList = teamList.replaceAll(' ', '');
    teamList = teamList.replaceAll('\t', ''); 

    // split teams by newline
    let teamNameArray = teamList.split('\n');

    // input validation
    if (!totalMatchCount > 0) {
        $('#error').text('You must have at least 1 match.');
        return;
    }
    if (teamNameArray.length < 4) {
        $('#error').text('You must have at least 4 teams.');
        return;
    }

    success = false;
    do {
        try {
            success = scheduleGen(totalMatchCount, teamNameArray);
        } catch {}
    } while (success == false);
});

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    // Generate a random index j between 0 and i (inclusive)
    const j = Math.floor(Math.random() * (i + 1));

    // Swap elements at index i and j
    const temp = array[i];
    array[i] = array[j];
    array[j] = temp;
  }
  return array; // Return the shuffled array (optional, as it's modified in-place)
}

function scheduleGen(totalMatchCount, teamNameArray) {
    
    // create and populate team array
    teamArray = [];
    teamNameArray.forEach(teamName => {
        teamArray.push({
            'name': teamName,
            'matchCount': 0
        });
    });

    let lastMatch = [];
    let lastMatch2 = []; 

    let matchNumber = 1;

    let targetMatchCount = 1;

    schedule = [];

    while (true) {
        let match = [];

        // get a list of teams that are below the target match count
        let availableTeams = [];
        teamArray.forEach(team => {
            if (
                team.matchCount <= totalMatchCount
                && (
                    lastMatch.includes(team)
                    && lastMatch2.includes(team)
                ) == false
            ) {
                availableTeams.push(team);
            }
        });

        // look for teams already at the target count if less than 4 teams
        if (availableTeams.length < 4) {
            teamArray.forEach(team => {
                if (
                    team.matchCount > targetMatchCount
                ) {
                    availableTeams.push(team);
                }
            });
        }


        // create match from 4 random available teams
        availableTeams = shuffleArray(availableTeams);
        for (i=0;i<4;i++) {
            match.push(availableTeams[i]);
        }

        // place match on schedule
        let matchData = {
            'matchNumber': matchNumber,
            'red1': match[0].name,
            'red2': match[1].name,
            'blue1': match[2].name,
            'blue2': match[3].name,
            'redScore': 0,
            'blueScore': 0,
            'complete': false
        }
        schedule.push(matchData);

        // update variables before next iteration
        matchNumber ++; 
        lastMatch2 = lastMatch;
        lastMatch = match;
        match.forEach(team => {
            team.matchCount ++;
        });

        // conditionally increment target match count
        if (teamArray.every((team) => team.matchCount >= targetMatchCount)) {
            targetMatchCount ++;
        }

        // exit the loop when all teams have played their matches
        if (targetMatchCount > totalMatchCount) {
            break;
        }

    }

    success = (teamArray
    .filter((team) => team.matchCount > totalMatchCount)
    .length < 4);

    if (success) {
        let scheduleTable = $('#schedule');

        // delete old data
        scheduleTable.find("tr:gt(0)").remove();

        // write data to match schedule table
        schedule.forEach(matchData => {
            element = '<tr>';
            element += '<td>' + matchData.matchNumber + '</td>';
            element += '<td>' + matchData.red1 + '</td>';
            element += '<td>' + matchData.red2 + '</td>';
            element += '<td>' + matchData.blue1 + '</td>';
            element += '<td>' + matchData.blue2 + '</td>';
            element += '</tr>';
            scheduleTable.append(element);
        });

        $('#schedule-container').show();
        $('#create-btn').show();
    }

    return success;
}

$('#create-btn').on('click', () => {
    matchObjectArray = [];

    tournamentData = {
        'schedule': schedule,
        'teams': teamArray,
        'currentMatch': 1
    };
    
    // send data to backend
    window.electronAPI.createTournament(tournamentData);
});
