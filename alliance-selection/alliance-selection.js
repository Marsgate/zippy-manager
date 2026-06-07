function getSelectedTeams(alliances) {
    return alliances.flatMap(alliance => [alliance.captain, alliance.partner]);
}

function getRemainingTeams(rankings, alliances) {
    const pickedTeams = new Set(getSelectedTeams(alliances));
    return rankings.filter(team => !pickedTeams.has(team.name));
}

function getNextCaptain(rankings, alliances) {
    const remainingTeams = getRemainingTeams(rankings, alliances);
    return remainingTeams.length >= 2 ? remainingTeams[0] : null;
}

function renderAlliances(table, alliances) {
    window.domUtils.replaceTableBodyRows(
        table,
        alliances.map((alliance, index) =>
            window.domUtils.createTableRow([index + 1, alliance.captain, alliance.partner])
        )
    );
}

function getRankingStatus(team, pickedTeams, nextCaptain) {
    if (nextCaptain && team.name === nextCaptain.name) {
        return { label: 'Current Captain', className: 'captain-team' };
    }

    if (pickedTeams.has(team.name)) {
        return { label: 'Selected', className: 'selected-team' };
    }

    return { label: 'Available', className: '' };
}

function renderRankings(table, rankings, alliances, nextCaptain) {
    const pickedTeams = new Set(getSelectedTeams(alliances));
    window.domUtils.replaceTableBodyRows(
        table,
        rankings.map((team, index) => {
            const status = getRankingStatus(team, pickedTeams, nextCaptain);
            return window.domUtils.createTableRow(
                [index + 1, team.name, team.win, team.loss, team.tie, team.score, status.label],
                status.className
            );
        })
    );
}

function renderPartnerOptions(partnerList, nextCaptain, rankings, alliances, saveSelection) {
    partnerList.empty();

    getRemainingTeams(rankings, alliances)
        .filter(team => team.name !== nextCaptain.name)
        .forEach(team => {
            $('<input type="button"/>')
                .val('Select ' + team.name)
                .on('click', function() {
                    saveSelection(nextCaptain.name, team.name);
                })
                .appendTo(partnerList);
        });
}

window.pageUtils.runTournamentPage(function({ data, save, goTo }) {
    const rankings = window.tournamentUtils.buildRankings(data);
    const alliances = data.alliances;

    const alliancesTable = $('#alliances');
    const rankingsTable = $('#rankings');
    const partnerList = $('#partner-list');
    const currentSelection = $('#current-selection');
    const status = $('#selection-status');
    const captainHeading = $('#captain-heading');
    const undoButton = $('#undo-pick');
    const bracketButton = $('#view-bracket');

    function syncEliminations() {
        if (alliances.length >= 2 && getNextCaptain(rankings, alliances) === null) {
            window.tournamentUtils.regenerateEliminationBracket(data);
            bracketButton.prop('disabled', false);
            return;
        }

        window.tournamentUtils.resetEliminations(data);
        bracketButton.prop('disabled', true);
    }

    function refreshPage() {
        const nextCaptain = getNextCaptain(rankings, alliances);
        const remainingTeams = getRemainingTeams(rankings, alliances);

        undoButton.prop('disabled', alliances.length === 0);
        renderAlliances(alliancesTable, alliances);
        renderRankings(rankingsTable, rankings, alliances, nextCaptain);

        if (!nextCaptain) {
            currentSelection.hide();

            if (alliances.length < 2) {
                status.text('Alliance selection needs at least two alliances to build a bracket.');
                return;
            }

            status.text(
                remainingTeams.length === 1
                    ? 'Alliance selection is complete. One team remains unpaired, and the elimination bracket is ready.'
                    : 'Alliance selection is complete. The elimination bracket is ready.'
            );
            return;
        }

        status.text('Selections are made in rank order using the current standings.');
        captainHeading.text('Current Captain: ' + nextCaptain.name);
        currentSelection.show();
        renderPartnerOptions(partnerList, nextCaptain, rankings, alliances, saveSelection);
    }

    function persistAndRefresh() {
        syncEliminations();
        save();
        refreshPage();
    }

    function saveSelection(captain, partner) {
        alliances.push({ captain: captain, partner: partner });
        persistAndRefresh();
    }

    function undoLastSelection() {
        if (alliances.length === 0) {
            return;
        }

        alliances.pop();
        persistAndRefresh();
    }

    syncEliminations();
    refreshPage();

    undoButton.on('click', undoLastSelection);

    $('#view-schedule').on('click', function() {
        goTo('schedule/schedule.html');
    });

    $('#view-bracket').on('click', function() {
        goTo('bracket/bracket.html');
    });
});
