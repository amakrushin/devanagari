// Synthesized UI chimes (Web Audio): no asset files, works offline.
// Browsers block audio before the first user gesture, so a chime requested
// too early is queued (latest wins) and flushed on the first pointerdown.

const ContextCtor = globalThis.AudioContext ?? globalThis.webkitAudioContext;

let context = null;
let pending = [];

function ensureContext() {
    if (!context && ContextCtor)
        context = new ContextCtor();
    return context;
}

function flush() {
    const ctx = ensureContext();
    if (!ctx)
        return;
    ctx.resume().then(() => {
        const queued = pending;
        pending = [];
        for (const chime of queued)
            chime();
    });
}

if (typeof document !== 'undefined')
    document.addEventListener('pointerdown', flush, {capture: true});

function play(chime) {
    const ctx = ensureContext();
    if (!ctx)
        return;
    if (ctx.state === 'running') {
        pending = [];
        chime();
    } else {
        pending = [chime];
    }
}

function tone(freq, at, duration, gain = 0.15, type = 'sine') {
    const osc = context.createOscillator();
    const amp = context.createGain();
    const t0 = context.currentTime + at;
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(0, t0);
    amp.gain.linearRampToValueAtTime(gain, t0 + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(amp).connect(context.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
}

export function appStart() {
    play(() => {
        tone(659, 0, 0.18);
        tone(880, 0.12, 0.25);
    });
}

export function sessionStart() {
    play(() => {
        tone(440, 0, 0.1);
        tone(554, 0.07, 0.1);
        tone(659, 0.14, 0.16);
    });
}

export function results() {
    play(() => {
        tone(523, 0, 0.15);
        tone(784, 0.1, 0.3);
        tone(1047, 0.1, 0.3, 0.08);
    });
}

export function click() {
    play(() => tone(880, 0, 0.05, 0.08, 'triangle'));
}

export function newChar() {
    play(() => {
        tone(523, 0, 0.12, 0.1);
        tone(659, 0.09, 0.18, 0.1);
    });
}

export function correct() {
    play(() => {
        tone(659, 0, 0.08, 0.12);
        tone(988, 0.06, 0.12, 0.12);
    });
}

export function wrong() {
    play(() => {
        tone(311, 0, 0.12, 0.12, 'triangle');
        tone(233, 0.09, 0.2, 0.12, 'triangle');
    });
}
