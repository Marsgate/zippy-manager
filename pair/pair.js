(function() {
    const qr = document.getElementById('qr');

    function render(info) {
        const primary = info.urls[0];
        document.getElementById('no-network').hidden = Boolean(primary);
        qr.hidden = !info.qr;
        if (info.qr) {
            qr.src = info.qr;
        }
        document.getElementById('url').textContent = primary
            ? info.urls.map(entry => entry.url).join('  or  ')
            : '—';
        document.getElementById('pin').textContent = info.pin;
        document.getElementById('display-url').textContent = info.displayUrl || '—';
        document.getElementById('paired').textContent = info.pairedCount === 1
            ? '1 device paired'
            : info.pairedCount + ' devices paired';
    }

    function refresh() {
        window.electronAPI.getPairingInfo().then(render);
    }

    document.getElementById('reset').addEventListener('click', () => {
        if (confirm('Unpair every phone and tablet and make a new PIN? Paired devices will need to scan again.')) {
            window.electronAPI.resetPairing().then(render);
        }
    });

    document.getElementById('done').addEventListener('click', () => window.close());

    refresh();
    // Keeps the paired-device count current while the ref scans.
    setInterval(refresh, 2000);
})();
