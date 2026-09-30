(function() {
    const S = window.hexyScoring;
    const params = new URLSearchParams(location.search);
    const RING_LENGTH = 578.05;

    if (params.get('theme')) {
        document.documentElement.dataset.theme = params.get('theme');
    }
    if (params.get('slow')) {
        document.body.classList.add('slow-motion');
    }

    const el = {
        stage: document.getElementById('stage-name'),
        label: document.getElementById('match-label'),
        live: document.getElementById('live'),
        final: document.getElementById('final'),
        clock: document.querySelector('.clock'),
        time: document.getElementById('time'),
        phase: document.getElementById('phase-label'),
        ring: document.getElementById('ring-fill'),
        banner: document.getElementById('banner'),
        rows: document.getElementById('tally-rows')
    };

    for (const alliance of S.ALLIANCES) {
        const section = document.querySelector('.alliance.' + alliance);
        section.querySelector('.stat-bonus .stat-icon').innerHTML =
            Icons.hex({ top: alliance, bottom: alliance === 'red' ? 'blue' : 'red' });
        section.querySelector('.stat-penalty .stat-icon').innerHTML = Icons.flag();
    }

    let previous = null;
    let revealedFor = null;

    function formatTime(ms) {
        const total = Math.max(0, Math.ceil(ms / 1000));
        return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
    }

    function renderTeams(container, teams) {
        container.innerHTML = teams.map(team => '<span>' + escapeHtml(team) + '</span>').join('');
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function restartAnimation(node, className) {
        node.classList.remove(className);
        void node.offsetWidth;
        node.classList.add(className);
    }

    // Floats a "+1"/"−2" out of the number, on the side facing the clock.
    function floater(card, text, kind) {
        const value = card.querySelector('.stat-value');
        const body = card.querySelector('.stat-body');
        const node = document.createElement('div');
        node.className = 'floater ' + kind;
        node.textContent = text;
        const facesRight = !card.closest('.blue');
        node.style.top = value.offsetTop + 'px';
        node.style.left = facesRight ? (value.offsetLeft + value.offsetWidth + 12) + 'px' : 'auto';
        node.style.right = facesRight ? 'auto' : (body.offsetWidth - value.offsetLeft + 12) + 'px';
        body.appendChild(node);
        node.addEventListener('animationend', () => node.remove());
    }

    function renderClock(state) {
        const remaining = state.remainingMs;
        const seconds = remaining / 1000;
        el.time.textContent = formatTime(remaining);
        el.ring.style.strokeDashoffset = String(RING_LENGTH * (1 - remaining / (S.GAME.matchSeconds * 1000)));

        const running = state.phase === 'running';
        el.clock.classList.toggle('is-warning', running && seconds <= 30 && seconds > 10);
        el.clock.classList.toggle('is-danger', running && seconds <= 10);
        el.clock.classList.toggle('is-idle', state.phase === 'pre');
        el.clock.classList.toggle('is-scoring', state.phase === 'scoring');

        const labels = { pre: 'Ready', paused: 'Paused', scoring: 'Referee scoring', running: '' };
        el.phase.textContent = labels[state.phase] || '';

        let spinner = el.clock.querySelector('.scoring-spinner');
        if (state.phase === 'scoring' && !spinner) {
            spinner = document.createElement('div');
            spinner.className = 'scoring-spinner';
            spinner.innerHTML = Icons.hex({ top: 'red', bottom: 'blue' });
            el.clock.querySelector('.ring').appendChild(spinner);
        } else if (state.phase !== 'scoring' && spinner) {
            spinner.remove();
        }
    }

    function renderAlliance(state, alliance) {
        const section = document.querySelector('.alliance.' + alliance);
        const side = state.scoring[alliance];
        const before = previous && previous.scoring[alliance];

        renderTeams(section.querySelector('.teams'), state.match[alliance]);

        const bonusNode = section.querySelector('[data-field="bonus"]');
        const penaltyNode = section.querySelector('[data-field="penalties"]');
        bonusNode.textContent = side.bonus;
        penaltyNode.textContent = side.penalties ? '−' + side.penalties : '0';
        penaltyNode.classList.toggle('is-zero', side.penalties === 0);
        fitTeamChips([bonusNode, penaltyNode]);

        if (before && side.bonus > before.bonus) {
            const card = section.querySelector('.stat-bonus');
            restartAnimation(bonusNode, 'bump');
            restartAnimation(card.querySelector('.stat-icon'), 'flip');
            floater(card, '+' + (side.bonus - before.bonus), 'good');
        }
        if (before && side.penalties > before.penalties) {
            const card = section.querySelector('.stat-penalty');
            restartAnimation(card, 'shake');
            restartAnimation(card, 'flash-penalty');
            floater(card, '−' + (side.penalties - before.penalties), 'bad');
        }
    }

    const ROWS = [
        { key: 'zone', label: 'Zone hexes', icon: () => Icons.hexFlat({ color: 'var(--element)' }) },
        { key: 'towers', label: 'Tower hexes', icon: () => Icons.tower({ hex: 'var(--element)' }) },
        { key: 'hanging', label: 'Hanging', icon: () => Icons.robot({ color: 'var(--element)' }) },
        { key: 'bonus', label: 'Tower bonus', icon: () => Icons.hex({ top: 'red', bottom: 'blue' }) },
        { key: 'penalties', label: 'Penalties', icon: () => Icons.flag(), negative: true }
    ];

    function renderFinal(state) {
        const scoring = state.scoring;
        const red = S.computeBreakdown(scoring, 'red');
        const blue = S.computeBreakdown(scoring, 'blue');

        for (const alliance of S.ALLIANCES) {
            renderTeams(el.final.querySelector('.tally-side.' + alliance + ' .teams'), state.match[alliance]);
        }

        el.rows.innerHTML = ROWS.map(row => {
            const fmt = value => row.negative ? (value ? '−' + value : '0') : points(value);
            const cls = row.negative ? ' neg' : '';
            return '<div class="tally-row">' +
                '<div class="pts red' + (row.negative && red[row.key] ? cls : '') + '">' + fmt(red[row.key]) + '</div>' +
                '<div class="row-icon">' + row.icon() + '</div>' +
                '<div class="row-label">' + row.label + '</div>' +
                '<div class="row-icon">' + row.icon() + '</div>' +
                '<div class="pts blue' + (row.negative && blue[row.key] ? cls : '') + '">' + fmt(blue[row.key]) + '</div>' +
                '</div>';
        }).join('');
        fitTeamChips(el.rows.querySelectorAll('.pts'));

        const key = state.match.label + ':' + red.total + ':' + blue.total;
        if (revealedFor === key) {
            return;
        }
        revealedFor = key;
        playReveal(red.total, blue.total);
    }

    function playReveal(redTotal, blueTotal) {
        const slow = document.body.classList.contains('slow-motion') ? 5 : 1;
        const rows = Array.from(el.rows.children);
        const totals = {
            red: el.final.querySelector('.tally-side.red [data-total]'),
            blue: el.final.querySelector('.tally-side.blue [data-total]')
        };
        const sides = el.final.querySelectorAll('.tally-side');

        el.banner.className = 'banner';
        el.banner.textContent = '';
        sides.forEach(side => side.classList.remove('winner'));
        // Size each total for its final value up front, so the count-up never overflows.
        totals.red.textContent = points(redTotal);
        totals.blue.textContent = points(blueTotal);
        fitTeamChips([totals.red, totals.blue]);
        totals.red.textContent = '0';
        totals.blue.textContent = '0';

        rows.forEach((row, i) => setTimeout(() => row.classList.add('show'), (150 + i * 170) * slow));

        const countStart = (150 + rows.length * 170) * slow;
        setTimeout(() => {
            countUp(totals.red, redTotal, 600 * slow);
            countUp(totals.blue, blueTotal, 600 * slow);
        }, countStart);

        setTimeout(() => {
            const winner = redTotal === blueTotal ? null : (redTotal > blueTotal ? 'red' : 'blue');
            el.banner.textContent = winner ? winner + ' alliance wins' : 'Tie match';
            el.banner.classList.add('show');
            if (winner) {
                el.banner.classList.add(winner);
                el.final.querySelector('.tally-side.' + winner).classList.add('winner');
            }
        }, countStart + 700 * slow);
    }

    function countUp(node, target, duration) {
        const start = performance.now();
        const from = 0;
        function frame(now) {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            node.textContent = points(Math.round(from + (target - from) * eased));
            if (t < 1) {
                requestAnimationFrame(frame);
            }
        }
        requestAnimationFrame(frame);
    }

    const onDeck = {
        root: document.getElementById('on-deck'),
        label: document.getElementById('on-deck-label'),
        red: document.getElementById('on-deck-red'),
        blue: document.getElementById('on-deck-blue')
    };

    // While teams are being called, the strip shows the match about to be played and who has
    // checked in. During a match it quietly shows the following match.
    function renderOnDeck(state) {
        const calling = state.displayMode === 'boards' && state.match;
        const next = calling ? state.match : state.onDeck;
        onDeck.root.hidden = !next;
        onDeck.root.classList.toggle('calling', Boolean(calling));
        if (!next) {
            return;
        }
        const checkIn = calling && state.checkIn;
        // Later elimination matches may not know their alliances yet.
        const chips = (teams, alliance) => teams.map((team, slot) => {
            const ready = checkIn && checkIn[alliance][slot];
            return '<span class="' + (ready ? 'ready' : '') + '">' + escapeHtml(team || 'TBD') + '</span>';
        }).join('');
        onDeck.label.textContent = next.label;
        onDeck.red.innerHTML = chips(next.red, 'red');
        onDeck.blue.innerHTML = chips(next.blue, 'blue');
    }

    const fitTeamChips = window.hexyFit.fit;
    const points = window.hexyFit.points;

    // ---------- boards: rankings and schedule, alternating while teams are called ----------
    const board = {
        root: document.getElementById('board'),
        stage: document.getElementById('board-stage'),
        title: document.getElementById('board-title'),
        body: document.getElementById('board-body')
    };
    const BOARD_ROWS = 8;
    const BOARD_MIN_MS = 10000;      // each board stays up at least this long
    const HOLD_TOP_MS = 3000;        // read the top before scrolling
    const HOLD_END_MS = 4000;        // read the bottom before switching
    const SCROLL_REM_PER_SEC = 5;    // about one row every 1.7 seconds
    const FADE_MS = 450;

    let boardState = null;
    let rotation = null;

    function chips(teams) {
        return teams.map(team => '<span>' + escapeHtml(team || 'TBD') + '</span>').join('');
    }

    function rankingsHtml(boards) {
        const teams = boards.rankings;
        // Small events fit in two columns; bigger ones use one list that scrolls.
        const columns = teams.length > BOARD_ROWS && teams.length <= BOARD_ROWS * 2 ? 2 : 1;
        const perColumn = Math.ceil(teams.length / columns);
        const header = '<div class="board-row rank-row board-header"><span>#</span><span>Team</span><span class="record">W-L-T</span><span class="points">Pts</span></div>';
        const row = team => '<div class="board-row rank-row">' +
            '<span class="rank">' + team.rank + '</span>' +
            '<span>' + escapeHtml(team.name) + '</span>' +
            '<span class="record">' + team.win + '-' + team.loss + '-' + team.tie + '</span>' +
            '<span class="points">' + team.points + '</span></div>';
        let cols = '';
        for (let c = 0; c < columns; c++) {
            cols += '<div class="board-col">' + teams.slice(c * perColumn, (c + 1) * perColumn).map(row).join('') + '</div>';
        }
        return '<div class="board-cols' + (columns === 1 ? ' single' : '') + '">' + header.repeat(columns) + '</div>' +
            '<div class="board-viewport"><div class="board-track board-cols' + (columns === 1 ? ' single' : '') + '">' + cols + '</div></div>';
    }

    function scheduleHtml(boards) {
        const matches = boards.schedule;
        // Two recent results for context, then everything still to come.
        const current = Math.max(0, matches.findIndex(match => match.current));
        const rows = matches.slice(Math.max(0, current - 2)).map(match => {
            const result = match.complete
                ? '<span class="red">' + points(match.redScore) + '</span> – <span class="blue">' + points(match.blueScore) + '</span>'
                : '<span class="muted">vs</span>';
            const cls = 'board-row sched-row' + (match.current ? ' current' : '') + (match.complete && !match.current ? ' done' : '');
            return '<div class="' + cls + '">' +
                '<span class="label">' + escapeHtml(match.label) + '</span>' +
                '<span class="sched-alliance red">' + chips(match.red) + '</span>' +
                '<span class="result">' + result + '</span>' +
                '<span class="sched-alliance blue">' + chips(match.blue) + '</span></div>';
        }).join('');
        return '<div class="board-viewport"><div class="board-track">' + rows + '</div></div>';
    }

    function renderBoard() {
        const boards = boardState.boards;
        board.stage.textContent = boards.stageName;
        board.title.textContent = rotation.board === 'rankings' ? 'Rankings' : 'Match schedule';
        board.body.innerHTML = rotation.board === 'rankings' ? rankingsHtml(boards) : scheduleHtml(boards);
        document.querySelectorAll('.board-dot').forEach(dot => {
            dot.classList.toggle('active', dot.dataset.board === rotation.board);
        });
        positionBoard(performance.now());
    }

    // Holds at the top, scrolls slowly through anything that doesn't fit, holds at the
    // end, and reports whether this board has had its turn.
    function positionBoard(now) {
        const viewport = board.body.querySelector('.board-viewport');
        const track = board.body.querySelector('.board-track');
        if (!viewport || !track) {
            return true;
        }
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const overflow = Math.max(0, track.scrollHeight - viewport.clientHeight);
        const scrollMs = overflow / (SCROLL_REM_PER_SEC * rem) * 1000;
        const total = Math.max(BOARD_MIN_MS, overflow ? HOLD_TOP_MS + scrollMs + HOLD_END_MS : 0);
        const elapsed = now - rotation.started;
        const progress = overflow ? Math.min(1, Math.max(0, (elapsed - HOLD_TOP_MS) / scrollMs)) : 0;
        track.style.transform = 'translateY(' + (-progress * overflow) + 'px)';
        viewport.classList.toggle('more-below', overflow > 0 && progress < 1);
        viewport.classList.toggle('more-above', progress > 0);
        return elapsed >= total;
    }

    function boardLoop(now) {
        if (!rotation || board.root.hidden) {
            rotation = null;
            return;
        }
        if (!rotation.switching && positionBoard(now)) {
            rotation.switching = true;
            board.root.classList.add('fading');
            setTimeout(() => {
                if (!rotation) {
                    return;
                }
                rotation.board = rotation.board === 'rankings' ? 'schedule' : 'rankings';
                rotation.started = performance.now();
                rotation.switching = false;
                renderBoard();
                board.root.classList.remove('fading');
            }, FADE_MS);
        }
        requestAnimationFrame(boardLoop);
    }

    // Eliminations: the bracket, instead of rotating rankings and the schedule.
    function renderBracketBoard(boards) {
        board.root.classList.add('is-bracket');
        board.stage.textContent = boards.stageName;
        board.title.textContent = 'Bracket';
        const side = (match, color) => {
            const info = match[color];
            const known = info.teams[0] || info.teams[1];
            const result = match.winner ? (match.winner === color ? ' win' : ' lose') : '';
            return '<div class="bk-side ' + color + result + '">' +
                '<span class="bk-seed">' + (info.seed ? info.seed : '') + '</span>' +
                '<span class="bk-teams">' + (known ? info.teams.map(team => escapeHtml(team || 'TBD')).join(' · ') : 'TBD') + '</span>' +
                '<span class="bk-score">' + (match.complete ? points(info.score) : '') + '</span></div>';
        };
        board.body.innerHTML = '<div class="bk">' + boards.bracket.map(round =>
            '<div class="bk-round"><h3 class="bk-round-name">' + escapeHtml(round.name) + '</h3><div class="bk-matches">' +
            round.matches.map(match =>
                '<div class="bk-match' + (match.current ? ' current' : '') + (match.complete ? ' done' : '') + '">' +
                '<div class="bk-label">' + escapeHtml(match.label) +
                (match.current ? '<span class="bk-tag">Up next</span>' : match.complete ? '<span class="bk-tag">Complete</span>' : '') + '</div>' +
                side(match, 'red') + side(match, 'blue') + '</div>'
            ).join('') + '</div></div>'
        ).join('') + '</div>';
        fitTeamChips(board.body.querySelectorAll('.bk-teams'));
    }

    function showBoards(state) {
        if (state.boards.bracket) {
            rotation = null;
            renderBracketBoard(state.boards);
            return;
        }
        board.root.classList.remove('is-bracket');
        boardState = state;
        if (!rotation) {
            // Fresh rankings first: the last result has just gone in.
            rotation = { board: state.firstBoard || 'rankings', started: performance.now(), switching: false };
            board.root.classList.remove('fading');
            renderBoard();
            requestAnimationFrame(boardLoop);
        } else if (!rotation.switching) {
            // New data (a result, a check-in) refreshes the rows without restarting the scroll.
            renderBoard();
        }
    }

    // ---------- alliance selection ----------
    const allianceBoard = {
        root: document.getElementById('alliance-board'),
        status: document.getElementById('ab-status'),
        seeds: document.getElementById('ab-seeds'),
        pool: document.getElementById('ab-pool')
    };
    let shownAlliances = null;

    function renderAllianceBoard(board) {
        const count = Math.max(board.seedCount, board.alliances.length);
        const columns = count <= 4 ? 1 : count <= 8 ? 2 : 3;
        allianceBoard.seeds.style.gridTemplateColumns = 'repeat(' + columns + ', minmax(0, 1fr))';
        allianceBoard.seeds.style.gridTemplateRows = 'repeat(' + Math.ceil(count / columns) + ', minmax(0, 1fr))';

        const chip = (name, cls) => '<span class="ab-team ' + cls + '">' + escapeHtml(name) + '</span>';
        let html = '';
        for (let seed = 1; seed <= count; seed++) {
            const alliance = board.alliances[seed - 1];
            const picking = !alliance && seed === board.alliances.length + 1 && board.captain;
            // A seed that just filled in pops into place.
            const landed = alliance && shownAlliances !== null && seed > shownAlliances;
            const cls = 'ab-seed' + (alliance ? ' filled' : picking ? ' picking' : ' empty') + (landed ? ' landed' : '');
            html += '<div class="' + cls + '"><span class="ab-seed-num">' + seed + '</span>';
            // Captain above partner, so each name gets the card's full width.
            if (alliance) {
                html += '<div class="ab-pair">' + chip(alliance.captain, 'captain') + chip(alliance.partner, 'partner') + '</div>';
            } else if (picking) {
                html += '<div class="ab-pair">' + chip(board.captain, 'captain') + '<span class="ab-team pending">?</span></div>';
            }
            html += '</div>';
        }
        allianceBoard.seeds.innerHTML = html;
        shownAlliances = board.alliances.length;

        // Once everyone has an alliance, the seeds get the whole width.
        allianceBoard.root.classList.toggle('pool-empty', board.available.length === 0);
        allianceBoard.pool.style.gridTemplateColumns = 'repeat(' + (board.available.length > 16 ? 3 : 2) + ', minmax(0, 1fr))';
        allianceBoard.pool.innerHTML = board.available.map(team =>
            '<div class="ab-pool-team' + (team.captain ? ' is-captain' : '') + '">' +
            '<span class="ab-rank">' + team.rank + '</span>' +
            '<span class="ab-name">' + escapeHtml(team.name) + '</span>' +
            (team.captain ? '<span class="ab-tag">Picking</span>' : '') + '</div>'
        ).join('') || '<p class="ab-empty">Every team has an alliance</p>';

        allianceBoard.status.innerHTML = board.complete
            ? '<span class="ab-done">Alliances are set · eliminations are next</span>'
            : 'Seed ' + (board.alliances.length + 1) + ' · <b>' + escapeHtml(board.captain) + '</b> is choosing a partner';
        fitTeamChips(document.querySelectorAll('.ab-team, .ab-name'));
    }

    function render(state) {
        renderOnDeck(state);
        const showAlliance = state.displayMode === 'alliance' && state.alliance;
        allianceBoard.root.hidden = !showAlliance;
        if (showAlliance) {
            el.live.hidden = true;
            el.final.hidden = true;
            board.root.hidden = true;
            onDeck.root.hidden = true;
            rotation = null;
            el.stage.textContent = 'Qualifications complete';
            el.label.textContent = '';
            renderAllianceBoard(state.alliance);
            return;
        }
        shownAlliances = null;
        if (!state.match) {
            el.stage.textContent = 'Waiting for tournament';
            el.label.textContent = '';
            return;
        }
        if (previous && previous.match && previous.match.key !== state.match.key) {
            previous = null;
        }
        el.stage.textContent = state.match.stageName;
        el.label.textContent = state.match.label;

        const showBoard = state.displayMode === 'boards' && state.boards;
        board.root.hidden = !showBoard;
        if (showBoard) {
            el.live.hidden = true;
            el.final.hidden = true;
            showBoards(state);
            fitTeamChips(document.querySelectorAll('.on-deck-teams span'));
            previous = JSON.parse(JSON.stringify(state));
            return;
        }
        rotation = null;

        const showFinal = state.phase === 'final';
        el.live.hidden = showFinal;
        el.final.hidden = !showFinal;

        if (showFinal) {
            renderFinal(state);
        } else {
            revealedFor = null;
            renderClock(state);
            S.ALLIANCES.forEach(alliance => renderAlliance(state, alliance));
        }
        fitTeamChips(document.querySelectorAll('.teams span, .on-deck-teams span'));
        previous = JSON.parse(JSON.stringify(state));
    }

    // Chip widths depend on the web font and the window size, so measure again when either changes.
    const refitChips = () => fitTeamChips(document.querySelectorAll(
        '.teams span, .on-deck-teams span, .stat-value, .tally-row .pts, [data-total]'));
    if (document.fonts) {
        document.fonts.ready.then(refitChips);
    }
    window.addEventListener('resize', refitChips);

    window.hexyDisplay = { render };

    const mock = window.hexyMock.getMockState();
    if (mock) {
        render(mock);
        if (params.get('demo')) {
            runDemo(mock);
        }
    } else {
        let latest = null;
        const connection = window.hexyClient.connect({
            onState: snapshot => {
                latest = snapshot;
                snapshot.remainingMs = connection ? connection.remainingMs() : snapshot.remainingMs;
                render(snapshot);
            }
        });

        setInterval(() => {
            if (latest && latest.match && latest.phase === 'running') {
                latest.remainingMs = connection.remainingMs();
                renderClock(latest);
            }
        }, 100);
    }

    // Plays a scripted sequence of live events so animations can be reviewed.
    function runDemo(state) {
        const events = [
            s => { s.scoring = S.applyAction(s.scoring, { type: 'bonus', alliance: 'red' }); },
            s => { s.scoring = S.applyAction(s.scoring, { type: 'penalty', alliance: 'blue', value: 2 }); },
            s => { s.scoring = S.applyAction(s.scoring, { type: 'bonus', alliance: 'blue' }); },
            s => { s.scoring = S.applyAction(s.scoring, { type: 'penalty', alliance: 'red', value: 1 }); }
        ];
        let i = 0;
        setInterval(() => {
            events[i++ % events.length](state);
            if (state.phase === 'running') {
                state.remainingMs = Math.max(0, state.remainingMs - 1500);
            }
            render(state);
        }, 1500);
    }
})();
