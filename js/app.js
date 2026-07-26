import * as sched from './scheduler.js';
import * as sound from './sound.js';
import * as words from './words.js';
import * as stats from './stats.js';

const APP_VERSION = '0.1.4';
const PROGRESS_KEY = 'devanagari.progress';

const state = {
    data: null,
    bySlug: new Map(),
    progress: null,
    words: [],
    queue: [],
    pos: 0,
    asked: 0,
    correct: 0,
    unlocked: [],
    cardShownMs: 0,
};

const $ = id => document.getElementById(id);

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text !== undefined)
        node.textContent = text;
    return node;
}

// Accepts any previously saved progress shape (localStorage or imported file)
// and migrates it to the current schema. Returns null when unusable.
function normalizeProgress(parsed) {
    if (!parsed || typeof parsed !== 'object' || typeof parsed.chars !== 'object' || !parsed.chars)
        return null;
    const v = typeof parsed.v === 'number' ? parsed.v : 0;
    if (v > sched.PROGRESS_VERSION)
        return null;
    const fresh = sched.initProgress();
    return {
        ...fresh,
        ...parsed,
        v: sched.PROGRESS_VERSION,
        // v0 -> v1: word cards and practice stats arrived with v1.
        words: parsed.words ?? fresh.words,
        stats: {...fresh.stats, ...(parsed.stats ?? {})},
        // Progress saved before course selection existed has no selectedGroup.
        selectedGroup: Math.min(parsed.selectedGroup ?? 0, state.data.groups.length - 1),
    };
}

function loadProgress() {
    try {
        const normalized = normalizeProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY)));
        if (normalized)
            return normalized;
    } catch {
        // Corrupt storage: start fresh; "Reset progress" stays available on home.
    }
    return sched.initProgress();
}

function saveProgress() {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(state.progress));
}

function show(id) {
    for (const section of document.querySelectorAll('main > section'))
        section.hidden = section.id !== id;
}

function renderHome() {
    show('screen-home');
    const s = state.progress.stats;
    const statsLine = $('home-stats');
    statsLine.hidden = s.daysActive === 0;
    if (s.daysActive > 0) {
        const days = `${s.daysActive} ${s.daysActive === 1 ? 'day' : 'days'}`;
        statsLine.textContent = `${days} · streak ${s.streak} · ${stats.formatTime(s.timeMs)}`;
    }
    const list = $('group-list');
    list.textContent = '';
    state.data.groups.forEach((group, idx) => {
        const locked = idx > state.progress.activeGroup;
        const learned = group.chars.filter(c => {
            const st = state.progress.chars[c.slug];
            return st && st.box >= sched.LEARNED_BOX;
        }).length;

        const selected = idx === state.progress.selectedGroup;
        const row = el('div', 'group-row' + (locked ? ' locked' : '') + (selected ? ' selected' : ''));
        const top = el('div', 'row-top');
        top.append(
            el('span', 'group-name', group.label),
            el('span', 'group-count', locked ? 'locked' : `${learned}/${group.chars.length}`));
        const bar = el('div', 'bar');
        const fill = el('div');
        fill.style.width = `${Math.round(100 * learned / group.chars.length)}%`;
        bar.append(fill);
        row.append(top, el('div', 'group-glyphs', group.chars.map(c => c.glyph).join(' ')), bar);
        if (!locked) {
            row.addEventListener('click', () => {
                sound.click();
                state.progress.selectedGroup = idx;
                saveProgress();
                renderHome();
            });
        }
        list.append(row);
    });
}

function clearQuizZones() {
    const stage = $('quiz-stage');
    const actions = $('quiz-actions');
    stage.textContent = '';
    actions.textContent = '';
    return {stage, actions};
}

function startSession() {
    sound.sessionStart();
    state.queue = words.insertWordCards(
        sched.buildSession(state.progress, state.data, Date.now(),
            {groupIndex: state.progress.selectedGroup}),
        words.pickWords(state.words, state.progress));
    state.pos = 0;
    state.asked = 0;
    state.correct = 0;
    state.unlocked = [];
    state.progress.sessions += 1;
    stats.touchDay(state.progress.stats, Date.now());
    saveProgress();
    show('screen-quiz');
    step();
}

function step() {
    $('quiz-remaining').textContent = `${Math.max(0, state.queue.length - state.pos)} left`;
    if (state.pos >= state.queue.length) {
        showSummary();
        return;
    }
    state.cardShownMs = Date.now();
    const item = state.queue[state.pos];
    if (item.word)
        showWord(item.word);
    else if (item.isNew && !state.progress.chars[item.slug])
        showMeet(item);
    else
        showQuestion(item);
}

// Counts the time a card was on screen into the practice stats.
function trackCardTime() {
    const now = Date.now();
    stats.addTime(state.progress.stats, now - state.cardShownMs);
    state.cardShownMs = now;
}

function showMeet(item) {
    sound.newChar();
    const c = state.bySlug.get(item.slug);
    const {stage, actions} = clearQuizZones();
    stage.append(el('p', 'tag', 'new character'), el('p', 'glyph', c.glyph), el('p', 'roman-big', c.roman));
    if (c.note)
        stage.append(el('p', 'note', c.note));
    const btn = el('button', 'btn btn-primary', 'Continue');
    btn.addEventListener('click', () => {
        sound.click();
        trackCardTime();
        sched.meetChar(state.progress, c.slug, Date.now());
        saveProgress();
        showQuestion(item);
    });
    actions.append(btn);
}

// A word made of learned characters: no question, just the word, then the
// reading and meaning revealed on the same card.
function showWord(word) {
    sound.newChar();
    const {stage, actions} = clearQuizZones();
    stage.append(el('p', 'tag', 'word'), el('p', 'glyph glyph-word', word.d));
    const btn = el('button', 'btn btn-primary', 'Continue');
    let revealed = false;
    btn.addEventListener('click', () => {
        sound.click();
        trackCardTime();
        if (!revealed) {
            revealed = true;
            state.progress.words[word.d] = Date.now();
            saveProgress();
            stage.append(el('p', 'roman-big', word.r), el('p', 'note', word.e));
            return;
        }
        saveProgress();
        state.pos += 1;
        step();
    });
    actions.append(btn);
}

function showQuestion(item) {
    const c = state.bySlug.get(item.slug);
    const options = sched.shuffle([c.slug, ...sched.pickDistractors(state.data, state.progress, c.slug)]);
    const {stage, actions} = clearQuizZones();
    stage.append(el('p', 'glyph', c.glyph));
    const grid = el('div', 'options');
    const buttons = new Map();
    for (const slug of options) {
        const btn = el('button', 'btn', state.bySlug.get(slug).roman);
        btn.addEventListener('click', () => answer(item, slug, buttons));
        buttons.set(slug, btn);
        grid.append(btn);
    }
    actions.append(grid);
}

function answer(item, chosen, buttons) {
    const correct = chosen === item.slug;
    if (correct)
        sound.correct();
    else
        sound.wrong();
    for (const btn of buttons.values())
        btn.disabled = true;
    buttons.get(item.slug).classList.add('correct');
    if (!correct)
        buttons.get(chosen).classList.add('wrong');

    sched.applyAnswer(state.progress, item.slug, correct, Date.now());
    trackCardTime();
    state.asked += 1;
    if (correct) {
        state.correct += 1;
    } else if (!state.queue.slice(state.pos + 1).some(q => q.slug === item.slug)) {
        // Drill the missed character once more before the session ends.
        state.queue.push({slug: item.slug, isNew: false});
    }
    const opened = sched.tryUnlock(state.progress, state.data);
    if (opened)
        state.unlocked.push(opened.label);
    saveProgress();
    setTimeout(() => {
        state.pos += 1;
        step();
    }, correct ? 800 : 1700);
}

function showSummary() {
    sound.results();
    const {stage, actions} = clearQuizZones();
    stage.append(
        el('p', 'big', `${state.correct} / ${state.asked}`),
        el('p', 'note', 'correct answers'));
    for (const label of state.unlocked)
        stage.append(el('p', 'unlock-note', `New group unlocked: ${label}`));
    const btn = el('button', 'btn btn-primary', 'Done');
    btn.addEventListener('click', () => {
        sound.click();
        renderHome();
    });
    actions.append(btn);
}

function flashButton(id, message) {
    const btn = $(id);
    const original = btn.textContent;
    btn.textContent = message;
    setTimeout(() => { btn.textContent = original; }, 1500);
}

async function shareApp() {
    sound.click();
    const url = location.href;
    if (navigator.share) {
        try {
            await navigator.share({title: 'devanagari', url});
        } catch {
            // user dismissed the share sheet
        }
        return;
    }
    try {
        await navigator.clipboard.writeText(url);
        flashButton('btn-share', 'copied!');
    } catch {
        // clipboard unavailable (insecure context)
    }
}

async function exportProgress() {
    sound.click();
    const text = JSON.stringify(state.progress, null, 2);
    const name = `devanagari-progress-${stats.localDayString(Date.now())}.txt`;
    // .txt + text/plain so iPhone Files previews the backup.
    const file = new File([text], name, {type: 'text/plain'});
    if (navigator.canShare?.({files: [file]})) {
        try {
            await navigator.share({files: [file], title: name});
        } catch {
            // user dismissed the share sheet
        }
        return;
    }
    const url = URL.createObjectURL(file);
    const link = el('a');
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importProgress(file) {
    let parsed;
    try {
        parsed = JSON.parse(await file.text());
    } catch {
        flashButton('btn-import', 'invalid file');
        return;
    }
    if ((parsed?.v ?? 0) > sched.PROGRESS_VERSION) {
        flashButton('btn-import', 'newer app needed');
        return;
    }
    const normalized = normalizeProgress(parsed);
    if (!normalized) {
        flashButton('btn-import', 'invalid file');
        return;
    }
    if (!confirm('Replace current progress with the loaded file?'))
        return;
    state.progress = normalized;
    // All groups are open by design for now, matching init().
    state.progress.activeGroup = state.data.groups.length - 1;
    saveProgress();
    renderHome();
}

function resetProgress() {
    sound.click();
    if (!confirm('Delete all learning progress?'))
        return;
    localStorage.removeItem(PROGRESS_KEY);
    state.progress = sched.initProgress();
    renderHome();
}

async function init() {
    try {
        const response = await fetch('characters.json');
        state.data = await response.json();
    } catch {
        $('loading').textContent = 'Failed to load characters.json';
        return;
    }
    $('loading').remove();
    state.bySlug = new Map(state.data.groups.flatMap(g => g.chars).map(c => [c.slug, c]));
    try {
        const parsed = await (await fetch('words.json')).json();
        if (Array.isArray(parsed?.words))
            state.words = parsed.words;
    } catch {
        // Words are optional: sessions simply run without word cards.
    }
    state.progress = loadProgress();
    // All groups are open by design for now; gating may return with future content.
    state.progress.activeGroup = state.data.groups.length - 1;
    $('app-version').textContent = `v${APP_VERSION}`;
    $('btn-start').addEventListener('click', startSession);
    $('btn-share').addEventListener('click', shareApp);
    $('btn-export').addEventListener('click', exportProgress);
    $('btn-import').addEventListener('click', () => {
        sound.click();
        $('import-file').click();
    });
    $('import-file').addEventListener('change', async event => {
        const file = event.target.files[0];
        // Reset so picking the same file again still fires a change event.
        event.target.value = '';
        if (file)
            await importProgress(file);
    });
    $('btn-reset').addEventListener('click', resetProgress);
    $('btn-quit').addEventListener('click', () => {
        sound.click();
        renderHome();
    });
    renderHome();
    sound.appStart();
    if ('serviceWorker' in navigator)
        navigator.serviceWorker.register('./sw.js').catch(() => {});
}

if (typeof document !== 'undefined')
    init();
