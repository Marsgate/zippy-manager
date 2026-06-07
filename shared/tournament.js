(function() {
    function createEmptyEliminations() {
        return {
            matches: [],
            currentMatch: 1
        };
    }

    function createTournamentData(schedule, teams) {
        return {
            schedule: schedule,
            teams: teams,
            currentMatch: 1,
            alliances: [],
            currentStage: 'qualification',
            eliminations: createEmptyEliminations()
        };
    }

    function buildRankings(data) {
        const rankings = data.teams.map(team => ({
            name: team.name,
            score: 0,
            win: 0,
            loss: 0,
            tie: 0
        }));

        const rankingsByName = Object.fromEntries(rankings.map(team => [team.name, team]));

        data.schedule.forEach(match => {
            if (!match.complete) {
                return;
            }

            const redTeams = [rankingsByName[match.red1], rankingsByName[match.red2]];
            const blueTeams = [rankingsByName[match.blue1], rankingsByName[match.blue2]];

            if (match.redScore > match.blueScore) {
                redTeams.forEach(team => {
                    team.score += match.redScore;
                    team.win++;
                });
                blueTeams.forEach(team => {
                    team.score += match.blueScore;
                    team.loss++;
                });
                return;
            }

            if (match.redScore < match.blueScore) {
                redTeams.forEach(team => {
                    team.score += match.redScore;
                    team.loss++;
                });
                blueTeams.forEach(team => {
                    team.score += match.blueScore;
                    team.win++;
                });
                return;
            }

            redTeams.forEach(team => {
                team.score += match.redScore;
                team.tie++;
            });
            blueTeams.forEach(team => {
                team.score += match.blueScore;
                team.tie++;
            });
        });

        rankings.sort((a, b) => {
            const winPointDifference = (b.win - a.win) * 2 + b.tie - a.tie;
            if (winPointDifference !== 0) {
                return winPointDifference;
            }

            return b.score - a.score;
        });

        return rankings;
    }

    function nextPowerOfTwo(value) {
        let power = 1;
        while (power < value) {
            power *= 2;
        }
        return power;
    }

    function buildSeedOrder(size) {
        let order = [1];

        while (order.length < size) {
            const nextSize = order.length * 2;
            const nextOrder = [];

            order.forEach(seed => {
                nextOrder.push(seed);
                nextOrder.push(nextSize + 1 - seed);
            });

            order = nextOrder;
        }

        return order;
    }

    function getRoundName(roundCount, roundIndex) {
        const roundsRemaining = roundCount - roundIndex;

        if (roundsRemaining === 1) {
            return 'Final';
        }

        if (roundsRemaining === 2) {
            return 'Semifinal';
        }

        if (roundsRemaining === 3) {
            return 'Quarterfinal';
        }

        return 'Round ' + (roundIndex + 1);
    }

    function sortMatches(a, b) {
        if (a.roundIndex !== b.roundIndex) {
            return a.roundIndex - b.roundIndex;
        }

        return a.slotIndex - b.slotIndex;
    }

    function setSide(match, color, alliance) {
        match[color + '1'] = alliance ? alliance.captain : '';
        match[color + '2'] = alliance ? alliance.partner : '';
        match[color + 'Seed'] = alliance ? alliance.seed : null;
    }

    function getSide(match, color) {
        return {
            seed: match[color + 'Seed'],
            captain: match[color + '1'],
            partner: match[color + '2']
        };
    }

    function sideIsReady(match, color) {
        return Boolean(match[color + '1'] && match[color + '2']);
    }

    function clearResult(match) {
        match.complete = false;
        match.redScore = 0;
        match.blueScore = 0;
        match.winnerAlliance = null;
        match.winnerSeed = null;
        match.isBye = false;
    }

    function updateWinner(match, winnerAlliance, isBye) {
        match.winnerAlliance = winnerAlliance;
        match.winnerSeed = winnerAlliance ? winnerAlliance.seed : null;
        match.isBye = isBye;
    }

    function determineWinner(match) {
        if (!match.complete || match.redScore === match.blueScore) {
            return null;
        }

        return getSide(match, match.redScore > match.blueScore ? 'red' : 'blue');
    }

    function createEliminationBracket(alliances) {
        const seededAlliances = alliances.map((alliance, index) => ({
            seed: index + 1,
            captain: alliance.captain,
            partner: alliance.partner
        }));

        if (seededAlliances.length < 2) {
            return createEmptyEliminations();
        }

        const bracketSize = nextPowerOfTwo(seededAlliances.length);
        const roundCount = Math.log2(bracketSize);
        const seededSlots = buildSeedOrder(bracketSize).map(seed =>
            seededAlliances.find(alliance => alliance.seed === seed) || null
        );

        const matches = [];
        const rounds = [];
        let matchNumber = 1;

        for (let roundSize = bracketSize, roundIndex = 0; roundSize > 1; roundSize /= 2, roundIndex++) {
            const matchCount = roundSize / 2;
            const round = [];

            for (let slotIndex = 0; slotIndex < matchCount; slotIndex++) {
                const match = {
                    matchNumber: matchNumber,
                    label: '',
                    roundIndex: roundIndex,
                    roundName: getRoundName(roundCount, roundIndex),
                    slotIndex: slotIndex,
                    red1: '',
                    red2: '',
                    blue1: '',
                    blue2: '',
                    redSeed: null,
                    blueSeed: null,
                    redScore: 0,
                    blueScore: 0,
                    complete: false,
                    winnerSeed: null,
                    winnerAlliance: null,
                    isBye: false,
                    hidden: false,
                    source: { red: null, blue: null }
                };

                round.push(match);
                matches.push(match);
                matchNumber++;
            }

            rounds.push(round);
        }

        rounds[0].forEach((match, index) => {
            setSide(match, 'red', seededSlots[index * 2]);
            setSide(match, 'blue', seededSlots[index * 2 + 1]);
            const hasRed = sideIsReady(match, 'red');
            const hasBlue = sideIsReady(match, 'blue');
            match.hidden = hasRed !== hasBlue || (!hasRed && !hasBlue);
        });

        for (let roundIndex = 1; roundIndex < rounds.length; roundIndex++) {
            rounds[roundIndex].forEach((match, slotIndex) => {
                match.source.red = rounds[roundIndex - 1][slotIndex * 2].matchNumber;
                match.source.blue = rounds[roundIndex - 1][slotIndex * 2 + 1].matchNumber;
            });
        }

        assignVisibleLabels(matches);

        return {
            matches: matches,
            currentMatch: matches[0].matchNumber
        };
    }

    function assignVisibleLabels(matches) {
        let labelNumber = 1;

        matches
            .slice()
            .sort(sortMatches)
            .forEach(match => {
                match.label = match.hidden ? '' : 'E' + labelNumber++;
            });
    }

    function getVisibleEliminationMatches(data) {
        if (!data.eliminations || !Array.isArray(data.eliminations.matches)) {
            return [];
        }

        return data.eliminations.matches.filter(match => !match.hidden);
    }

    function updateFirstRoundMatch(match) {
        const hasRed = sideIsReady(match, 'red');
        const hasBlue = sideIsReady(match, 'blue');

        match.hidden = hasRed !== hasBlue || (!hasRed && !hasBlue);

        if (hasRed && !hasBlue) {
            clearResult(match);
            match.complete = true;
            updateWinner(match, getSide(match, 'red'), true);
            return;
        }

        if (!hasRed && hasBlue) {
            clearResult(match);
            match.complete = true;
            updateWinner(match, getSide(match, 'blue'), true);
            return;
        }

        if (!hasRed && !hasBlue) {
            clearResult(match);
            return;
        }

        updateWinner(match, determineWinner(match), false);
    }

    function updateLaterRoundMatch(match, matchesByNumber) {
        const redSource = matchesByNumber[match.source.red];
        const blueSource = matchesByNumber[match.source.blue];
        const redWinner = redSource ? redSource.winnerAlliance : null;
        const blueWinner = blueSource ? blueSource.winnerAlliance : null;

        const sidesStillMatchWinners = match.redSeed === (redWinner ? redWinner.seed : null)
            && match.blueSeed === (blueWinner ? blueWinner.seed : null);
        const resultExists = match.complete || match.redScore !== 0 || match.blueScore !== 0;

        if (!sidesStillMatchWinners && resultExists) {
            clearResult(match);
        }

        setSide(match, 'red', redWinner);
        setSide(match, 'blue', blueWinner);
        match.hidden = false;

        const hasRed = sideIsReady(match, 'red');
        const hasBlue = sideIsReady(match, 'blue');

        if (!hasRed || !hasBlue) {
            clearResult(match);
            return;
        }

        updateWinner(match, determineWinner(match), false);
    }

    function setCurrentEliminationMatch(eliminations) {
        const visibleMatches = eliminations.matches.filter(match => !match.hidden);
        const nextPlayableMatch = visibleMatches.find(match =>
            sideIsReady(match, 'red') && sideIsReady(match, 'blue') && !match.complete
        );

        if (nextPlayableMatch) {
            eliminations.currentMatch = nextPlayableMatch.matchNumber;
            return;
        }

        if (visibleMatches.length > 0) {
            eliminations.currentMatch = visibleMatches[visibleMatches.length - 1].matchNumber;
            return;
        }

        if (eliminations.matches.length > 0) {
            eliminations.currentMatch = eliminations.matches[eliminations.matches.length - 1].matchNumber;
            return;
        }

        eliminations.currentMatch = 1;
    }

    function updateEliminationProgress(data) {
        const eliminations = data.eliminations;
        if (!eliminations || !Array.isArray(eliminations.matches)) {
            return;
        }

        const matchesByNumber = {};
        eliminations.matches.forEach(match => {
            matchesByNumber[match.matchNumber] = match;
            updateWinner(match, determineWinner(match), false);
        });

        eliminations.matches
            .slice()
            .sort(sortMatches)
            .forEach(match => {
                if (match.roundIndex === 0) {
                    updateFirstRoundMatch(match);
                    return;
                }

                updateLaterRoundMatch(match, matchesByNumber);
            });

        assignVisibleLabels(eliminations.matches);
        setCurrentEliminationMatch(eliminations);
    }

    function ensureTournamentDataShape(data) {
        if (!Array.isArray(data.alliances)) {
            data.alliances = [];
        }

        if (!data.currentStage) {
            data.currentStage = 'qualification';
        }

        if (!data.eliminations) {
            data.eliminations = createEmptyEliminations();
        }

        if (!Array.isArray(data.eliminations.matches)) {
            data.eliminations.matches = [];
        }

        if (!data.eliminations.currentMatch) {
            data.eliminations.currentMatch = 1;
        }

        updateEliminationProgress(data);
    }

    function regenerateEliminationBracket(data) {
        data.eliminations = createEliminationBracket(data.alliances);
        updateEliminationProgress(data);
    }

    function resetEliminations(data) {
        data.eliminations = createEmptyEliminations();
    }

    window.tournamentUtils = {
        buildRankings: buildRankings,
        createTournamentData: createTournamentData,
        ensureTournamentDataShape: ensureTournamentDataShape,
        getVisibleEliminationMatches: getVisibleEliminationMatches,
        regenerateEliminationBracket: regenerateEliminationBracket,
        resetEliminations: resetEliminations,
        updateEliminationProgress: updateEliminationProgress
    };
})();
