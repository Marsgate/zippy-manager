(function() {
    const S = window.hexyScoring;
    const params = new URLSearchParams(location.search);

    if (params.get('theme')) {
        document.documentElement.dataset.theme = params.get('theme');
    }

    const el = {
        label: document.getElementById('match-label'),
        stage: document.getElementById('match-stage'),
        live: document.getElementById('live-screen'),
        alliance: document.getElementById('alliance-screen'),
        checkin: document.getElementById('checkin-screen'),
        checkinStatus: document.getElementById('checkin-status'),
        startMatch: document.getElementById('btn-start-match'),
        startAnyway: document.getElementById('btn-start-anyway'),
        tv: document.getElementById('tv-status'),
        tvText: document.getElementById('tv-text'),
        tvShort: document.getElementById('tv-short'),
        score: document.getElementById('score-screen'),
        time: document.getElementById('time'),
        start: document.getElementById('btn-start'),
        reset: document.getElementById('btn-reset'),
        end: document.getElementById('btn-end'),
        budget: document.getElementById('hex-budget'),
        submit: document.querySelector('.submit'),
        noMatch: document.getElementById('no-match'),
        waiting: document.getElementById('waiting'),
        toast: document.getElementById('toast'),
        conn: document.getElementById('conn'),
        connText: document.getElementById('conn-text'),
        pair: document.getElementById('pair'),
        pairForm: document.getElementById('pair-form'),
        pairPin: document.getElementById('pair-pin'),
        pairError: document.getElementById('pair-error')
    };

    // Icons that depend on which alliance currently fills a slot.
    function renderSlotIcons() {
        document.querySelectorAll('.side[data-alliance]').forEach(side => {
            const alliance = side.dataset.alliance;
            side.querySelector('.tower-btn-icon').innerHTML =
                Icons.hex({ top: alliance, bottom: alliance === 'red' ? 'blue' : 'red' });
        });
        document.querySelectorAll('.zone-stepper[data-alliance], .ps-zone[data-alliance]').forEach(stepper => {
            stepper.querySelector('.zone-hex').innerHTML = Icons.hexFlat({ color: stepper.dataset.alliance });
        });
    }

    document.getElementById('pair-hex').innerHTML = Icons.hex({ top: 'red', bottom: 'blue' });
    document.getElementById('waiting-hex').innerHTML = Icons.hex({ top: 'red', bottom: 'blue' });

    let state = null;
    let previous = null;
    let flipped = readFlip();
    applyFlip();

    function readFlip() {
        try {
            return localStorage.getItem('hexy-field-flipped') === '1';
        } catch (error) {
            return false;
        }
    }

    // Swaps which alliance fills the left and right slots. The layout stays put;
    // only the colors, teams, and scores trade places.
    function applyFlip() {
        document.querySelectorAll('[data-home]').forEach(node => {
            const home = node.dataset.home;
            const alliance = flipped ? (home === 'red' ? 'blue' : 'red') : home;
            node.dataset.alliance = alliance;
            node.classList.toggle('red', alliance === 'red');
            node.classList.toggle('blue', alliance === 'blue');
        });
        renderSlotIcons();
        if (state) {
            previous = null;
            render(state);
        }
        try {
            localStorage.setItem('hexy-field-flipped', flipped ? '1' : '0');
        } catch (error) {
            // Storage can be unavailable in private mode; flipping still works for this session.
        }
    }

    let showLiveOverride = false;

    function formatTime(ms) {
        const total = Math.max(0, Math.ceil(ms / 1000));
        return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
    }

    function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    }

    function bump(node) {
        node.classList.remove('bump');
        void node.offsetWidth;
        node.classList.add('bump');
    }

    function describeUndo(scoring, alliance) {
        for (let i = scoring.log.length - 1; i >= 0; i--) {
            const entry = scoring.log[i];
            if (entry.alliance === alliance) {
                return entry.type === 'bonus' ? 'Undo +' + entry.value + ' tower' : 'Undo −' + entry.value + ' penalty';
            }
        }
        return null;
    }

    function renderTeams(alliance) {
        const html = state.match[alliance].map(team => '<span>' + escapeHtml(team) + '</span>').join('');
        document.querySelectorAll('[data-alliance="' + alliance + '"] .teams').forEach(node => { node.innerHTML = html; });
    }

    function renderTime(remaining) {
        el.time.textContent = formatTime(remaining);
        el.time.classList.toggle('warn', state.phase === 'running' && remaining <= 30000 && remaining > 10000);
        el.time.classList.toggle('danger', state.phase === 'running' && remaining <= 10000);
    }

    function renderLive() {
        renderTime(state.remainingMs);

        const startLabels = { pre: 'Start', running: 'Pause', paused: 'Resume' };
        el.start.textContent = startLabels[state.phase] || 'Start';
        el.start.classList.toggle('pause', state.phase === 'running');
        el.start.disabled = !(state.phase in startLabels);
        el.reset.disabled = state.phase === 'running';

        const scoringDone = state.phase === 'scoring' || state.phase === 'final';
        el.end.textContent = scoringDone ? 'Field scoring ›' : 'Score now';

        for (const alliance of S.ALLIANCES) {
            const side = document.querySelector('.side.' + alliance);
            const values = state.scoring[alliance];
            const before = previous && previous.scoring[alliance];

            const bonusNode = side.querySelector('[data-field="bonus"]');
            const penaltyNode = side.querySelector('[data-field="penalties"]');
            bonusNode.textContent = values.bonus;
            penaltyNode.textContent = values.penalties ? '−' + values.penalties : '0';
            if (before && before.bonus !== values.bonus) {
                bump(bonusNode);
            }
            if (before && before.penalties !== values.penalties) {
                bump(penaltyNode);
            }

            const undoText = describeUndo(state.scoring, alliance);
            side.querySelector('.undo-text').textContent = undoText || 'Nothing to undo';
            side.querySelector('.undo-btn').disabled = !undoText;
        }
    }

    function renderScore() {
        const scoring = state.scoring;
        const final = state.phase === 'final';
        el.score.classList.toggle('is-final', final);

        for (const alliance of S.ALLIANCES) {
            const breakdown = S.computeBreakdown(scoring, alliance);
            document.querySelectorAll('.score-screen [data-alliance="' + alliance + '"]').forEach(root => {
                root.querySelectorAll('[data-field]').forEach(node => {
                    const field = node.dataset.field;
                    if (field === 'total') {
                        node.textContent = points(breakdown.total);
                    } else if (field in scoring[alliance]) {
                        node.textContent = scoring[alliance][field];
                    }
                });
            });

            // The field map and the phone list each have their own tiles; data-slot says which robot.
            document.querySelectorAll('.hangers.' + alliance + ' .robot-tile').forEach(tile => {
                const on = Boolean(scoring[alliance].hangSlots[Number(tile.dataset.slot)]);
                tile.classList.toggle('on', on);
                tile.innerHTML = Icons.robot({ color: alliance, hanging: on });
                tile.setAttribute('aria-pressed', String(on));
                tile.disabled = final;
            });
        }

        document.querySelectorAll('.tower-tile').forEach(tile => {
            const owner = scoring.towers[Number(tile.dataset.index)];
            tile.classList.toggle('owner-red', owner === 'red');
            tile.classList.toggle('owner-blue', owner === 'blue');
            tile.innerHTML = Icons.tower({ hex: owner });
            tile.disabled = final;
        });

        document.querySelectorAll('.score-screen button[data-action^="adj"]').forEach(button => {
            button.disabled = final;
        });

        const placed = S.hexesPlaced(scoring);
        const legacy = scoring.adjust && (scoring.adjust.red || scoring.adjust.blue);
        el.budget.classList.toggle('legacy', Boolean(legacy));
        el.budget.classList.toggle('full', !legacy && placed >= S.GAME.totalHexes);
        if (legacy) {
            el.budget.textContent = 'Includes ' + scoring.adjust.red + '–' + scoring.adjust.blue + ' from the old scorer';
            el.budget.removeAttribute('aria-label');
        } else {
            el.budget.innerHTML = '<b>' + placed + '/' + S.GAME.totalHexes + '</b>' +
                '<span class="budget-hex">' + Icons.hexFlat({ color: 'var(--element)' }) + '</span>';
            el.budget.setAttribute('aria-label', placed + ' of ' + S.GAME.totalHexes + ' hexes scored');
        }

        // After the last qualification match, the next step is alliance selection.
        const nextLabels = { nextMatch: 'Submitted ✓ · Next match ›', allianceSelection: 'Submitted ✓ · Alliance selection ›' };
        const step = state.nextStep === undefined ? 'nextMatch' : state.nextStep;
        el.submit.textContent = final ? (nextLabels[step] || 'Submitted ✓') : 'Submit final score';
        el.submit.dataset.action = final ? (step || 'none') : 'submit';
        el.submit.disabled = final && !step;
        document.querySelector('[data-action="backToLive"]').textContent = final ? 'Reopen scoring' : '‹ Back';
        document.querySelector('[data-action="backToLive"]').dataset.mode = final ? 'reopen' : 'back';
        document.querySelector('[data-action="replay"]').hidden = !final;
    }

    const CHECK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    function renderCheckin() {
        const checkIn = state.checkIn || { red: [false, false], blue: [false, false], allReady: false };
        let waiting = 0;
        for (const alliance of S.ALLIANCES) {
            document.querySelectorAll('.checkin-side.' + alliance + ' .team-check').forEach((button, slot) => {
                const team = state.match[alliance][slot];
                const ready = Boolean(checkIn[alliance][slot]);
                if (!ready) {
                    waiting++;
                }
                button.classList.toggle('ready', ready);
                button.setAttribute('aria-pressed', String(ready));
                button.disabled = !team;
                button.querySelector('.check-name').textContent = team || 'TBD';
                button.querySelector('.check-box').innerHTML = ready ? CHECK_ICON : '';
                button.querySelector('.check-state').textContent = ready ? 'Ready' : 'Tap when ready';
            });
        }
        el.checkin.classList.toggle('all-ready', checkIn.allReady);
        el.startMatch.hidden = !checkIn.allReady;
        el.startAnyway.hidden = checkIn.allReady;
        el.checkinStatus.innerHTML = checkIn.allReady
            ? 'All teams ready · the display is showing the match timer'
            : '<b>Waiting on ' + waiting + ' team' + (waiting === 1 ? '' : 's') + '</b> · the display is showing rankings and the schedule';
    }

    // When the TV switches to alliance selection, the server's window opens its picks page.
    // Phones and tablets show their own alliance screen instead.
    let lastDisplayMode = null;
    function followAllianceSelection() {
        const entered = state.displayMode === 'alliance' && lastDisplayMode !== null && lastDisplayMode !== 'alliance';
        lastDisplayMode = state.displayMode;
        if (entered && !isMock && window.electronAPI) {
            window.electronAPI.changePage('alliance-selection/alliance-selection.html');
        }
    }

    function renderAllianceScreen(board) {
        const seed = board.alliances.length + 1;
        document.getElementById('as-status').textContent = board.complete
            ? 'Every alliance is set. Start the bracket when you\'re ready.'
            : 'Seed ' + seed + ' is picking · the TV is showing selection live';
        el.alliance.classList.toggle('complete', board.complete);
        document.getElementById('as-captain-card').hidden = board.complete;
        document.getElementById('as-hint').hidden = board.complete;
        document.getElementById('as-captain').textContent = board.captain || '';
        document.getElementById('as-undo').disabled = board.alliances.length === 0;
        document.getElementById('as-start').hidden = !board.complete;

        const grid = document.getElementById('as-grid');
        grid.hidden = board.complete;
        grid.innerHTML = board.available.filter(team => !team.captain).map(team =>
            '<button class="as-team" data-action="pickPartner" data-team="' + escapeHtml(team.name) + '">' +
            '<span class="as-rank">' + team.rank + '</span><span class="as-name">' + escapeHtml(team.name) + '</span></button>'
        ).join('');

        document.getElementById('as-list').innerHTML = board.alliances.map(alliance =>
            '<li><span class="as-seed">' + alliance.seed + '</span>' +
            '<span class="as-chip captain">' + escapeHtml(alliance.captain) + '</span>' +
            '<span class="as-chip">' + escapeHtml(alliance.partner) + '</span></li>'
        ).join('') || '<li class="as-none">No picks yet</li>';
        fitTeamChips(document.querySelectorAll('.as-name, .as-chip, .as-captain-name'));
    }

    function renderTvStatus() {
        const labels = {
            pre: 'Match timer',
            running: 'Match timer',
            paused: 'Match timer',
            scoring: 'Scoring…',
            final: 'Final score'
        };
        // Phones show the short label; the bar has no room for the long one.
        const short = { pre: 'Timer', running: 'Timer', paused: 'Timer', scoring: 'Scoring', final: 'Final' };
        const boards = state.displayMode === 'boards';
        const alliance = state.displayMode === 'alliance';
        el.tvText.textContent = alliance ? 'Alliance selection' : boards ? 'Rankings & schedule' : (labels[state.phase] || 'Match timer');
        el.tvShort.textContent = alliance ? 'Alliances' : boards ? 'Boards' : (short[state.phase] || 'Timer');
        el.tv.classList.toggle('boards', boards);
    }

    const fitTeamChips = window.hexyFit.fit;
    const points = window.hexyFit.points;

    function render(next) {
        state = next;

        // Without a live connection, show nothing about a match rather than stale or placeholder data.
        const ready = isMock || connected;
        document.body.classList.toggle('disconnected', !ready);
        el.waiting.hidden = ready;
        if (!ready) {
            el.noMatch.hidden = true;
            el.live.hidden = true;
            el.score.hidden = true;
            el.checkin.hidden = true;
            el.alliance.hidden = true;
            el.label.textContent = '';
            el.stage.textContent = '';
            return;
        }

        el.noMatch.hidden = Boolean(state.match);
        el.tv.hidden = !state.match;
        if (!state.match) {
            el.live.hidden = true;
            el.score.hidden = true;
            el.checkin.hidden = true;
            el.alliance.hidden = true;
            return;
        }
        el.label.textContent = state.match.label;
        renderTvStatus();
        followAllianceSelection();
        document.querySelector('[data-action="prevMatch"]').disabled = state.match.hasPrev === false || state.phase === 'running';
        document.querySelector('[data-action="nextMatch"]').disabled = state.match.hasNext === false || state.phase === 'running';
        if (previous && previous.match && previous.match.key !== state.match.key) {
            showLiveOverride = false;
            previous = null;
        }
        el.stage.textContent = state.match.stageName;
        S.ALLIANCES.forEach(renderTeams);

        const showAlliance = state.displayMode === 'alliance' && Boolean(state.alliance);
        el.alliance.hidden = !showAlliance;
        if (showAlliance) {
            el.checkin.hidden = true;
            el.live.hidden = true;
            el.score.hidden = true;
            renderAllianceScreen(state.alliance);
            previous = JSON.parse(JSON.stringify(state));
            return;
        }

        const scoringPhase = state.phase === 'scoring' || state.phase === 'final';
        const showScore = scoringPhase && !showLiveOverride;
        const showCheckin = state.phase === 'pre';
        el.checkin.hidden = !showCheckin;
        el.live.hidden = showScore || showCheckin;
        el.score.hidden = !showScore;

        if (showCheckin) {
            renderCheckin();
        }
        renderLive();
        if (scoringPhase) {
            renderScore();
        }
        fitTeamChips(document.querySelectorAll('.teams span, .check-name, .mini b, .head-total b, .count-value'));
        previous = JSON.parse(JSON.stringify(state));
    }

    // ---------- input ----------
    function actionFromButton(button) {
        const alliance = button.closest('[data-alliance]');
        return {
            type: button.dataset.action,
            alliance: alliance ? alliance.dataset.alliance : undefined,
            value: button.dataset.value ? Number(button.dataset.value) : undefined,
            delta: button.dataset.delta ? Number(button.dataset.delta) : undefined,
            index: button.dataset.index !== undefined ? Number(button.dataset.index) : undefined,
            slot: button.dataset.slot !== undefined ? Number(button.dataset.slot) : undefined,
            mode: button.dataset.mode,
            team: button.dataset.team
        };
    }

    // Converts UI intents into controller actions.
    function toControllerAction(intent) {
        const scoring = state.scoring;
        const a = intent.alliance;
        switch (intent.type) {
            case 'start':
                return { type: { pre: 'start', running: 'pause', paused: 'resume' }[state.phase] };
            case 'adjBonus':
                return { type: 'setBonus', alliance: a, value: scoring[a].bonus + intent.delta };
            case 'adjPenalties':
                return { type: 'setPenalties', alliance: a, value: scoring[a].penalties + intent.delta };
            case 'adjZone':
                return { type: 'setZone', alliance: a, value: scoring[a].zoneHexes + intent.delta };
            case 'cycleTower':
                return { type: 'setTower', index: intent.index };
            case 'toggleHang':
                return { type: 'toggleHang', alliance: a, slot: intent.slot };
            default:
                return intent;
        }
    }

    document.addEventListener('click', event => {
        const button = event.target.closest('button[data-action]');
        if (!button || button.disabled) {
            return;
        }
        const intent = actionFromButton(button);

        if (intent.type === 'flipField') {
            flipped = !flipped;
            applyFlip();
            return;
        }
        if (intent.type === 'backToLive') {
            if (button.dataset.mode === 'reopen') {
                dispatch({ type: 'reopen' });
            } else {
                showLiveOverride = true;
                render(state);
            }
            return;
        }
        if (intent.type === 'endMatch') {
            showLiveOverride = false;
            if (state.phase === 'scoring' || state.phase === 'final') {
                render(state);
                return;
            }
            if (!confirm('End the match now and go to field scoring?')) {
                return;
            }
        }
        if (intent.type === 'startAnyway') {
            const checkIn = state.checkIn || { red: [], blue: [] };
            const missing = S.ALLIANCES.flatMap(alliance =>
                state.match[alliance].filter((team, slot) => team && !checkIn[alliance][slot]));
            if (!confirm('Start without ' + missing.join(', ') + '?')) {
                return;
            }
            dispatch({ type: 'start' });
            return;
        }
        if (intent.type === 'replay') {
            const totals = S.computeTotals(state.scoring);
            const bracket = state.match.stageName === 'Elimination'
                ? '\n\nLater bracket matches that depended on this result will be cleared too.' : '';
            if (!confirm('Replay ' + state.match.label + '?\n\nThis clears its submitted score (Red ' + totals.red +
                ' – ' + totals.blue + ' Blue) so the match can be played again.' + bracket)) {
                return;
            }
            showLiveOverride = false;
            dispatch({ type: 'reset' });
            return;
        }
        if (intent.type === 'pickPartner' && !confirm(state.alliance.captain + ' picks ' + intent.team + '?')) {
            return;
        }
        if (intent.type === 'undoPick' && !confirm('Undo the last pick?')) {
            return;
        }
        if (intent.type === 'startBracket' && !confirm('Start the elimination bracket?')) {
            return;
        }
        if (intent.type === 'reset' && !confirm('Reset the timer and clear this match\'s scores?')) {
            return;
        }
        if (intent.type === 'submit') {
            const totals = S.computeTotals(state.scoring);
            if (!confirm('Submit final score?\n\nRed ' + points(totals.red) + ' – ' + points(totals.blue) + ' Blue')) {
                return;
            }
        }
        dispatch(toControllerAction(intent));
    });

    // ---------- transport ----------
    let dispatch = function() {};
    let toastTimer = null;

    function toast(message) {
        el.toast.textContent = message;
        el.toast.hidden = false;
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3000);
    }

    let connected = false;

    function setConnected(isConnected) {
        const changed = isConnected !== connected;
        connected = isConnected;
        el.conn.classList.toggle('offline', !connected);
        el.connText.textContent = connected ? 'Connected' : 'Not connected, reconnecting…';
        if (changed && state) {
            render(state);
        }
    }

    // Pairing is by QR scan. Only a home-screen app, which a scan can't reach, gets a PIN box.
    const isHomeScreenApp = navigator.standalone || window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;

    function showPairing(show) {
        el.pair.hidden = !show;
        document.getElementById('pair-pin-entry').hidden = !isHomeScreenApp;
        document.querySelector('.pair-scan').hidden = isHomeScreenApp;
        if (show && isHomeScreenApp) {
            el.pairPin.value = '';
            setTimeout(() => el.pairPin.focus(), 50);
        }
    }

    el.pairForm.addEventListener('submit', async event => {
        event.preventDefault();
        el.pairError.textContent = '';
        const result = await window.hexyClient.pair(el.pairPin.value).catch(() => ({ ok: false, error: 'Cannot reach the server' }));
        if (result.ok) {
            showPairing(false);
        } else {
            el.pairError.textContent = result.error;
            el.pairPin.select();
        }
    });

    const mock = window.hexyMock.getMockState();
    const isMock = Boolean(mock);
    if (mock) {
        dispatch = createMockController(mock, render);
        render(mock);
    } else {
        const connection = window.hexyClient.connect({
            onState: snapshot => {
                snapshot.remainingMs = connection ? connection.remainingMs() : snapshot.remainingMs;
                render(snapshot);
            },
            onStatus: setConnected
        });

        // Smooth countdown between server updates.
        setInterval(() => {
            if (state && state.match && state.phase === 'running') {
                renderTime(connection.remainingMs());
            }
        }, 100);

        dispatch = async function(action) {
            try {
                const result = await window.hexyClient.send(action);
                if (result.status === 401) {
                    showPairing(true);
                } else if (!result.ok) {
                    toast(result.error);
                }
            } catch (error) {
                toast('Not connected to the server');
            }
        };

        // Scanning the server's QR code opens /ref#pin=123456, which pairs in one step.
        const hashPin = new URLSearchParams(location.hash.slice(1)).get('pin');
        if (hashPin) {
            history.replaceState(null, '', location.pathname + location.search);
        }

        window.hexyClient.session().then(async info => {
            if (info.canControl) {
                showPairing(false);
                return;
            }
            if (hashPin) {
                const result = await window.hexyClient.pair(hashPin).catch(() => ({ ok: false }));
                if (result.ok) {
                    toast('Paired ✓');
                    return;
                }
            }
            showPairing(true);
        }).catch(() => setConnected(false));
    }

    // On a phone or tablet browser, offer a one-tap full screen. Hidden inside the Electron
    // window and when already running as a home-screen app, which is full screen anyway.
    (function setUpFullscreen() {
        const button = document.getElementById('btn-fullscreen');
        const root = document.documentElement;
        const request = root.requestFullscreen || root.webkitRequestFullscreen;
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        const standalone = navigator.standalone || window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
        if (window.electronAPI || standalone || !request) {
            return;
        }

        const isFull = () => Boolean(document.fullscreenElement || document.webkitFullscreenElement);
        const sync = () => { button.textContent = isFull() ? 'Exit full screen' : 'Full screen'; };

        button.hidden = false;
        button.addEventListener('click', () => {
            if (isFull()) {
                exit.call(document);
            } else {
                request.call(root);
            }
        });
        document.addEventListener('fullscreenchange', sync);
        document.addEventListener('webkitfullscreenchange', sync);
        sync();
    })();

    // Inside the Electron operator window, offer a way back to the schedule/bracket pages.
    // In the server's own window, show the shared page header (tabs, display, pairing).
    if (window.electronAPI) {
        // The server's own window is always connected, so the indicator only matters on phones and tablets.
        el.conn.hidden = true;
        document.body.classList.add('in-app');
        document.getElementById('app-nav').hidden = false;
        document.querySelectorAll('#app-nav [data-page]').forEach(button => {
            button.addEventListener('click', () => window.electronAPI.changePage(button.dataset.page));
        });
        document.getElementById('nav-display').addEventListener('click', () => window.electronAPI.openDisplay());
        document.getElementById('nav-pair').addEventListener('click', () => window.electronAPI.openPairing());
        window.electronAPI.getTournamentData().then(data => {
            const hasBracket = Boolean(data && data.eliminations && data.eliminations.matches.length);
            const bracket = document.getElementById('nav-bracket');
            bracket.disabled = !hasBracket;
            bracket.title = hasBracket ? '' : 'The bracket is created after alliance selection';
        });
    }

    // Mock-mode picks, so the alliance screen can be tried without a server.
    function mockPick(board, action) {
        if (action.type === 'pickPartner') {
            board.alliances.push({ seed: board.alliances.length + 1, captain: board.captain, partner: action.team });
            board.available = board.available.filter(team => team.name !== board.captain && team.name !== action.team);
        } else if (board.alliances.length) {
            const last = board.alliances.pop();
            board.available.push({ rank: 0, name: last.captain }, { rank: 0, name: last.partner });
        }
        board.captain = board.available.length >= 2 ? board.available[0].name : null;
        board.complete = !board.captain;
        board.available.forEach(team => { team.captain = team.name === board.captain; });
    }

    // Local stand-in for the server's match controller so screens are interactive in mock mode.
    function createMockController(initial, onChange) {
        let current = initial;
        let timer = null;

        function tick() {
            current.remainingMs = Math.max(0, current.remainingMs - 250);
            if (current.remainingMs === 0) {
                clearInterval(timer);
                current.phase = 'scoring';
            }
            onChange(current);
        }

        return function(action) {
            switch (action.type) {
                case 'start':
                case 'resume':
                    current.phase = 'running';
                    timer = setInterval(tick, 250);
                    break;
                case 'pause':
                    clearInterval(timer);
                    current.phase = 'paused';
                    break;
                case 'reset':
                    clearInterval(timer);
                    current.phase = 'pre';
                    current.displayMode = current.checkIn && current.checkIn.allReady ? 'match' : 'boards';
                    current.remainingMs = S.GAME.matchSeconds * 1000;
                    current.scoring = S.emptyScoring();
                    break;
                case 'endMatch':
                    clearInterval(timer);
                    current.phase = 'scoring';
                    break;
                case 'submit':
                    current.scoring = S.applyAction(current.scoring, action);
                    current.phase = 'final';
                    break;
                case 'reopen':
                    current.scoring = S.applyAction(current.scoring, { type: 'unsubmit' });
                    current.phase = 'scoring';
                    break;
                case 'toggleReady': {
                    const checkIn = current.checkIn;
                    checkIn[action.alliance][action.slot] = !checkIn[action.alliance][action.slot];
                    checkIn.allReady = checkIn.red.concat(checkIn.blue).every(Boolean);
                    current.displayMode = checkIn.allReady ? 'match' : 'boards';
                    break;
                }
                case 'allianceSelection':
                    current.displayMode = 'alliance';
                    break;
                case 'pickPartner':
                case 'undoPick':
                    mockPick(current.alliance, action);
                    break;
                case 'prevMatch':
                case 'nextMatch':
                    break;
                default:
                    current.scoring = S.applyAction(current.scoring, action);
            }
            onChange(current);
        };
    }

    const refitChips = () => fitTeamChips(document.querySelectorAll('.teams span, .check-name, .mini b, .head-total b, .count-value'));
    if (document.fonts) {
        document.fonts.ready.then(refitChips);
    }
    window.addEventListener('resize', refitChips);

    window.hexyRef = { render };
})();
