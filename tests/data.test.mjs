import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('../characters.json', import.meta.url), 'utf8'));
const chars = data.groups.flatMap(g => g.chars);
const bySlug = new Map(chars.map(c => [c.slug, c]));

test('HasFiftyNineCharacters', () => {
    assert.equal(chars.length, 59);
});

test('HasTwoGroupsCharactersAndDigits', () => {
    assert.deepEqual(data.groups.map(g => g.id), ['characters', 'digits']);
});

test('SlugsAreUniqueLowercaseAscii', () => {
    const slugs = chars.map(c => c.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    for (const slug of slugs)
        assert.match(slug, /^[a-z0-9]+$/);
});

test('GlyphsAreUnique', () => {
    assert.equal(new Set(chars.map(c => c.glyph)).size, chars.length);
});

test('EveryCharacterHasGlyphRomanSlug', () => {
    for (const c of chars) {
        assert.ok(c.glyph, `missing glyph near slug ${c.slug}`);
        assert.ok(c.roman, `missing roman for ${c.slug}`);
        assert.ok(c.slug);
    }
});

test('ConfusablePairsReferenceExistingSlugs', () => {
    for (const pair of data.confusables) {
        assert.equal(pair.length, 2);
        for (const slug of pair)
            assert.ok(bySlug.has(slug), `unknown slug in confusables: ${slug}`);
    }
});

test('HomophoneCharsCarrySchoolNameTts', () => {
    for (const slug of ['i', 'ii', 'u', 'uu', 'sha', 'ssa', 'sa', 'nna'])
        assert.ok(bySlug.get(slug).tts, `${slug} needs a school-name tts override`);
});

test('DigitsCarryWordTts', () => {
    for (const c of chars.filter(c => /^d[0-9]$/.test(c.slug)))
        assert.ok(c.tts, `digit ${c.slug} needs a word tts override`);
});
