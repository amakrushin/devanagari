import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {LEARNED_BOX} from '../js/scheduler.js';
import * as words from '../js/words.js';

const data = JSON.parse(await readFile(new URL('../characters.json', import.meta.url), 'utf8'));

const DICT = [
    {d: 'जल', r: 'jal', e: 'water'},
    {d: 'घर', r: 'ghar', e: 'house'},
    {d: 'मन', r: 'man', e: 'mind'},
];

function learnedProgress(slugs, shownWords) {
    const progress = {chars: {}};
    for (const slug of slugs)
        progress.chars[slug] = {box: LEARNED_BOX, due: 0, hotLeft: 0};
    if (shownWords)
        progress.words = shownWords;
    return progress;
}

test('DecomposesMatraWordToVowelSlugs', () => {
    assert.deepEqual(words.decomposeWord('पानी'), ['pa', 'aa', 'na', 'ii']);
});

test('DecomposesBareConsonantsAndIndependentVowels', () => {
    assert.deepEqual(words.decomposeWord('घर'), ['gha', 'ra']);
    assert.deepEqual(words.decomposeWord('आमा'), ['aa', 'ma', 'aa']);
    assert.deepEqual(words.decomposeWord('अनि'), ['a', 'na', 'i']);
});

test('MapsEveryMatraToItsVowelSlug', () => {
    const matras = [
        ['ा', 'aa'], ['ि', 'i'], ['ी', 'ii'], ['ु', 'u'], ['ू', 'uu'],
        ['ृ', 'ri'], ['े', 'e'], ['ै', 'ai'], ['ो', 'o'], ['ौ', 'au'],
    ];
    for (const [matra, slug] of matras)
        assert.deepEqual(words.decomposeWord(`क${matra}`), ['ka', slug], `matra ${slug}`);
});

test('DecomposesTaughtConjuncts', () => {
    assert.deepEqual(words.decomposeWord('क्षेत्र'), ['kshya', 'e', 'tra']);
    assert.deepEqual(words.decomposeWord('ज्ञान'), ['gya', 'aa', 'na']);
    assert.deepEqual(words.decomposeWord('त्रिशूल'), ['tra', 'i', 'sha', 'uu', 'la']);
});

test('MapsAnusvaraAndVisarga', () => {
    assert.deepEqual(words.decomposeWord('संग'), ['sa', 'am', 'ga']);
    assert.deepEqual(words.decomposeWord('दुःख'), ['da', 'u', 'ah', 'kha']);
});

test('ReadsCommonNepaliConjunctWords', () => {
    assert.deepEqual(words.decomposeWord('राम्रो'), ['ra', 'aa', 'mra', 'o']);
    assert.deepEqual(words.decomposeWord('मान्छे'), ['ma', 'aa', 'nchha', 'e']);
    assert.deepEqual(words.decomposeWord('कर्म'), ['ka', 'rma']);
    assert.deepEqual(words.decomposeWord('गर्नु'), ['ga', 'rna', 'u']);
    assert.deepEqual(words.decomposeWord('नमस्ते'), ['na', 'ma', 'sta', 'e']);
});

test('RejectsUntaughtConjuncts', () => {
    assert.equal(words.decomposeWord('उद्भव'), null, 'द्भ is not taught');
    assert.equal(words.decomposeWord('स्त्री'), null, 'triple clusters are not taught');
});

test('RejectsFinalHalanta', () => {
    assert.equal(words.decomposeWord('छन्'), null);
});

test('RejectsChandrabindu', () => {
    assert.equal(words.decomposeWord('पाँच'), null);
});

test('RejectsNuktaInBothForms', () => {
    assert.equal(words.decomposeWord('क़'), null, 'precomposed qa must fail via NFC');
    assert.equal(words.decomposeWord('क़'), null, 'combining nukta must fail');
});

test('RejectsDigitsLatinSpacesEmpty', () => {
    assert.equal(words.decomposeWord('१२'), null);
    assert.equal(words.decomposeWord('ka'), null);
    assert.equal(words.decomposeWord('जल घर'), null);
    assert.equal(words.decomposeWord(''), null);
});

test('EveryTaughtCharacterGlyphDecomposesToItsSlug', () => {
    const groups = data.groups.filter(g => g.id === 'characters' || g.id === 'conjuncts');
    for (const c of groups.flatMap(g => g.chars)) {
        const slugs = words.decomposeWord(c.glyph);
        assert.ok(slugs, `glyph ${c.glyph} must decompose`);
        assert.ok(slugs.includes(c.slug), `glyph ${c.glyph} must require ${c.slug}`);
    }
});

test('EveryComboGlyphDecomposesToBaseSlugsOnly', () => {
    const combos = data.groups.find(g => g.id === 'combos');
    assert.ok(combos, 'combos group must exist');
    for (const c of combos.chars) {
        const slugs = words.decomposeWord(c.glyph);
        assert.ok(slugs, `combo ${c.glyph} must decompose`);
        assert.equal(slugs.length, 2, `combo ${c.glyph} is consonant + sign`);
        // Combos never gate word eligibility; the vowel does.
        assert.ok(!slugs.includes(c.slug), `combo ${c.glyph} must not require itself`);
    }
});

test('ConjunctMapMatchesConjunctsGroup', () => {
    const conjuncts = data.groups.find(g => g.id === 'conjuncts');
    assert.ok(conjuncts, 'conjuncts group must exist');
    const taught = new Set(['क्ष', 'त्र', 'ज्ञ', ...conjuncts.chars.map(c => c.glyph)]);
    assert.deepEqual(new Set(words.CONJUNCT_SLUGS.keys()), taught);
    for (const c of conjuncts.chars)
        assert.equal(words.CONJUNCT_SLUGS.get(c.glyph), c.slug, `slug mismatch for ${c.glyph}`);
});

test('RomanizesWordsTheWayCharactersAreTaught', () => {
    const chars = data.groups.flatMap(g => g.chars);
    assert.equal(words.romanizeWord('पानी', chars), 'pānī');
    assert.equal(words.romanizeWord('घर', chars), 'ghara');
    assert.equal(words.romanizeWord('आमा', chars), 'āmā');
    assert.equal(words.romanizeWord('क्षेत्र', chars), 'chhyetra');
    assert.equal(words.romanizeWord('ज्ञान', chars), 'gyāna');
    assert.equal(words.romanizeWord('संग', chars), 'saṁga');
    assert.equal(words.romanizeWord('दुःख', chars), 'duḥkha');
    assert.equal(words.romanizeWord('ऋषि', chars), 'riṣi');
    assert.equal(words.romanizeWord('गृह', chars), 'griha');
    assert.equal(words.romanizeWord('कर्म', chars), 'karma');
    assert.equal(words.romanizeWord('राम्रो', chars), 'rāmro');
    assert.equal(words.romanizeWord('खुट्टा', chars), 'khuṭṭā');
    assert.equal(words.romanizeWord('विद्यालय', chars), 'widyālaya');
});

test('RomanizeRejectsWhatDecomposeRejects', () => {
    assert.equal(words.romanizeWord('उद्भव', data.groups[0].chars), null);
    assert.equal(words.romanizeWord('', data.groups[0].chars), null);
});

test('EveryMappedSlugExistsInCharacterData', () => {
    const known = new Set(data.groups.flatMap(g => g.chars).map(c => c.slug));
    for (const slug of [...words.CODEPOINT_SLUGS.values(), ...words.CONJUNCT_SLUGS.values()])
        assert.ok(known.has(slug), `unknown slug in map: ${slug}`);
});

test('PicksNothingWhenNothingLearned', () => {
    assert.deepEqual(words.pickWords(DICT, learnedProgress([])), []);
});

test('PicksNothingFromEmptyDictionary', () => {
    assert.deepEqual(words.pickWords([], learnedProgress(['ja', 'la'])), []);
});

test('RequiresEveryCharacterLearned', () => {
    const progress = learnedProgress(['ja']);
    progress.chars.la = {box: LEARNED_BOX - 1, due: 0, hotLeft: 0};
    assert.deepEqual(words.pickWords(DICT, progress), []);
});

test('IncludesWordAtLearnedBoxBoundary', () => {
    assert.deepEqual(words.pickWords(DICT, learnedProgress(['ja', 'la'])), [DICT[0]]);
});

test('KeepsFrequencyOrderForUnseenWords', () => {
    const progress = learnedProgress(['ja', 'la', 'gha', 'ra', 'ma', 'na']);
    assert.deepEqual(words.pickWords(DICT, progress, 3), DICT);
});

test('SkipsAlreadyShownWords', () => {
    const progress = learnedProgress(['ja', 'la', 'gha', 'ra', 'ma', 'na'], {'जल': 100});
    assert.deepEqual(words.pickWords(DICT, progress), [DICT[1], DICT[2]]);
});

test('UnseenOutranksSeen', () => {
    const progress = learnedProgress(['ja', 'la', 'gha', 'ra'], {'जल': 100});
    assert.deepEqual(words.pickWords(DICT, progress), [DICT[1], DICT[0]]);
});

test('RecyclesOldestShownWhenAllSeen', () => {
    const shown = {'जल': 300, 'घर': 100, 'मन': 200};
    const progress = learnedProgress(['ja', 'la', 'gha', 'ra', 'ma', 'na'], shown);
    assert.deepEqual(words.pickWords(DICT, progress), [DICT[1], DICT[2]]);
});

test('CapsAtCount', () => {
    const progress = learnedProgress(['ja', 'la', 'gha', 'ra', 'ma', 'na']);
    assert.equal(words.pickWords(DICT, progress).length, 2);
    assert.equal(words.pickWords(DICT, progress, 1).length, 1);
});

test('ToleratesProgressWithoutWordsField', () => {
    const progress = learnedProgress(['ja', 'la']);
    delete progress.words;
    assert.deepEqual(words.pickWords(DICT, progress), [DICT[0]]);
});

test('PickerIsDeterministic', () => {
    const progress = learnedProgress(['ja', 'la', 'gha', 'ra', 'ma', 'na'], {'घर': 50});
    assert.deepEqual(words.pickWords(DICT, progress), words.pickWords(DICT, progress));
});

test('SpreadsTwoWordCardsAtThirds', () => {
    const queue = Array.from({length: 15}, (_, i) => ({slug: `s${i}`, isNew: false}));
    const result = words.insertWordCards(queue, [DICT[0], DICT[1]]);
    assert.equal(result.length, 17);
    assert.equal(result[5].word, DICT[0]);
    assert.equal(result[11].word, DICT[1]);
    assert.deepEqual(result.filter(item => !item.word), queue);
});

test('SingleWordCardLandsMidQueue', () => {
    const queue = Array.from({length: 15}, (_, i) => ({slug: `s${i}`, isNew: false}));
    const result = words.insertWordCards(queue, [DICT[0]]);
    assert.equal(result.length, 16);
    assert.equal(result[8].word, DICT[0]);
});

test('NeverInsertsBeforeTheFirstQuizItem', () => {
    const result = words.insertWordCards([{slug: 'a', isNew: true}], [DICT[0], DICT[1]]);
    assert.deepEqual(result[0], {slug: 'a', isNew: true});
    assert.equal(result.length, 3);
});

test('EmptyQueueStaysEmpty', () => {
    assert.deepEqual(words.insertWordCards([], [DICT[0]]), []);
});

test('NoWordsReturnsUnchangedCopy', () => {
    const queue = [{slug: 'a', isNew: false}];
    const result = words.insertWordCards(queue, []);
    assert.deepEqual(result, queue);
    assert.notEqual(result, queue);
});
