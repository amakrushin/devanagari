// Pure practice statistics: no DOM, no clock. Callers pass `now` in milliseconds.

const DAY_MS = 24 * 60 * 60 * 1000;

// Local-timezone calendar day, e.g. '2026-07-27'.
export function localDayString(ms) {
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Records activity for the day `now` falls on: first activity of a day bumps
// daysActive and extends the streak when yesterday was active too.
export function touchDay(stats, now) {
    const today = localDayString(now);
    if (stats.lastDay === today)
        return;
    stats.streak = stats.lastDay === localDayString(now - DAY_MS) ? stats.streak + 1 : 1;
    stats.daysActive += 1;
    stats.lastDay = today;
}

// Adds time spent on a card. The cap discards idle and backgrounded gaps.
export function addTime(stats, deltaMs, capMs = 60 * 1000) {
    stats.timeMs += Math.min(Math.max(deltaMs, 0), capMs);
}

export function formatTime(ms) {
    const minutes = Math.floor(ms / (60 * 1000));
    if (minutes < 1)
        return '<1m';
    const hours = Math.floor(minutes / 60);
    return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}
