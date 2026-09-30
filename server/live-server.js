// Small HTTP server for the live pages: static files, a Server-Sent Events stream of
// match snapshots, and an action endpoint for paired controllers. No dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');

const ROOT = path.join(__dirname, '..');
const STATIC_ROOTS = {
    '/live/': path.join(ROOT, 'live'),
    '/shared/': path.join(ROOT, 'shared'),
    '/sounds/': path.join(ROOT, 'timer', 'soundeffects')
};
const SHORTCUTS = {
    '/': '/live/ref.html',
    '/ref': '/live/ref.html',
    '/display': '/live/display.html'
};
const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.webmanifest': 'application/manifest+json'
};
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'";
const MAX_BODY = 16 * 1024;
const PIN_LOCKOUT_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 60 * 1000;

function isLoopback(req) {
    const address = req.socket.remoteAddress || '';
    return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function loopbackFree(port) {
    return new Promise(resolve => {
        const probe = net.createServer();
        probe.once('error', () => resolve(false));
        probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
    });
}

function newPin() {
    return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function readCookie(req, name) {
    const header = req.headers.cookie || '';
    for (const part of header.split(';')) {
        const [key, ...rest] = part.trim().split('=');
        if (key === name) {
            return decodeURIComponent(rest.join('='));
        }
    }
    return null;
}

function sendJson(res, status, body, headers = {}) {
    res.writeHead(status, Object.assign({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, headers));
    res.end(JSON.stringify(body));
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', chunk => {
            size += chunk.length;
            if (size > MAX_BODY) {
                reject(new Error('Body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            try {
                resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

class LiveServer {
    constructor({ controller, host = '127.0.0.1', port = 8765, tokens = [], onTokensChanged = () => {} }) {
        this.controller = controller;
        this.host = host;
        this.port = port;
        this.tokens = new Set(tokens);
        this.onTokensChanged = onTokensChanged;
        this.pin = newPin();
        this.failedPins = new Map();
        this.clients = new Set();
        this.server = http.createServer((req, res) => this.handle(req, res).catch(error => {
            if (!res.headersSent) {
                sendJson(res, 500, { ok: false, error: error.message });
            }
        }));
        this.onChange = snapshot => this.broadcast(snapshot);
        controller.on('change', this.onChange);
        // A visible ping (not an SSE comment) so pages can tell a live connection from a dead one.
        this.heartbeat = setInterval(() => this.broadcastRaw('event: ping\ndata: {}\n\n'), 5000);
    }

    listen() {
        return new Promise((resolve, reject) => {
            const tryPort = async (port, attemptsLeft) => {
                // Binding 0.0.0.0 can succeed even while another process owns 127.0.0.1 on the
                // same port; local windows would then talk to that process. Skip such ports.
                if (!(await loopbackFree(port))) {
                    if (attemptsLeft > 0) {
                        tryPort(port + 1, attemptsLeft - 1);
                    } else {
                        reject(new Error('No free port for the live server'));
                    }
                    return;
                }
                const onError = error => {
                    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
                        tryPort(port + 1, attemptsLeft - 1);
                    } else {
                        reject(error);
                    }
                };
                this.server.once('error', onError);
                this.server.listen(port, this.host, () => {
                    this.server.off('error', onError);
                    this.port = port;
                    resolve(port);
                });
            };
            tryPort(this.port, 10);
        });
    }

    close() {
        clearInterval(this.heartbeat);
        this.controller.off('change', this.onChange);
        for (const res of this.clients) {
            res.end();
        }
        this.clients.clear();
        return new Promise(resolve => this.server.close(() => resolve()));
    }

    // ---------- pairing ----------
    resetPairing() {
        this.pin = newPin();
        this.tokens.clear();
        this.onTokensChanged([]);
        this.broadcast(this.controller.snapshot());
    }

    tokenFrom(req) {
        const auth = req.headers.authorization || '';
        if (auth.startsWith('Bearer ')) {
            return auth.slice(7);
        }
        return readCookie(req, 'hexy_token');
    }

    canControl(req) {
        if (isLoopback(req)) {
            return true;
        }
        const token = this.tokenFrom(req);
        return Boolean(token && this.tokens.has(token));
    }

    async pair(req, res) {
        const ip = req.socket.remoteAddress;
        const record = this.failedPins.get(ip) || { count: 0, until: 0 };
        if (record.until > Date.now()) {
            sendJson(res, 429, { ok: false, error: 'Too many attempts. Wait a minute and try again.' });
            return;
        }

        const body = await readBody(req);
        if (String(body.pin || '').trim() !== this.pin) {
            record.count++;
            if (record.count >= PIN_LOCKOUT_ATTEMPTS) {
                record.count = 0;
                record.until = Date.now() + PIN_LOCKOUT_MS;
            }
            this.failedPins.set(ip, record);
            sendJson(res, 403, { ok: false, error: 'Wrong PIN' });
            return;
        }

        this.failedPins.delete(ip);
        const token = crypto.randomBytes(24).toString('hex');
        this.tokens.add(token);
        this.onTokensChanged(Array.from(this.tokens));
        sendJson(res, 200, { ok: true, token }, {
            'Set-Cookie': 'hexy_token=' + token + '; Path=/; Max-Age=31536000; SameSite=Strict; HttpOnly'
        });
    }

    // ---------- SSE ----------
    broadcastRaw(chunk) {
        for (const res of this.clients) {
            res.write(chunk);
        }
    }

    broadcast(snapshot) {
        this.broadcastRaw('data: ' + JSON.stringify(snapshot) + '\n\n');
    }

    openEvents(req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        res.write('retry: 1500\n\n');
        res.write('data: ' + JSON.stringify(this.controller.snapshot()) + '\n\n');
        this.clients.add(res);
        req.on('close', () => this.clients.delete(res));
    }

    // ---------- static ----------
    serveStatic(pathname, res) {
        const prefix = Object.keys(STATIC_ROOTS).find(key => pathname.startsWith(key));
        if (!prefix) {
            return false;
        }
        const root = STATIC_ROOTS[prefix];
        const filePath = path.normalize(path.join(root, decodeURIComponent(pathname.slice(prefix.length))));
        if (!filePath.startsWith(root + path.sep)) {
            return false;
        }
        let content;
        try {
            content = fs.readFileSync(filePath);
        } catch (error) {
            return false;
        }
        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' };
        if (type.startsWith('text/html')) {
            headers['Content-Security-Policy'] = CSP;
        }
        res.writeHead(200, headers);
        res.end(content);
        return true;
    }

    async handle(req, res) {
        const url = new URL(req.url, 'http://localhost');
        const pathname = url.pathname;

        if (req.method === 'GET' && SHORTCUTS[pathname]) {
            res.writeHead(302, { Location: SHORTCUTS[pathname] + url.search });
            res.end();
            return;
        }
        if (req.method === 'GET' && pathname === '/events') {
            this.openEvents(req, res);
            return;
        }
        if (req.method === 'GET' && pathname === '/api/state') {
            sendJson(res, 200, this.controller.snapshot());
            return;
        }
        if (req.method === 'GET' && pathname === '/api/session') {
            sendJson(res, 200, { canControl: this.canControl(req), local: isLoopback(req) });
            return;
        }
        if (req.method === 'POST' && pathname === '/api/pair') {
            await this.pair(req, res);
            return;
        }
        if (req.method === 'POST' && pathname === '/api/action') {
            if (!this.canControl(req)) {
                sendJson(res, 401, { ok: false, error: 'This device is not paired' });
                return;
            }
            const action = await readBody(req);
            const result = this.controller.dispatch(action);
            sendJson(res, result.ok ? 200 : 409, result);
            return;
        }
        if (req.method === 'GET' && this.serveStatic(pathname, res)) {
            return;
        }
        sendJson(res, 404, { ok: false, error: 'Not found' });
    }
}

module.exports = { LiveServer };
