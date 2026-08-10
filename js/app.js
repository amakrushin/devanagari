import * as sched from './scheduler.js';
import * as sound from './sound.js';
import * as words from './words.js';
import * as stats from './stats.js';

const APP_VERSION = '0.2.0';
const PROGRESS_KEY = 'devanagari.progress';

const state = {
    data: null,
    bySlug: new Map(),
    groupBySlug: new Map(),
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

// Multi-character glyphs (words, long conjunct words) need the smaller size;
// multi-word phrases need an even smaller, wrapping one.
function glyphClass(glyph) {
    if (isPhrase(glyph))
        return 'glyph glyph-phrase';
    return [...glyph].length > 3 ? 'glyph glyph-word' : 'glyph';
}

function isPhrase(glyph) {
    return glyph.includes(' ');
}

function loadProgress() {
    try {
        const normalized = sched.normalizeProgress(JSON.parse(localStorage.getItem(PROGRESS_KEY)),
            state.data);
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

// All groups are open by design for now; gating may return with future content.
function openAllGroups(progress) {
    progress.activeGroup = state.data.groups.length - 1;
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

        const selected = group.id === state.progress.selectedGroup;
        const row = el('div', 'group-row' + (locked ? ' locked' : '') + (selected ? ' selected' : ''));
        const top = el('div', 'row-top');
        top.append(
            el('span', 'group-name', group.label),
            el('span', 'group-count', locked ? 'locked' : `${learned}/${group.chars.length}`));
        const bar = el('div', 'bar');
        const fill = el('div');
        fill.style.width = `${Math.round(100 * learned / group.chars.length)}%`;
        bar.append(fill);
        // Large groups would flood the row; show a taste of the content.
        // Phrase groups get fewer items and a visible separator.
        const phrases = group.chars.some(c => isPhrase(c.glyph));
        const shown = phrases ? 6 : 40;
        const preview = group.chars.slice(0, shown).map(c => c.glyph).join(phrases ? ' · ' : ' ')
            + (group.chars.length > shown ? ' …' : '');
        row.append(top, el('div', 'group-glyphs', preview), bar);
        if (!locked) {
            row.addEventListener('click', () => {
                sound.click();
                state.progress.selectedGroup = group.id;
                saveProgress();
                renderHome();
            });
        }
        list.append(row);
    });
    renderMaxNew();
}

function renderMaxNew() {
    $('maxnew-value').textContent = String(state.progress.settings.maxNew);
}

// Only the value span updates: re-rendering the whole home screen here would
// reset the group list's scroll position.
function bumpMaxNew(delta) {
    sound.click();
    const settings = state.progress.settings;
    settings.maxNew = Math.max(0, Math.min(sched.MAX_NEW_LIMIT, settings.maxNew + delta));
    saveProgress();
    renderMaxNew();
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
    // Selection is stored as a group id; the scheduler scopes by index.
    const groupIndex = Math.max(0,
        state.data.groups.findIndex(g => g.id === state.progress.selectedGroup));
    state.queue = words.insertWordCards(
        sched.buildSession(state.progress, state.data, Date.now(),
            {groupIndex, maxNew: state.progress.settings.maxNew}),
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
        showQuiz(item);
}

// Recall groups grade themselves; everything else gets the 4-option quiz.
function showQuiz(item) {
    if (state.groupBySlug.get(item.slug)?.quiz === 'recall')
        showRecall(item);
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
    const tag = isPhrase(c.glyph) ? 'new phrase'
        : state.groupBySlug.get(item.slug)?.quiz === 'recall' ? 'new word' : 'new character';
    stage.append(el('p', 'tag', tag), el('p', glyphClass(c.glyph), c.glyph),
        el('p', 'roman-big', c.roman));
    if (c.note)
        stage.append(el('p', 'note', c.note));
    const btn = el('button', 'btn btn-primary', 'Continue');
    btn.addEventListener('click', () => {
        sound.click();
        trackCardTime();
        sched.meetChar(state.progress, c.slug, Date.now());
        saveProgress();
        showQuiz(item);
    });
    actions.append(btn);
}

// A daily word: try reading it yourself, reveal the answer, then grade honestly.
function showRecall(item) {
    sound.newChar();
    const c = state.bySlug.get(item.slug);
    const {stage, actions} = clearQuizZones();
    stage.append(el('p', 'tag', isPhrase(c.glyph) ? 'phrase' : 'word'),
        el('p', glyphClass(c.glyph), c.glyph));
    const btn = el('button', 'btn btn-primary', 'Continue');
    btn.addEventListener('click', () => {
        sound.click();
        stage.append(el('p', 'roman-big', c.roman), el('p', 'note', c.note));
        const grade = (label, correct) => {
            const choice = el('button', 'btn', label);
            choice.addEventListener('click', () => {
                if (correct)
                    sound.correct();
                else
                    sound.wrong();
                recordAnswer(item, correct);
                state.pos += 1;
                step();
            });
            return choice;
        };
        const grid = el('div', 'options');
        grid.append(grade('I didn\'t', false), grade('I knew it', true));
        actions.textContent = '';
        actions.append(grid);
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
    stage.append(el('p', glyphClass(c.glyph), c.glyph));
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

// Shared outcome path for option quizzes and self-graded recall cards.
function recordAnswer(item, correct) {
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

    recordAnswer(item, correct);
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
    const normalized = sched.normalizeProgress(parsed, state.data);
    if (!normalized) {
        flashButton('btn-import', 'invalid file');
        return;
    }
    if (!confirm('Replace current progress with the loaded file?'))
        return;
    state.progress = normalized;
    openAllGroups(state.progress);
    saveProgress();
    renderHome();
}

function resetProgress() {
    sound.click();
    if (!confirm('Delete all learning progress?'))
        return;
    localStorage.removeItem(PROGRESS_KEY);
    state.progress = sched.initProgress();
    openAllGroups(state.progress);
    renderHome();
}

// Asks the service worker for a new app version; reloads once it takes over.
async function checkUpdates() {
    sound.click();
    try {
        const registration = await navigator.serviceWorker?.getRegistration();
        if (!registration) {
            flashButton('btn-update', 'unavailable');
            return;
        }
        await registration.update();
        if (registration.installing || registration.waiting) {
            navigator.serviceWorker.addEventListener('controllerchange',
                () => location.reload(), {once: true});
            flashButton('btn-update', 'updating…');
        } else {
            flashButton('btn-update', 'up to date');
        }
    } catch {
        flashButton('btn-update', 'check failed');
    }
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
    state.groupBySlug = new Map(state.data.groups.flatMap(g => g.chars.map(c => [c.slug, g])));
    try {
        const parsed = await (await fetch('words.json')).json();
        if (Array.isArray(parsed?.words))
            state.words = parsed.words;
    } catch {
        // Words are optional: sessions simply run without word cards.
    }
    state.progress = loadProgress();
    openAllGroups(state.progress);
    $('app-version').textContent = `v${APP_VERSION}`;
    $('btn-start').addEventListener('click', startSession);
    $('btn-newless').addEventListener('click', () => bumpMaxNew(-1));
    $('btn-newmore').addEventListener('click', () => bumpMaxNew(1));
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
    $('btn-update').addEventListener('click', checkUpdates);
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
