import * as sched from './scheduler.js';
import * as sound from './sound.js';

const APP_VERSION = '0.1.1';
const PROGRESS_KEY = 'devanagari.progress';

const state = {
    data: null,
    bySlug: new Map(),
    progress: null,
    queue: [],
    pos: 0,
    asked: 0,
    correct: 0,
    unlocked: [],
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

function loadProgress() {
    try {
        const parsed = JSON.parse(localStorage.getItem(PROGRESS_KEY));
        if (parsed && parsed.chars)
            return parsed;
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
    const list = $('group-list');
    list.textContent = '';
    state.data.groups.forEach((group, idx) => {
        const locked = idx > state.progress.activeGroup;
        const learned = group.chars.filter(c => {
            const st = state.progress.chars[c.slug];
            return st && st.box >= sched.LEARNED_BOX;
        }).length;

        const row = el('div', 'group-row' + (locked ? ' locked' : ''));
        const top = el('div', 'row-top');
        top.append(
            el('span', 'group-name', group.label),
            el('span', 'group-count', locked ? 'locked' : `${learned}/${group.chars.length}`));
        const bar = el('div', 'bar');
        const fill = el('div');
        fill.style.width = `${Math.round(100 * learned / group.chars.length)}%`;
        bar.append(fill);
        row.append(top, el('div', 'group-glyphs', group.chars.map(c => c.glyph).join(' ')), bar);
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
    state.queue = sched.buildSession(state.progress, state.data, Date.now());
    state.pos = 0;
    state.asked = 0;
    state.correct = 0;
    state.unlocked = [];
    state.progress.sessions += 1;
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
    const item = state.queue[state.pos];
    if (item.isNew && !state.progress.chars[item.slug])
        showMeet(item);
    else
        showQuestion(item);
}

function showMeet(item) {
    const c = state.bySlug.get(item.slug);
    const {stage, actions} = clearQuizZones();
    stage.append(el('p', 'tag', 'new letter'), el('p', 'glyph', c.glyph), el('p', 'roman-big', c.roman));
    if (c.note)
        stage.append(el('p', 'note', c.note));
    const btn = el('button', 'btn btn-primary', 'Continue');
    btn.addEventListener('click', () => {
        sched.meetChar(state.progress, c.slug, Date.now());
        saveProgress();
        showQuestion(item);
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
    for (const btn of buttons.values())
        btn.disabled = true;
    buttons.get(item.slug).classList.add('correct');
    if (!correct)
        buttons.get(chosen).classList.add('wrong');

    sched.applyAnswer(state.progress, item.slug, correct, Date.now());
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

function resetProgress() {
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
    state.progress = loadProgress();
    $('app-version').textContent = `v${APP_VERSION}`;
    $('btn-start').addEventListener('click', startSession);
    $('btn-reset').addEventListener('click', resetProgress);
    $('btn-quit').addEventListener('click', renderHome);
    renderHome();
    sound.appStart();
    if ('serviceWorker' in navigator)
        navigator.serviceWorker.register('./sw.js').catch(() => {});
}

if (typeof document !== 'undefined')
    init();
