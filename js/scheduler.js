// Pure scheduling logic: no DOM, no clock. Callers pass `now` in milliseconds.

export const INTERVALS_MS = [
    0,                          // box 0: ask again right away
    10 * 60 * 1000,             // box 1: 10 minutes
    24 * 60 * 60 * 1000,        // box 2: 1 day
    3 * 24 * 60 * 60 * 1000,    // box 3: 3 days
    7 * 24 * 60 * 60 * 1000,    // box 4: 7 days
];

export const MAX_BOX = INTERVALS_MS.length - 1;
export const LEARNED_BOX = 2;

export const PROGRESS_VERSION = 2;

// v0/v1 stored the selected course as a group index; this was the only group
// order ever shipped with numeric selection.
const V1_GROUP_ORDER = ['characters', 'digits'];

export function initProgress() {
    return {
        v: PROGRESS_VERSION,
        chars: {},
        activeGroup: 0,
        selectedGroup: 'characters',
        sessions: 0,
        words: {},
        stats: {daysActive: 0, streak: 0, lastDay: null, timeMs: 0},
    };
}

// Accepts any previously saved progress shape (localStorage or imported file)
// and migrates it to the current schema. Returns null when unusable.
export function normalizeProgress(parsed, data) {
    if (!parsed || typeof parsed !== 'object' || typeof parsed.chars !== 'object' || !parsed.chars)
        return null;
    const v = typeof parsed.v === 'number' ? parsed.v : 0;
    if (v > PROGRESS_VERSION)
        return null;
    const fresh = initProgress();
    return {
        ...fresh,
        ...parsed,
        v: PROGRESS_VERSION,
        // v0 -> v1: word cards and practice stats arrived with v1.
        words: parsed.words ?? fresh.words,
        stats: {...fresh.stats, ...(parsed.stats ?? {})},
        // v1 -> v2: selection is stored by group id so group reorders never
        // re-point old progress at a different course.
        selectedGroup: migrateSelectedGroup(parsed.selectedGroup, data),
        activeGroup: Math.min(typeof parsed.activeGroup === 'number' ? parsed.activeGroup : 0,
            data.groups.length - 1),
    };
}

function migrateSelectedGroup(selected, data) {
    const id = typeof selected === 'number' ? V1_GROUP_ORDER[selected] : selected;
    return data.groups.some(g => g.id === id) ? id : data.groups[0].id;
}

export function meetChar(progress, slug, now) {
    progress.chars[slug] ??= {box: 0, due: now, hotLeft: 0};
    return progress.chars[slug];
}

export function applyAnswer(progress, slug, correct, now) {
    const st = meetChar(progress, slug, now);
    if (correct) {
        st.box = Math.min(st.box + 1, MAX_BOX);
        st.due = now + INTERVALS_MS[st.box];
        if (st.hotLeft > 0)
            st.hotLeft -= 1;
    } else {
        st.box = 0;
        st.due = now;
    }
    return st;
}

// A freshly recorded character jumps the queue while the native voice is fresh.
export function markHot(progress, slug, now) {
    meetChar(progress, slug, now).hotLeft = 3;
}

export function unlockedChars(data, progress) {
    return data.groups.slice(0, progress.activeGroup + 1).flatMap(group => group.chars);
}

export function tryUnlock(progress, data) {
    if (progress.activeGroup >= data.groups.length - 1)
        return null;
    const active = data.groups[progress.activeGroup];
    const learned = active.chars.every(c => progress.chars[c.slug]?.box >= LEARNED_BOX);
    if (!learned)
        return null;
    progress.activeGroup += 1;
    return data.groups[progress.activeGroup];
}

export function buildSession(progress, data, now, {size = 15, maxNew = 3, maxHot = 5, groupIndex = null} = {}) {
    const open = data.groups.slice(0, progress.activeGroup + 1);
    const scoped = groupIndex == null ? open : open.filter((_, idx) => idx === groupIndex);
    const unlocked = scoped.flatMap(group => group.chars).map(c => c.slug);
    const met = unlocked.filter(slug => progress.chars[slug]);
    const byWeakness = (a, b) => progress.chars[a].box - progress.chars[b].box
        || progress.chars[a].due - progress.chars[b].due;

    const picked = new Set();
    const queue = [];
    const push = (slug, isNew = false) => {
        if (queue.length >= size || picked.has(slug))
            return false;
        picked.add(slug);
        queue.push({slug, isNew});
        return true;
    };

    met.filter(slug => progress.chars[slug].hotLeft > 0)
        .slice(0, maxHot)
        .forEach(slug => push(slug));
    met.filter(slug => progress.chars[slug].due <= now)
        .sort(byWeakness)
        .forEach(slug => push(slug));
    // New characters round-robin across the groups in scope, in data order within each.
    const introPools = scoped
        .map(g => g.chars.filter(c => !progress.chars[c.slug] && !picked.has(c.slug)));
    let introduced = 0;
    while (introduced < maxNew && introPools.some(pool => pool.length)) {
        for (const pool of introPools) {
            if (introduced >= maxNew)
                break;
            const c = pool.shift();
            if (c && push(c.slug, true))
                introduced += 1;
        }
    }
    [...met].sort(byWeakness).forEach(slug => push(slug));
    return queue;
}

export function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

// Wrong-answer options: confusable partners first, then the same group, then anything unlocked.
export function pickDistractors(data, progress, slug, count = 3) {
    const unlocked = new Set(unlockedChars(data, progress).map(c => c.slug));
    unlocked.delete(slug);
    const confusable = (data.confusables ?? [])
        .filter(pair => pair.includes(slug))
        .map(pair => (pair[0] === slug ? pair[1] : pair[0]))
        .filter(s => unlocked.has(s));
    const group = data.groups.find(g => g.chars.some(c => c.slug === slug));
    const sameGroup = shuffle(group.chars.map(c => c.slug)
        .filter(s => unlocked.has(s) && !confusable.includes(s)));
    const rest = shuffle([...unlocked]
        .filter(s => !confusable.includes(s) && !sameGroup.includes(s)));
    return [...shuffle(confusable), ...sameGroup, ...rest].slice(0, count);
}
