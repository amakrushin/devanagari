import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildCodepointMap, decomposeWord} from '../js/words.js';

const data = JSON.parse(await readFile(new URL('../hebrew.json', import.meta.url), 'utf8'));
const dict = JSON.parse(await readFile(new URL('../hebrew-words.json', import.meta.url), 'utf8'));
const chars = data.groups.flatMap(g => g.chars);
const bySlug = new Map(chars.map(c => [c.slug, c]));
const group = id => data.groups.find(g => g.id === id);
const letterGroups = ['letters1', 'letters2', 'letters3'];
const letters = letterGroups.flatMap(id => group(id).chars);
const map = buildCodepointMap(data.groups);

const ALPHABET = 'אבגדהוזחטיכלמנסעפצקרשת';
const FINALS = new Map([['ך', 'כ'], ['ם', 'מ'], ['ן', 'נ'], ['ף', 'פ'], ['ץ', 'צ']]);
const HEBREW_WORD = /^[א-ת]+$/;

test('HasFiveGroupsInTeachingOrder', () => {
    assert.equal(data.version, 1);
    assert.deepEqual(data.groups.map(g => g.id), [...letterGroups, 'finals', 'hewords']);
});

test('CoversTwentyTwoLettersInTraditionalOrder', () => {
    assert.equal(letters.map(c => c.glyph).join(''), ALPHABET);
});

test('FinalFormsNameTheirBaseLetter', () => {
    const finals = group('finals').chars;
    assert.deepEqual(finals.map(c => c.glyph), [...FINALS.keys()]);
    for (const c of finals) {
        assert.ok(c.note.includes(FINALS.get(c.glyph)), `note of ${c.glyph} must name its base`);
        assert.ok(c.note.startsWith('final'), `note of ${c.glyph}`);
    }
});

test('EveryLetterIsSingleCodepointWithoutNiqqud', () => {
    for (const c of [...letters, ...group('finals').chars]) {
        assert.equal([...c.glyph].length, 1, `glyph ${c.glyph}`);
        assert.match(c.glyph, HEBREW_WORD);
    }
});

test('SlugsAreUniqueLowercaseAscii', () => {
    const slugs = chars.map(c => c.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const slug of slugs)
        assert.match(slug, /^[a-z0-9]+$/);
});

test('GlyphsAreUniqueAndNfc', () => {
    assert.equal(new Set(chars.map(c => c.glyph)).size, chars.length);
    for (const c of chars) {
        assert.equal(c.glyph, c.glyph.normalize('NFC'), `${c.glyph} must be NFC`);
        assert.ok(!c.glyph.includes(' '), `${c.glyph} would be treated as a phrase`);
    }
});

test('EveryCharacterHasGlyphRomanSlugNote', () => {
    for (const c of chars) {
        assert.ok(c.glyph, `missing glyph near ${c.slug}`);
        assert.ok(c.roman, `missing roman for ${c.slug}`);
        assert.ok(c.note, `missing note for ${c.slug}`);
        assert.doesNotMatch(c.roman, /[א-ת]/, `roman of ${c.slug} must be Latin`);
    }
});

test('RomansAreUniqueWithinEachGroup', () => {
    for (const g of data.groups) {
        const romans = g.chars.map(c => c.roman);
        assert.equal(new Set(romans).size, romans.length, `duplicate roman in ${g.id}`);
    }
});

test('ConfusablePairsReferenceExistingSlugs', () => {
    assert.ok(data.confusables.length >= 5);
    for (const pair of data.confusables) {
        assert.equal(pair.length, 2);
        for (const slug of pair)
            assert.ok(bySlug.has(slug), `unknown slug in confusables: ${slug}`);
    }
});

test('RecallWordsCarryMeaningsAndDecompose', () => {
    const words = group('hewords');
    assert.equal(words.quiz, 'recall');
    assert.ok(words.chars.length >= 30);
    for (const c of words.chars) {
        assert.match(c.glyph, HEBREW_WORD, `word shape of ${c.glyph}`);
        assert.ok(c.note && c.note === c.note.toLowerCase(), `meaning for ${c.glyph}`);
        assert.ok(decomposeWord(c.glyph, map), `${c.glyph} must decompose`);
    }
});

test('RecallWordsUseEveryFinalForm', () => {
    const text = group('hewords').chars.map(c => c.glyph).join('');
    for (const final of FINALS.keys())
        assert.ok(text.includes(final), `no recall word ends in ${final}`);
});

test('DailyWordsAreWellFormedAndDecompose', () => {
    assert.equal(dict.version, 1);
    assert.ok(dict.words.length >= 30);
    assert.equal(new Set(dict.words.map(w => w.d)).size, dict.words.length);
    const recall = new Set(group('hewords').chars.map(c => c.glyph));
    for (const w of dict.words) {
        assert.match(w.d, HEBREW_WORD, `word shape of ${w.d}`);
        assert.match(w.r, /^[a-z]+$/, `reading of ${w.d}`);
        assert.ok(w.e && w.e === w.e.toLowerCase(), `meaning of ${w.d}`);
        assert.ok(decomposeWord(w.d, map), `${w.d} contains untaught letters`);
        assert.ok(!recall.has(w.d), `${w.d} duplicates a recall card`);
    }
});
