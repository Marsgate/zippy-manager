let schedule = [];
let teamArray = [];
const MATCH_SELECTION_RULES = [
    { maxPlayedCount: 0, requireUnderTargetTeams: 2, avoidBackToBack: true },
    { maxPlayedCount: 0, requireUnderTargetTeams: 1, avoidBackToBack: true },
    { maxPlayedCount: 1, requireUnderTargetTeams: 1, avoidBackToBack: true },
    { maxPlayedCount: 1, requireUnderTargetTeams: 0, avoidBackToBack: true },
    { maxPlayedCount: 1, requireUnderTargetTeams: 0, avoidBackToBack: false },
    { maxPlayedCount: Infinity, requireUnderTargetTeams: 0, avoidBackToBack: false }
];

function normalizeTeamList(rawValue) {
    return rawValue
        .trim()
        .replaceAll(' ', '')
        .replaceAll('\t', '')
        .split('\n')
        .filter(teamName => teamName !== '');
}

function showError(message) {
    $('#error').text(message);
}

function shuffleArray(array) {
    for (let index = array.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
    }

    return array;
}

function createAllianceArray(teams) {
    const alliances = [];

    teams.forEach((team1, index1) => {
        teams.slice(index1 + 1).forEach(team2 => {
            alliances.push({
                team1: team1,
                team2: team2,
                playedCount: 0
            });
        });
    });

    return alliances;
}

function hasTeamInBackToBackMatches(alliance, lastMatch, priorMatch) {
    return [alliance.team1, alliance.team2].some(team =>
        lastMatch.includes(team) && priorMatch.includes(team)
    );
}

function countTeamsBelowTarget(alliance, targetMatchCount) {
    return [alliance.team1, alliance.team2].filter(team => team.matchCount < targetMatchCount).length;
}

function matchesSelectionRule(alliance, rule, targetMatchCount, lastMatch, priorMatch) {
    if (alliance.playedCount > rule.maxPlayedCount) {
        return false;
    }

    if (rule.avoidBackToBack && hasTeamInBackToBackMatches(alliance, lastMatch, priorMatch)) {
        return false;
    }

    const underTargetTeamCount = countTeamsBelowTarget(alliance, targetMatchCount);
    return underTargetTeamCount >= rule.requireUnderTargetTeams;
}

function findMatch(availableAlliances) {
    const match = [];
    const selectedAlliances = [];

    shuffleArray(availableAlliances).forEach(alliance => {
        if (match.length === 4) {
            return;
        }

        if (match.includes(alliance.team1) || match.includes(alliance.team2)) {
            return;
        }

        match.push(alliance.team1, alliance.team2);
        selectedAlliances.push(alliance);
    });

    if (match.length < 4) {
        return null;
    }

    selectedAlliances.forEach(alliance => {
        alliance.playedCount++;
    });

    return match;
}

function chooseMatch(alliances, targetMatchCount, lastMatch, priorMatch) {
    for (const rule of MATCH_SELECTION_RULES) {
        const availableAlliances = alliances.filter(alliance =>
            matchesSelectionRule(alliance, rule, targetMatchCount, lastMatch, priorMatch)
        );
        const match = findMatch(availableAlliances);
        if (match) {
            return match;
        }
    }

    return null;
}

function randomizeMatchOrder(match) {
    if (Math.random() > 0.5) {
        [match[0], match[1], match[2], match[3]] = [match[2], match[3], match[0], match[1]];
    }

    if (Math.random() > 0.5) {
        [match[0], match[1]] = [match[1], match[0]];
    }

    if (Math.random() > 0.5) {
        [match[2], match[3]] = [match[3], match[2]];
    }
}

function createMatchData(matchNumber, match) {
    return {
        matchNumber: matchNumber,
        red1: match[0].name,
        red2: match[1].name,
        blue1: match[2].name,
        blue2: match[3].name,
        redScore: 0,
        blueScore: 0,
        complete: false
    };
}

function getOverplayedTeams(totalMatchCount) {
    return teamArray.filter(team => team.matchCount > totalMatchCount);
}

function renderSchedule() {
    const scheduleTable = $('#schedule');
    window.domUtils.replaceTableBodyRows(
        scheduleTable,
        schedule.map(matchData =>
            window.domUtils.createTableRow([
                matchData.matchNumber,
                matchData.red1,
                matchData.red2,
                matchData.blue1,
                matchData.blue2
            ])
        )
    );

    $('#schedule-container').show();
    $('#create-btn').show();
}

function reportOverplayedTeams(totalMatchCount) {
    const overplayedTeams = getOverplayedTeams(totalMatchCount);
    if (overplayedTeams.length === 0) {
        showError('');
        return;
    }

    showError('Extra matches generated for: ' + overplayedTeams.map(team => team.name).join(', '));
}

function scheduleGen(totalMatchCount, teamNameArray, extraMatchTolerance) {
    teamArray = teamNameArray.map(teamName => ({
        name: teamName,
        matchCount: 0
    }));

    const allianceArray = createAllianceArray(teamArray);
    let lastMatch = [];
    let priorMatch = [];
    let matchNumber = 1;
    let targetMatchCount = 1;

    schedule = [];

    while (targetMatchCount <= totalMatchCount) {
        const match = chooseMatch(allianceArray, targetMatchCount, lastMatch, priorMatch);
        if (!match) {
            return false;
        }

        randomizeMatchOrder(match);
        schedule.push(createMatchData(matchNumber, match));

        matchNumber++;
        priorMatch = lastMatch;
        lastMatch = match;

        match.forEach(team => {
            team.matchCount++;
        });

        if (teamArray.every(team => team.matchCount >= targetMatchCount)) {
            targetMatchCount++;
        }
    }

    const success = getOverplayedTeams(totalMatchCount).length <= extraMatchTolerance;
    if (!success) {
        return false;
    }

    reportOverplayedTeams(totalMatchCount);
    renderSchedule();
    return true;
}

function generateSchedule() {
    const totalMatchCount = parseInt($('#match-count').val(), 10);
    const teamNameArray = normalizeTeamList($('#team-list').val());

    if (!Number.isInteger(totalMatchCount) || totalMatchCount <= 0) {
        showError('You must have at least 1 match.');
        return;
    }

    if (teamNameArray.length < 4) {
        showError('You must have at least 4 teams.');
        return;
    }

    if (new Set(teamNameArray).size !== teamNameArray.length) {
        showError('Team names must be unique.');
        return;
    }

    let extraMatchTolerance = 0;
    let attempts = 0;

    while (!scheduleGen(totalMatchCount, teamNameArray, extraMatchTolerance)) {
        attempts++;
        if (attempts > 1000) {
            extraMatchTolerance++;
            attempts = 0;
        }
    }
}

$('#gen-btn').on('click', generateSchedule);

$('#create-btn').on('click', () => {
    window.electronAPI.createTournament(window.tournamentUtils.createTournamentData(schedule, teamArray));
});
