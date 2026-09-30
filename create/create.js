let schedule = [];
let teamArray = [];

function normalizeTeamList(rawValue) {
    return rawValue
        .trim()
        .replaceAll(' ', '')
        .replaceAll('\t', '')
        .split('\n')
        .map(teamName => teamName.toUpperCase())
        .filter(teamName => teamName !== '');
}

function showError(message) {
    $('#error').text(message);
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

    $('#schedule-empty').hide();
    $('#schedule-container').show();
    $('#create-btn').show();
}

function reportExtraMatches(totalMatchCount) {
    const extraTeams = teamArray.filter(team => team.matchCount > totalMatchCount);
    showError(extraTeams.length === 0
        ? ''
        : 'The match count does not divide evenly, so these teams play one extra match: ' +
            extraTeams.map(team => team.name).join(', '));
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

    const maxLength = window.tournamentUtils.MAX_TEAM_NAME_LENGTH;
    const tooLong = teamNameArray.filter(teamName => teamName.length > maxLength);
    if (tooLong.length > 0) {
        showError('Team names can be at most ' + maxLength + ' characters: ' + tooLong.join(', '));
        return;
    }

    const result = window.scheduleUtils.generateSchedule(teamNameArray, totalMatchCount);
    schedule = result.matches.map(match => Object.assign(match, { redScore: 0, blueScore: 0, complete: false }));
    teamArray = result.teams;

    reportExtraMatches(totalMatchCount);
    renderSchedule();
}

// Suggests matches-per-team values (4-8) that give every team the same number of
// matches: teams x matches must fill whole 4-team matches.
const SUGGESTED_MATCH_COUNTS = [4, 5, 6, 7, 8];

function renderMatchSuggestions() {
    const teamCount = normalizeTeamList($('#team-list').val()).length;
    const current = parseInt($('#match-count').val(), 10);
    const box = $('#match-suggest');

    if (teamCount < 4) {
        box.prop('hidden', true);
        return;
    }

    const even = SUGGESTED_MATCH_COUNTS.filter(count => (teamCount * count) % 4 === 0);
    box.empty().prop('hidden', false);
    $('<span class="suggest-label"/>')
        .text('Divides evenly for ' + teamCount + ' teams:')
        .appendTo(box);
    even.forEach(count => {
        $('<button type="button" class="chip"/>')
            .text(count)
            .attr('title', (teamCount * count / 4) + ' matches total')
            .toggleClass('active', count === current)
            .on('click', () => {
                $('#match-count').val(count);
                renderMatchSuggestions();
            })
            .appendTo(box);
    });
    if (Number.isInteger(current) && current > 0 && (teamCount * current) % 4 !== 0) {
        $('<span class="suggest-warn"/>')
            .text(current + ' leaves some teams with an extra match')
            .appendTo(box);
    }
}

$('#team-list, #match-count').on('input', renderMatchSuggestions);

$('#gen-btn').on('click', generateSchedule);

$('#create-btn').on('click', () => {
    window.electronAPI.createTournament(window.tournamentUtils.createTournamentData(schedule, teamArray));
});
