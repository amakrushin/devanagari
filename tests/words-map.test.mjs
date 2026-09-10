import test from 'node:test';
import assert from 'node:assert/strict';
import {LEARNED_BOX} from '../js/scheduler.js';
import {CODEPOINT_SLUGS, buildCodepointMap, decomposeWord, pickWords, romanizeWord}
    from '../js/words.js';

const NBSP = ' ';
const RUSSIAN = [{id: 'letters', chars: [
    {glyph: `М${NBSP}м`, roman: 'म', slug: 'm'},
    {glyph: `А${NBSP}а`, roman: 'अ', slug: 'a'},
    {glyph: `Д${NBSP}д`, roman: 'द', slug: 'd'},
    {glyph: 'ь', roman: '्', slug: 'soft'},
]}];
const HEBREW = [{id: 'letters', chars: [
    {glyph: 'ש', roman: 'sh', slug: 'shin'},
    {glyph: 'ל', roman: 'l', slug: 'lamed'},
    {glyph: 'ו', roman: 'v', slug: 'vav'},
    {glyph: 'ם', roman: 'm', slug: 'memfinal'},
]}];

test('TwoCaseGlyphMapsBothCasesToOneSlug', () => {
    const map = buildCodepointMap(RUSSIAN);
    assert.equal(map.get('М'), 'm');
    assert.equal(map.get('м'), 'm');
    assert.equal(map.get('ь'), 'soft');
});

test('WhitespaceSeparatorsAreNotMapped', () => {
    const map = buildCodepointMap(RUSSIAN);
    assert.ok(!map.has(NBSP));
    assert.ok(!map.has(' '));
    assert.equal(map.size, 7);
});

test('SingleLetterGlyphsMapDirectly', () => {
    const map = buildCodepointMap(HEBREW);
    assert.equal(map.get('ש'), 'shin');
    assert.equal(map.get('ם'), 'memfinal');
});

test('FirstGroupWinsOnRepeatedCodepoint', () => {
    const map = buildCodepointMap([
        {id: 'a', chars: [{glyph: 'x', roman: 'x', slug: 'first'}]},
        {id: 'b', chars: [{glyph: 'x', roman: 'x', slug: 'second'}]},
    ]);
    assert.equal(map.get('x'), 'first');
});

test('EmptyGroupsGiveEmptyMap', () => {
    assert.equal(buildCodepointMap([]).size, 0);
});

test('DecomposesWithCustomMap', () => {
    const map = buildCodepointMap(RUSSIAN);
    assert.deepEqual(decomposeWord('мама', map), ['m', 'a', 'm', 'a']);
    assert.deepEqual(decomposeWord('Дама', map), ['d', 'a', 'm', 'a']);
    assert.deepEqual(decomposeWord('שלום', buildCodepointMap(HEBREW)),
        ['shin', 'lamed', 'vav', 'memfinal']);
});

test('UntaughtCodepointFailsWithCustomMap', () => {
    const map = buildCodepointMap(RUSSIAN);
    assert.equal(decomposeWord('дом', map), null);
    assert.equal(decomposeWord('', map), null);
});

test('CustomMapIgnoresDevanagariConjunctTable', () => {
    const map = buildCodepointMap(RUSSIAN);
    assert.equal(decomposeWord('क्ष', map), null);
});

test('RomanizesWithCustomMap', () => {
    const map = buildCodepointMap(RUSSIAN);
    assert.equal(romanizeWord('мама', RUSSIAN[0].chars, map), 'मअमअ');
    assert.equal(romanizeWord('дом', RUSSIAN[0].chars, map), null);
});

test('DefaultMapBehaviorUnchanged', () => {
    assert.deepEqual(decomposeWord('पानी'), ['pa', 'aa', 'na', 'ii']);
    assert.deepEqual(decomposeWord('पानी', CODEPOINT_SLUGS), ['pa', 'aa', 'na', 'ii']);
    assert.deepEqual(decomposeWord('क्षेत्र'), ['kshya', 'e', 'tra']);
});

test('PickWordsUsesTheGivenMap', () => {
    const map = buildCodepointMap(RUSSIAN);
    const progress = {chars: {m: {box: LEARNED_BOX}, a: {box: LEARNED_BOX}}, words: {}};
    const dict = [{d: 'мама', r: 'mama', e: 'mother'}, {d: 'дама', r: 'dama', e: 'lady'}];
    assert.deepEqual(pickWords(dict, progress, 2, map).map(w => w.d), ['мама']);
    assert.deepEqual(pickWords(dict, progress, 2), []);
});
