import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decomposeWord, romanizeWord} from '../js/words.js';

const data = JSON.parse(await readFile(new URL('../words.json', import.meta.url), 'utf8'));
const chars = JSON.parse(await readFile(new URL('../characters.json', import.meta.url), 'utf8'))
    .groups.flatMap(g => g.chars);

// Standalone "I" is the one legitimate capital in a gloss.
const withoutI = text => text.replace(/\bI\b/g, '');

test('HasVersionAndWordsArray', () => {
    assert.equal(data.version, 1);
    assert.ok(Array.isArray(data.words));
    assert.ok(data.words.length > 0);
});

test('EveryWordHasDevanagariRomanEnglish', () => {
    for (const w of data.words) {
        assert.ok(w.d && typeof w.d === 'string', `missing d near ${JSON.stringify(w)}`);
        assert.ok(w.r && typeof w.r === 'string', `missing r for ${w.d}`);
        assert.ok(w.e && typeof w.e === 'string', `missing e for ${w.d}`);
    }
});

test('DevanagariEntriesAreUnique', () => {
    assert.equal(new Set(data.words.map(w => w.d)).size, data.words.length);
});

test('EntriesAreNfcNormalized', () => {
    for (const w of data.words)
        assert.equal(w.d, w.d.normalize('NFC'), `${w.d} is not NFC-normalized`);
});

test('EveryWordDecomposesIntoTaughtCharacters', () => {
    for (const w of data.words)
        assert.ok(decomposeWord(w.d), `${w.d} contains untaught characters`);
});

test('RomanMatchesTaughtScheme', () => {
    for (const w of data.words)
        assert.equal(w.r, romanizeWord(w.d, chars), `roman mismatch for ${w.d}`);
});

test('NoDevanagariInRomanOrEnglish', () => {
    for (const w of data.words) {
        assert.doesNotMatch(w.r, /[ऀ-ॿ]/, `Devanagari in roman of ${w.d}`);
        assert.doesNotMatch(w.e, /[ऀ-ॿ]/, `Devanagari in gloss of ${w.d}`);
    }
});

// Guards against proper nouns slipping in: glosses are lowercase phrases.
test('GlossesAreLowercase', () => {
    for (const w of data.words)
        assert.equal(withoutI(w.e), withoutI(w.e).toLowerCase(), `capitalized gloss for ${w.d}`);
});
