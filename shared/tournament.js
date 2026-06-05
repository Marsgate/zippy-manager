(function() {
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

    function getAllianceTeamNames(alliance) {
        if (!alliance) {
            return { red1: '', red2: '' };
        }

        return {
            red1: alliance.captain,
            red2: alliance.partner
        };
    }

    function createEmptyEliminationMatch(matchNumber, roundIndex, slotIndex, roundSize) {
        const totalRounds = Math.log2(roundSize);
        const roundFromFinal = totalRounds - roundIndex;
        let roundName = 'Round ' + (roundIndex + 1);

        if (roundFromFinal == 0) {
            roundName = 'Final';
        } else if (roundFromFinal == 1) {
            roundName = 'Semifinal';
        } else if (roundFromFinal == 2) {
            roundName = 'Quarterfinal';
        }

        return {
            matchNumber: matchNumber,
            label: 'E' + matchNumber,
            roundIndex: roundIndex,
            roundName: roundName,
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
            source: {
                red: null,
                blue: null
            }
        };
    }

    function setAllianceOnSide(match, color, alliance) {
        const teams = getAllianceTeamNames(alliance);
        match[color + '1'] = teams.red1;
        match[color + '2'] = teams.red2;
        match[color + 'Seed'] = alliance ? alliance.seed : null;
    }

    function clearSide(match, color) {
        match[color + '1'] = '';
        match[color + '2'] = '';
        match[color + 'Seed'] = null;
    }

    function createEliminationBracket(alliances) {
        const seededAlliances = alliances.map((alliance, index) => ({
            seed: index + 1,
            captain: alliance.captain,
            partner: alliance.partner
        }));

        if (seededAlliances.length < 2) {
            return {
                matches: [],
                currentMatch: 1
            };
        }

        const bracketSize = nextPowerOfTwo(seededAlliances.length);
        const seedOrder = buildSeedOrder(bracketSize);
        const seededSlots = seedOrder.map(seed => seededAlliances.find(alliance => alliance.seed == seed) || null);
        const matches = [];
        const rounds = [];
        let matchNumber = 1;

        for (let roundSize = bracketSize, roundIndex = 0; roundSize > 1; roundSize /= 2, roundIndex++) {
            const matchCount = roundSize / 2;
            const roundMatches = [];

            for (let slotIndex = 0; slotIndex < matchCount; slotIndex++) {
                const match = createEmptyEliminationMatch(matchNumber, roundIndex, slotIndex, bracketSize);
                roundMatches.push(match);
                matches.push(match);
                matchNumber++;
            }

            rounds.push(roundMatches);
        }

        rounds[0].forEach((match, index) => {
            setAllianceOnSide(match, 'red', seededSlots[index * 2]);
            setAllianceOnSide(match, 'blue', seededSlots[index * 2 + 1]);
        });

        for (let roundIndex = 1; roundIndex < rounds.length; roundIndex++) {
            rounds[roundIndex].forEach((match, slotIndex) => {
                const priorRound = rounds[roundIndex - 1];
                match.source.red = priorRound[slotIndex * 2].matchNumber;
                match.source.blue = priorRound[slotIndex * 2 + 1].matchNumber;
            });
        }

        return {
            matches: matches,
            currentMatch: 1
        };
    }

    function determineWinner(match) {
        if (!match.complete) {
            return null;
        }

        if (match.redScore == match.blueScore) {
            return null;
        }

        if (match.redScore > match.blueScore) {
            return {
                seed: match.redSeed,
                captain: match.red1,
                partner: match.red2
            };
        }

        return {
            seed: match.blueSeed,
            captain: match.blue1,
            partner: match.blue2
        };
    }

    function applyWinnerMetadata(match, winnerAlliance, isBye) {
        match.winnerAlliance = winnerAlliance;
        match.winnerSeed = winnerAlliance ? winnerAlliance.seed : null;
        match.isBye = isBye;
    }

    function updateEliminationProgress(tournamentData) {
        const eliminations = tournamentData.eliminations;

        if (!eliminations || !Array.isArray(eliminations.matches)) {
            return;
        }

        const matches = eliminations.matches;
        const matchesByNumber = {};
        matches.forEach(match => {
            matchesByNumber[match.matchNumber] = match;
            applyWinnerMetadata(match, determineWinner(match), false);
        });

        const sortedMatches = matches.slice().sort((a, b) => {
            if (a.roundIndex != b.roundIndex) {
                return a.roundIndex - b.roundIndex;
            }
            return a.slotIndex - b.slotIndex;
        });

        sortedMatches.forEach(match => {
            if (match.roundIndex == 0) {
                const hasRed = Boolean(match.red1 && match.red2);
                const hasBlue = Boolean(match.blue1 && match.blue2);

                if (hasRed && !hasBlue) {
                    match.complete = true;
                    match.redScore = 0;
                    match.blueScore = 0;
                    applyWinnerMetadata(match, {
                        seed: match.redSeed,
                        captain: match.red1,
                        partner: match.red2
                    }, true);
                } else if (!hasRed && hasBlue) {
                    match.complete = true;
                    match.redScore = 0;
                    match.blueScore = 0;
                    applyWinnerMetadata(match, {
                        seed: match.blueSeed,
                        captain: match.blue1,
                        partner: match.blue2
                    }, true);
                } else if (!hasRed && !hasBlue) {
                    match.complete = true;
                    applyWinnerMetadata(match, null, true);
                }

                return;
            }

            const redSource = matchesByNumber[match.source.red];
            const blueSource = matchesByNumber[match.source.blue];
            const priorWinnerSeeds = {
                red: redSource && redSource.winnerAlliance ? redSource.winnerAlliance.seed : null,
                blue: blueSource && blueSource.winnerAlliance ? blueSource.winnerAlliance.seed : null
            };

            const currentResultExists = match.complete || match.redScore != 0 || match.blueScore != 0;
            const currentSidesMatchPriorWinners = match.redSeed == priorWinnerSeeds.red && match.blueSeed == priorWinnerSeeds.blue;

            if (!currentSidesMatchPriorWinners && currentResultExists) {
                match.redScore = 0;
                match.blueScore = 0;
                match.complete = false;
            }

            if (redSource && redSource.winnerAlliance) {
                setAllianceOnSide(match, 'red', redSource.winnerAlliance);
            } else {
                clearSide(match, 'red');
            }

            if (blueSource && blueSource.winnerAlliance) {
                setAllianceOnSide(match, 'blue', blueSource.winnerAlliance);
            } else {
                clearSide(match, 'blue');
            }

            applyWinnerMetadata(match, determineWinner(match), false);

            const hasRed = Boolean(match.red1 && match.red2);
            const hasBlue = Boolean(match.blue1 && match.blue2);

            if (hasRed && !hasBlue) {
                match.complete = true;
                applyWinnerMetadata(match, {
                    seed: match.redSeed,
                    captain: match.red1,
                    partner: match.red2
                }, true);
            } else if (!hasRed && hasBlue) {
                match.complete = true;
                applyWinnerMetadata(match, {
                    seed: match.blueSeed,
                    captain: match.blue1,
                    partner: match.blue2
                }, true);
            } else if (!hasRed && !hasBlue) {
                match.complete = true;
                applyWinnerMetadata(match, null, true);
            }
        });

        const nextPlayableMatch = matches.find(match => {
            const ready = Boolean(match.red1 && match.red2 && match.blue1 && match.blue2);
            return ready && match.complete == false;
        });

        if (nextPlayableMatch) {
            eliminations.currentMatch = nextPlayableMatch.matchNumber;
        } else if (matches.length > 0) {
            eliminations.currentMatch = matches[matches.length - 1].matchNumber;
        } else {
            eliminations.currentMatch = 1;
        }
    }

    function ensureTournamentDataShape(tournamentData) {
        if (!Array.isArray(tournamentData.alliances)) {
            tournamentData.alliances = [];
        }

        if (!tournamentData.currentStage) {
            tournamentData.currentStage = 'qualification';
        }

        if (!tournamentData.eliminations) {
            tournamentData.eliminations = {
                matches: [],
                currentMatch: 1
            };
        }

        if (!Array.isArray(tournamentData.eliminations.matches)) {
            tournamentData.eliminations.matches = [];
        }

        if (!tournamentData.eliminations.currentMatch) {
            tournamentData.eliminations.currentMatch = 1;
        }

        updateEliminationProgress(tournamentData);
    }

    function regenerateEliminationBracket(tournamentData) {
        tournamentData.eliminations = createEliminationBracket(tournamentData.alliances);
        updateEliminationProgress(tournamentData);
    }

    window.tournamentUtils = {
        buildRankings: buildRankings,
        ensureTournamentDataShape: ensureTournamentDataShape,
        regenerateEliminationBracket: regenerateEliminationBracket,
        updateEliminationProgress: updateEliminationProgress
    };
})();
