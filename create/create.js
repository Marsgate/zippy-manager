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
            success = true; // test
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

    // create an alliance array
    // an alliance is any combination of 2 teams
    // each match is made up of 2 unique alliances that have (ideally) not played a qualification together yet
    allianceArray = [];
    teamArray.forEach((team1, teamIndex1) => {
        teamArray.forEach((team2, teamIndex2) => {
            alliance = {
                'team1': team1,
                'team2': team2,
                'hasPlayed': false
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
        while (availableAlliances.length < 2) {

            allianceArray.forEach(alliance => {
                
                // skip alliances that are already available from a previous iteration
                if (availableAlliances.includes(alliance)) {
                    return;
                }

                /* loop 1
                - Alliance hasn't played yet
                - both teams are below the target match count
                */
                if (selectionLoopCount == 1) {
                    if (
                        alliance.hasPlayed == false
                        && alliance.team1.matchCount < targetMatchCount
                        && alliance.team2.matchCount < targetMatchCount
                    ) {
                        availableAlliances.push(alliance);
                    }
                } 
                
                /* loop 2
                    - Alliance hasn't played yet
                    - 1 team is below the target match count
                */
                if (selectionLoopCount == 2) {
                    if (
                        alliance.hasPlayed == false
                        && (
                            alliance.team1.matchCount < targetMatchCount
                            || alliance.team2.matchCount < targetMatchCount
                        )
                    ) {
                        availableAlliances.push(alliance);
                    }
                } 
                
                /* loop 3
                    - Alliance hasn't played yet
                    - Neither team is below the target match count
                */
                if (selectionLoopCount == 3) {
                    if (
                        alliance.hasPlayed == false
                    ) {
                        availableAlliances.push(alliance);
                    }
                }

                /* loop 4
                    - any alliance
                */
                if (selectionLoopCount == 4) {
                    availableAlliances.push(alliance);
                }

            });

            selectionLoopCount ++;
        }

        // create match from 2 random available alliances
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
            alliance.hasPlayed = true;
        });

        // shuffle the colors and team order for added randomness!
        flipAllianceColors = Math.random() > .5;
        flipRedOrder = Math.random() > .5;
        flipBlueOrder = Math.random() > .5;

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

    // success = (teamArray
    // .filter((team) => team.matchCount > totalMatchCount)
    // .length < 4);

    success = true;

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
