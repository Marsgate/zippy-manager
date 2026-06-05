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
    extraMatchTolerance = 0
    loopCount = 0;
    do {
        success = scheduleGen(totalMatchCount, teamNameArray, extraMatchTolerance);
        loopCount ++;
        if (loopCount > 1000) {
            extraMatchTolerance ++;
            loopCount = 0;
        }
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

function findMatch(availableAlliances) {
    let match = [];

    availableAlliances = shuffleArray(availableAlliances);

    availableAlliances.forEach(alliance => {
        // check if the match has 4 teams
        if (match.length == 4) {
            return;
        }

        // check if any of the teams are already in the match
        if (
            match.includes(alliance.team1)
            || match.includes(alliance.team2)
        ) {
            return;
        }

        // add the teams
        match.push(alliance.team1);
        match.push(alliance.team2);
        alliance.playedCount ++;
    });

    if (match.length < 4) {
        return null;
    }

    return match;
}

function scheduleGen(totalMatchCount, teamNameArray, extraMatchTolerance) {
    
    // create and populate team array
    teamArray = [];
    teamNameArray.forEach(teamName => {
        teamArray.push({
            'name': teamName,
            'matchCount': 0
        });
    });

    // create an alliance array
    // an alliance is any combination of 2 teams
    allianceArray = [];
    teamArray.forEach((team1, teamIndex1) => {
        teamArray.forEach((team2, teamIndex2) => {
            alliance = {
                'team1': team1,
                'team2': team2,
                'playedCount': 0
            };

            if (
                teamIndex1 < teamIndex2 // prevents pairing up 1, 2 and then 2, 1, etc
                && !allianceArray.includes(alliance)
            ) {
                allianceArray.push(alliance);
            }
        });
    });

    let lastMatch = [];
    let lastMatch2 = []; 

    let matchNumber = 1;

    let targetMatchCount = 1;

    schedule = [];
    

    while (true) {

        let match = [];

        let availableAlliances = [];

        let selectionLoopCount = 1;

        // loop through selection logic with decreasingly strict criteria until we get 2 alliances
        do {
            // loop through alliances and add any that meet the conditions to available alliances
            allianceArray.forEach(alliance => {
                // skip alliances that are already available
                if (availableAlliances.includes(alliance)) {
                    return;
                }

                // check if teams played in last 2 matches
                const playedBackToBack = (
                    lastMatch.includes(alliance.team1) && lastMatch2.includes(alliance.team1)
                ) || (
                    lastMatch.includes(alliance.team2) && lastMatch2.includes(alliance.team2)
                );

                // conditions based on selection loop
                let meetsConditions = false;
                switch (selectionLoopCount) {
                    case 1: // Both teams under target match count
                        meetsConditions = alliance.playedCount == 0 
                            && alliance.team1.matchCount < targetMatchCount
                            && alliance.team2.matchCount < targetMatchCount
                            && !playedBackToBack;
                        break;
                    case 2: // One team at or over target match count
                        meetsConditions = alliance.playedCount == 0 
                            && (alliance.team1.matchCount < targetMatchCount 
                                || alliance.team2.matchCount < targetMatchCount)
                            && (alliance.team1.matchCount >= targetMatchCount 
                                || alliance.team2.matchCount >= targetMatchCount)
                            && !playedBackToBack;
                        break;
                    case 3: // Alliance has only played once
                        meetsConditions = alliance.playedCount <= 1 
                            && (alliance.team1.matchCount < targetMatchCount 
                                || alliance.team2.matchCount < targetMatchCount)
                            && !playedBackToBack;
                        break;
                    case 4: // Both teams at target match count
                        meetsConditions = alliance.playedCount <= 1 && !playedBackToBack;
                        break;
                    case 5: // Any teams that haven't played together more than once
                        meetsConditions = alliance.playedCount <= 1;
                        break;
                    case 6: // Any alliance
                        meetsConditions = true;
                        break;
                }

                if (meetsConditions) {
                    availableAlliances.push(alliance);
                }
            });

            selectionLoopCount++;

            match = findMatch(availableAlliances); // attempt to find a match from the available alliances

        } while (match == null);

        // shuffle the colors and team order for added randomness!
        flipAllianceColors = (Math.random() > .5);
        flipRedOrder = (Math.random() > .5);
        flipBlueOrder = (Math.random() > .5);

        if (flipAllianceColors) {
            let temp = match[0];
            match[0] = match[2];
            match[2] = match[1];
            match[1] = match[3];
            match[3] = temp;
        }

        if (flipRedOrder) {
            let temp = match[0];
            match[0] = match[1];
            match[1] = temp;
        }

        if (flipBlueOrder) {
            let temp = match[2];
            match[2] = match[3];
            match[3] = temp;
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

    let scheduleTable = $('#schedule');

    success = (teamArray
    .filter((team) => team.matchCount > totalMatchCount)
    .length <= extraMatchTolerance);

    if (success) {
        
        let overplayedTeams = teamArray.filter(t => t.matchCount > totalMatchCount);
        if (overplayedTeams.length) {
            let names = overplayedTeams.map(t => t.name).join(', ');
            $('#error').text(`Extra matches generated for: ${names}`);
        } else {
            $('#error').text('');
        }

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
        'currentMatch': 1,
        'alliances': [],
        'currentStage': 'qualification',
        'eliminations': {
            'matches': [],
            'currentMatch': 1
        }
    };
    
    // send data to backend
    window.electronAPI.createTournament(tournamentData);
});
