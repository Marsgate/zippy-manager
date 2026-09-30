// Hidden window that plays match sound cues through the server's current audio output.
(function() {
    const sounds = {
        start: new Audio('../timer/soundeffects/Start.mp3'),
        stop: new Audio('../timer/soundeffects/Stop.wav'),
        end: new Audio('../timer/soundeffects/End.wav'),
        warning: new Audio('../timer/soundeffects/Warning30.wav'),
        beep: new Audio('../timer/soundeffects/Beep.wav')
    };

    Object.values(sounds).forEach(sound => sound.load());

    window.electronAPI.onCue(name => {
        const sound = sounds[name];
        if (!sound) {
            return;
        }
        sound.currentTime = 0;
        sound.play().catch(() => {});
    });
})();
