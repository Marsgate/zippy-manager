// Shared connection to the server's live server: state stream, clock sync, actions, pairing.
(function() {
    const TOKEN_KEY = 'hexy-token';

    function readToken() {
        try {
            return localStorage.getItem(TOKEN_KEY);
        } catch (error) {
            return null;
        }
    }

    function writeToken(token) {
        try {
            localStorage.setItem(TOKEN_KEY, token);
        } catch (error) {
            // Cookie set by the server still authorizes this device.
        }
    }

    // A phone or tablet can sleep, or lose Wi-Fi, without the connection ever reporting an
    // error. Treat silence as disconnected, and after waking up show nothing until fresh data.
    const SILENCE_MS = 12000;

    function connect({ onState, onStatus = () => {} }) {
        let offset = 0;
        let latest = null;
        let source = null;
        let lastHeard = 0;

        function heard() {
            lastHeard = Date.now();
        }

        function open() {
            if (source) {
                source.close();
            }
            heard();
            source = new EventSource('/events');
            source.onerror = () => onStatus(false);
            source.addEventListener('ping', heard);
            source.onmessage = event => {
                heard();
                latest = JSON.parse(event.data);
                offset = latest.serverNow - Date.now();
                onStatus(true);
                onState(latest);
            };
        }

        function reconnect() {
            onStatus(false);
            open();
        }

        open();

        setInterval(() => {
            if (Date.now() - lastHeard > SILENCE_MS) {
                reconnect();
            }
        }, 2000);

        // The server's own window never sleeps, so only devices reset on wake.
        if (!window.electronAPI) {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    reconnect();
                }
            });
            window.addEventListener('pageshow', event => {
                if (event.persisted) {
                    reconnect();
                }
            });
        }

        return {
            // Remaining time computed locally from the server's end time, so every screen agrees.
            remainingMs() {
                if (!latest) {
                    return 0;
                }
                if (latest.phase === 'running' && latest.endsAt) {
                    return Math.max(0, latest.endsAt - (Date.now() + offset));
                }
                return latest.remainingMs;
            },
            latest: () => latest
        };
    }

    async function send(action) {
        const headers = { 'Content-Type': 'application/json' };
        const token = readToken();
        if (token) {
            headers.Authorization = 'Bearer ' + token;
        }
        const response = await fetch('/api/action', { method: 'POST', headers, body: JSON.stringify(action) });
        const result = await response.json().catch(() => ({ ok: false, error: 'Bad response' }));
        result.status = response.status;
        return result;
    }

    async function session() {
        const headers = {};
        const token = readToken();
        if (token) {
            headers.Authorization = 'Bearer ' + token;
        }
        const response = await fetch('/api/session', { headers });
        return response.json();
    }

    async function pair(pin) {
        const response = await fetch('/api/pair', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        const result = await response.json();
        if (result.ok) {
            writeToken(result.token);
        }
        return result;
    }

    window.hexyClient = { connect, send, session, pair };
})();
