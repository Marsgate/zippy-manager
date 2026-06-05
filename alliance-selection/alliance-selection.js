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
    window.tournamentUtils.ensureTournamentDataShape(tournamentData);
    const rankings = window.tournamentUtils.buildRankings(tournamentData);

    const alliances = tournamentData.alliances;
    const alliancesTable = $('#alliances');
    const rankingsTable = $('#rankings');
    const partnerList = $('#partner-list');
    const currentSelection = $('#current-selection');
    const selectionStatus = $('#selection-status');
    const captainHeading = $('#captain-heading');
    const undoPickButton = $('#undo-pick');
    const viewBracketButton = $('#view-bracket');

    function syncEliminations() {
        if (alliances.length >= 2 && getNextCaptain(rankings, alliances) == null) {
            window.tournamentUtils.regenerateEliminationBracket(tournamentData);
            viewBracketButton.prop('disabled', false);
        } else {
            tournamentData.eliminations = {
                matches: [],
                currentMatch: 1
            };
            viewBracketButton.prop('disabled', true);
        }
    }

    function persistAndRefresh() {
        syncEliminations();
        window.electronAPI.saveTournamentData(tournamentData);
        refreshPage();
    }

    function refreshPage() {
        const nextCaptain = getNextCaptain(rankings, alliances);
        undoPickButton.prop('disabled', alliances.length == 0);

        renderAlliances(alliancesTable, alliances);
        renderRankings(rankingsTable, rankings, alliances, nextCaptain);

        if (!nextCaptain) {
            currentSelection.hide();
            if (alliances.length >= 2) {
                selectionStatus.text('Alliance selection is complete. The elimination bracket is ready.');
            } else {
                selectionStatus.text('Alliance selection needs at least two alliances to build a bracket.');
            }
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
        persistAndRefresh();
    }

    function undoLastSelection() {
        if (alliances.length == 0) {
            return;
        }

        alliances.pop();
        persistAndRefresh();
    }

    undoPickButton.on('click', undoLastSelection);
    syncEliminations();
    refreshPage();
});

$('#view-schedule').on('click', function(){
    window.electronAPI.changePage('schedule/schedule.html');
});

$('#view-bracket').on('click', function(){
    window.electronAPI.changePage('bracket/bracket.html');
});
