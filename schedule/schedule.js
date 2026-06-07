function getScheduleRowClass(match, currentMatch) {
    if (match.matchNumber === currentMatch) {
        return 'current';
    }

    return match.complete ? 'complete' : '';
}

window.pageUtils.runTournamentPage(function({ data, save, goTo, setStageAndGoToTimer }) {
    const rankings = window.tournamentUtils.buildRankings(data);
    const hasBracket = data.eliminations.matches.length > 0;
    const bracketButton = $('#view-bracket');

    window.domUtils.replaceTableBodyRows(
        $('#schedule'),
        data.schedule.map(match =>
            window.domUtils.createTableRow(
                [
                    match.matchNumber,
                    match.red1,
                    match.red2,
                    match.blue1,
                    match.blue2,
                    match.redScore,
                    match.blueScore
                ],
                getScheduleRowClass(match, data.currentMatch)
            )
        )
    );

    window.domUtils.replaceTableBodyRows(
        $('#rankings'),
        rankings.map((team, index) =>
            window.domUtils.createTableRow([index + 1, team.name, team.win, team.loss, team.tie, team.score])
        )
    );

    bracketButton.prop('disabled', !hasBracket);
    if (!hasBracket) {
        bracketButton.val('Bracket Unavailable');
    }

    save();

    $('#view-timer').on('click', function() {
        setStageAndGoToTimer('qualification');
    });

    $('#view-alliance-selection').on('click', function() {
        goTo('alliance-selection/alliance-selection.html');
    });

    $('#view-bracket').on('click', function() {
        goTo('bracket/bracket.html');
    });
});
