import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildCodepointMap, decomposeWord} from '../js/words.js';

const data = JSON.parse(await readFile(new URL('../russian.json', import.meta.url), 'utf8'));
const dict = JSON.parse(await readFile(new URL('../russian-words.json', import.meta.url), 'utf8'));
const chars = data.groups.flatMap(g => g.chars);
const bySlug = new Map(chars.map(c => [c.slug, c]));
const group = id => data.groups.find(g => g.id === id);
const letterGroups = ['vowels', 'consonants1', 'consonants2', 'consonants3', 'signs'];
const phraseGroups = ['greetings', 'basics', 'shopping', 'directions', 'questions'];
const letters = letterGroups.flatMap(id => group(id).chars);
const phrases = phraseGroups.flatMap(id => group(id).chars);
const nonPhrases = chars.filter(c => !phrases.includes(c));
const devanagari = JSON.parse(await readFile(new URL('../characters.json', import.meta.url), 'utf8'));
const map = buildCodepointMap(data.groups);

const NBSP = ' ';
const ALPHABET = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя';

test('HasLettersThenWordsThenPhraseTopics', () => {
    assert.equal(data.version, 1);
    assert.deepEqual(data.groups.map(g => g.id), [...letterGroups, 'ruwords', ...phraseGroups]);
});

test('CoversAllThirtyThreeLettersExactlyOnce', () => {
    const lower = letters.map(c => [...c.glyph].at(-1));
    assert.equal(lower.length, 33);
    assert.deepEqual([...lower].sort(), [...ALPHABET].sort());
});

test('LettersShowUpperNbspLowerExceptSigns', () => {
    for (const c of letters) {
        if (c.slug === 'soft' || c.slug === 'hard') {
            assert.equal([...c.glyph].length, 1, `${c.slug} is single-case`);
            continue;
        }
        const cps = [...c.glyph];
        assert.equal(cps.length, 3, `shape of ${c.glyph}`);
        assert.equal(cps[1], NBSP, `separator in ${c.glyph}`);
        assert.equal(cps[0], cps[2].toUpperCase(), `cases in ${c.glyph}`);
        assert.equal(cps[2], cps[2].toLowerCase(), `lowercase in ${c.glyph}`);
    }
});

test('NoLetterOrWordGlyphContainsAPlainSpace', () => {
    for (const c of nonPhrases)
        assert.ok(!c.glyph.includes(' '), `${c.glyph} would be treated as a phrase`);
});

test('SlugsAreUniqueLowercaseAscii', () => {
    const slugs = chars.map(c => c.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const slug of slugs)
        assert.match(slug, /^[a-z0-9]+$/);
});

test('GlyphsAreUniqueAndNfc', () => {
    assert.equal(new Set(chars.map(c => c.glyph)).size, chars.length);
    for (const c of chars)
        assert.equal(c.glyph, c.glyph.normalize('NFC'), `${c.glyph} must be NFC`);
});

test('EveryCharacterHasGlyphRomanSlug', () => {
    for (const c of chars) {
        assert.ok(c.glyph, `missing glyph near ${c.slug}`);
        assert.ok(c.roman, `missing roman for ${c.slug}`);
        assert.ok(c.slug);
    }
});

test('RomansAreDevanagariAndUniqueWithinEachGroup', () => {
    for (const g of data.groups) {
        const romans = g.chars.map(c => c.roman);
        assert.equal(new Set(romans).size, romans.length, `duplicate roman in ${g.id}`);
        const shape = phraseGroups.includes(g.id) ? /^[ऀ-ॿ-]+( [ऀ-ॿ-]+)*\??$/ : /^[ऀ-ॿ]+$/;
        for (const roman of romans)
            assert.match(roman, shape, `roman of ${g.id} must be Devanagari: ${roman}`);
    }
});

test('PhraseGroupsMirrorTheDevanagariTopics', () => {
    for (const id of phraseGroups) {
        const g = group(id);
        const source = devanagari.groups.find(d => d.id === id);
        assert.equal(g.quiz, 'recall', `${id} must be a recall group`);
        assert.equal(g.audio, true, `${id} must be audible`);
        assert.equal(g.label, source.label, `${id} label`);
        assert.equal(g.chars.length, source.chars.length, `${id} size`);
        g.chars.forEach((c, i) => {
            assert.equal(c.note, source.chars[i].note.replace('nepali', 'russian'), `${c.glyph} note`);
            assert.match(c.glyph, /^[А-ЯЁ][а-яё-]*( [а-яё-]+)*[.?]$/, `phrase shape of ${c.glyph}`);
            assert.ok(c.glyph.includes(' '), `${c.glyph} must be multi-word`);
            assert.equal(c.glyph.endsWith('?'), c.roman.endsWith('?'), `question mark of ${c.glyph}`);
            assert.match(c.slug, /^p[a-z]+$/, `slug of ${c.glyph}`);
            assert.equal(c.glyph, c.glyph.normalize('NFC'), `${c.glyph} must be NFC`);
        });
    }
});

test('ApproximatedLettersCarryNotes', () => {
    for (const slug of ['y', 'zh', 'ts', 'soft', 'hard', 'shch', 'yo', 'z', 'kh', 'f', 'yot'])
        assert.ok(bySlug.get(slug).note, `${slug} needs a note`);
});

test('EveryLetterSpeaksItsCyrillicName', () => {
    for (const c of letters)
        assert.match(c.tts ?? '', /^[а-яё]+( [а-яё]+)?$/, `${c.slug} needs a letter name in tts`);
    assert.equal(bySlug.get('yot').tts, 'и краткое');
    assert.equal(bySlug.get('soft').tts, 'мягкий знак');
    assert.equal(bySlug.get('hard').tts, 'твёрдый знак');
});

test('EveryGroupIsAudible', () => {
    for (const g of data.groups)
        assert.equal(g.audio, true, `${g.id} must be audible`);
});

test('ConfusablePairsReferenceExistingSlugs', () => {
    assert.deepEqual(data.confusables, [['i', 'yot'], ['sh', 'shch'], ['soft', 'hard'], ['ye', 'yo']]);
    for (const pair of data.confusables)
        for (const slug of pair)
            assert.ok(bySlug.has(slug), `unknown slug in confusables: ${slug}`);
});

test('RecallWordsCarryMeaningsAndDecompose', () => {
    const words = group('ruwords');
    assert.equal(words.quiz, 'recall');
    assert.ok(words.chars.length >= 30);
    for (const c of words.chars) {
        assert.match(c.glyph, /^[а-яё]+$/, `word shape of ${c.glyph}`);
        assert.ok(c.note && c.note === c.note.toLowerCase(), `meaning for ${c.glyph}`);
        assert.ok(decomposeWord(c.glyph, map), `${c.glyph} must decompose`);
    }
});

test('CodepointMapCoversBothCases', () => {
    for (const letter of ALPHABET) {
        assert.ok(map.has(letter), `lowercase ${letter}`);
        if (letter !== 'ь' && letter !== 'ъ' && letter !== 'ы')
            assert.equal(map.get(letter.toUpperCase()), map.get(letter), `uppercase ${letter}`);
    }
    assert.ok(!map.has(NBSP));
});

test('DailyWordsAreWellFormedAndDecompose', () => {
    assert.equal(dict.version, 1);
    assert.ok(dict.words.length >= 30);
    assert.equal(new Set(dict.words.map(w => w.d)).size, dict.words.length);
    const recall = new Set(group('ruwords').chars.map(c => c.glyph));
    for (const w of dict.words) {
        assert.match(w.d, /^[а-яё]+$/, `word shape of ${w.d}`);
        assert.match(w.r, /^[ऀ-ॿ]+$/, `reading of ${w.d}`);
        assert.ok(w.e, `meaning of ${w.d}`);
        assert.equal(w.e.replace(/\bI\b/g, ''), w.e.replace(/\bI\b/g, '').toLowerCase(),
            `capitalized gloss for ${w.d}`);
        assert.ok(decomposeWord(w.d, map), `${w.d} contains untaught letters`);
        assert.ok(!recall.has(w.d), `${w.d} duplicates a recall card`);
    }
});
