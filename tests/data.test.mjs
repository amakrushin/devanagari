import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {decomposeWord, romanizeWord} from '../js/words.js';

const data = JSON.parse(await readFile(new URL('../characters.json', import.meta.url), 'utf8'));
const chars = data.groups.flatMap(g => g.chars);
const bySlug = new Map(chars.map(c => [c.slug, c]));
const group = id => data.groups.find(g => g.id === id);

test('HasFiveGroupsInPedagogicalOrder', () => {
    assert.deepEqual(data.groups.map(g => g.id),
        ['characters', 'combos', 'conjuncts', 'words', 'digits']);
});

test('GroupSizesMatchCourseDesign', () => {
    assert.deepEqual(data.groups.map(g => g.chars.length), [49, 395, 44, 100, 10]);
});

// The restore guarantee: progress boxes are keyed by these slugs, and old
// backups must keep meaning the same characters forever.
test('OriginalCharactersAndDigitsAreFrozen', () => {
    const frozen = {
        a: 'अ', aa: 'आ', i: 'इ', ii: 'ई', u: 'उ', uu: 'ऊ', ri: 'ऋ',
        e: 'ए', ai: 'ऐ', o: 'ओ', au: 'औ', am: 'अं', ah: 'अः',
        ka: 'क', kha: 'ख', ga: 'ग', gha: 'घ', nga: 'ङ',
        cha: 'च', chha: 'छ', ja: 'ज', jha: 'झ', nya: 'ञ',
        tta: 'ट', ttha: 'ठ', dda: 'ड', ddha: 'ढ', nna: 'ण',
        ta: 'त', tha: 'थ', da: 'द', dha: 'ध', na: 'न',
        pa: 'प', pha: 'फ', ba: 'ब', bha: 'भ', ma: 'म',
        ya: 'य', ra: 'र', la: 'ल', wa: 'व',
        sha: 'श', ssa: 'ष', sa: 'स', ha: 'ह',
        kshya: 'क्ष', tra: 'त्र', gya: 'ज्ञ',
        d0: '०', d1: '१', d2: '२', d3: '३', d4: '४',
        d5: '५', d6: '६', d7: '७', d8: '८', d9: '९',
    };
    const current = Object.fromEntries(
        [...group('characters').chars, ...group('digits').chars].map(c => [c.slug, c.glyph]));
    assert.deepEqual(current, frozen);
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

test('RomansAreUniqueWithinEachGroup', () => {
    for (const g of data.groups) {
        const romans = g.chars.map(c => c.roman);
        assert.equal(new Set(romans).size, romans.length, `duplicate roman in ${g.id}`);
    }
});

test('CombosCoverConsonantByVowelGrid', () => {
    const combos = group('combos').chars;
    assert.equal(combos.length, 33 * 12 - 1, 'the full grid minus the dead रृ cell');
    const signs = ['ा', 'ि', 'ी', 'ु', 'ू', 'ृ', 'े', 'ै', 'ो', 'ौ', 'ं', 'ः'];
    for (const c of combos) {
        const cps = [...c.glyph];
        assert.equal(cps.length, 2, `combo ${c.glyph}`);
        assert.ok(cps[0] >= 'क' && cps[0] <= 'ह', `consonant in ${c.glyph}`);
        assert.ok(signs.includes(cps[1]), `sign in ${c.glyph}`);
        assert.equal(c.roman, romanizeWord(c.glyph, group('characters').chars),
            `roman of ${c.glyph}`);
    }
    assert.ok(!combos.some(c => c.glyph === 'रृ'));
    assert.equal(combos.find(c => c.glyph === 'रि').slug, 'rri', 'ऋ owns the plain ri slug');
});

test('ConjunctsAreViramaClustersOfTaughtConsonants', () => {
    const consonants = new Set(group('characters').chars.map(c => c.glyph)
        .filter(g => [...g].length === 1 && g >= 'क' && g <= 'ह'));
    for (const c of group('conjuncts').chars) {
        const cps = [...c.glyph];
        assert.equal(cps.length, 3, `cluster ${c.glyph}`);
        assert.equal(cps[1], '्', `virama in ${c.glyph}`);
        assert.ok(consonants.has(cps[0]) && consonants.has(cps[2]), `components of ${c.glyph}`);
        assert.ok(c.note, `note for ${c.glyph}`);
        assert.ok(!['क्ष', 'त्र', 'ज्ञ'].includes(c.glyph), 'base conjuncts stay in characters');
    }
});

test('WordsCarryMeaningAndDecompose', () => {
    const words = group('words');
    assert.equal(words.quiz, 'recall');
    assert.equal(words.chars.length, 100);
    const taught = [...group('characters').chars, ...group('conjuncts').chars];
    for (const c of words.chars) {
        assert.ok(c.note && c.note === c.note.toLowerCase(), `meaning for ${c.glyph}`);
        assert.ok(decomposeWord(c.glyph), `${c.glyph} must decompose`);
        assert.equal(c.roman, romanizeWord(c.glyph, taught), `roman of ${c.glyph}`);
        assert.equal(c.glyph, c.glyph.normalize('NFC'), `${c.glyph} must be NFC`);
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
