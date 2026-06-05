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

function getSelectedTeams(alliances) {
    const selectedTeams = [];

    alliances.forEach(alliance => {
        selectedTeams.push(alliance.captain);
        selectedTeams.push(alliance.partner);
    });

    return selectedTeams;
}

function getNextCaptain(rankings, alliances) {
    const selectedTeams = getSelectedTeams(alliances);
    return rankings.find(team => !selectedTeams.includes(team.name)) || null;
}

function renderAlliances(alliancesTable, alliances) {
    alliancesTable.find('tr:gt(0)').remove();

    alliances.forEach((alliance, index) => {
        let element = '<tr>';
        element += '<td>' + (index + 1) + '</td>';
        element += '<td>' + alliance.captain + '</td>';
        element += '<td>' + alliance.partner + '</td>';
        element += '</tr>';
        alliancesTable.append(element);
    });
}

function renderRankings(rankingsTable, rankings, alliances, nextCaptain) {
    rankingsTable.find('tr:gt(0)').remove();

    const selectedTeams = getSelectedTeams(alliances);

    rankings.forEach((team, index) => {
        let status = 'Available';
        let rowClass = '';

        if (nextCaptain && team.name == nextCaptain.name) {
            status = 'Current Captain';
            rowClass = ' class="captain-team"';
        } else if (selectedTeams.includes(team.name)) {
            status = 'Selected';
            rowClass = ' class="selected-team"';
        }

        let element = '<tr' + rowClass + '>';
        element += '<td>' + (index + 1) + '</td>';
        element += '<td>' + team.name + '</td>';
        element += '<td>' + team.win + '</td>';
        element += '<td>' + team.loss + '</td>';
        element += '<td>' + team.tie + '</td>';
        element += '<td>' + team.score + '</td>';
        element += '<td>' + status + '</td>';
        element += '</tr>';
        rankingsTable.append(element);
    });
}

function renderPartnerOptions(partnerList, nextCaptain, rankings, alliances, saveSelection) {
    partnerList.empty();

    const selectedTeams = getSelectedTeams(alliances);
    const availablePartners = rankings.filter(team =>
        team.name != nextCaptain.name && !selectedTeams.includes(team.name)
    );

    availablePartners.forEach(team => {
        const button = $('<input type="button"/>');
        button.val('Select ' + team.name);
        button.on('click', function() {
            saveSelection(nextCaptain.name, team.name);
        });
        partnerList.append(button);
    });
}

$(async function() {
    const tournamentData = await window.electronAPI.getTournamentData();
    const rankings = buildRankings(tournamentData);

    if (!Array.isArray(tournamentData.alliances)) {
        tournamentData.alliances = [];
    }

    const alliances = tournamentData.alliances;
    const alliancesTable = $('#alliances');
    const rankingsTable = $('#rankings');
    const partnerList = $('#partner-list');
    const currentSelection = $('#current-selection');
    const selectionStatus = $('#selection-status');
    const captainHeading = $('#captain-heading');
    const undoPickButton = $('#undo-pick');

    function refreshPage() {
        const nextCaptain = getNextCaptain(rankings, alliances);
        undoPickButton.prop('disabled', alliances.length == 0);

        renderAlliances(alliancesTable, alliances);
        renderRankings(rankingsTable, rankings, alliances, nextCaptain);

        if (!nextCaptain) {
            currentSelection.hide();
            selectionStatus.text('Alliance selection is complete.');
            return;
        }

        const selectedTeams = getSelectedTeams(alliances);
        const remainingPartners = rankings.filter(team =>
            team.name != nextCaptain.name && !selectedTeams.includes(team.name)
        );

        if (remainingPartners.length == 0) {
            currentSelection.hide();
            selectionStatus.text('No valid partners remain for ' + nextCaptain.name + '.');
            return;
        }

        selectionStatus.text('Selections are made in rank order using the current standings.');
        captainHeading.text('Current Captain: ' + nextCaptain.name);
        currentSelection.show();
        renderPartnerOptions(partnerList, nextCaptain, rankings, alliances, saveSelection);
    }

    function saveSelection(captain, partner) {
        alliances.push({
            captain: captain,
            partner: partner
        });
        window.electronAPI.saveTournamentData(tournamentData);
        refreshPage();
    }

    function undoLastSelection() {
        if (alliances.length == 0) {
            return;
        }

        alliances.pop();
        window.electronAPI.saveTournamentData(tournamentData);
        refreshPage();
    }

    undoPickButton.on('click', undoLastSelection);

    refreshPage();
});

$('#view-schedule').on('click', function(){
    window.electronAPI.changePage('schedule/schedule.html');
});
