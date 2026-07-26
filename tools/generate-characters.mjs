// Regenerates the derived groups of characters.json: combos (barakhari grid),
// conjuncts (from CONJUNCT_SLUGS in js/words.js) and words (the daily list
// below), plus the generated confusable pairs. The characters and digits
// groups pass through untouched. Deterministic and idempotent: rerunning on
// its own output is byte-identical.
//
// Usage: node tools/generate-characters.mjs

import {readFileSync, writeFileSync} from 'node:fs';
import {CONJUNCT_SLUGS, decomposeWord, romanizeWord} from '../js/words.js';

const DATA_PATH = new URL('../characters.json', import.meta.url);

// Barakhari columns in traditional order: the ten matras, anusvara, visarga.
const SIGNS = [
    ['ा', 'aa'], ['ि', 'i'], ['ी', 'ii'], ['ु', 'u'], ['ू', 'uu'], ['ृ', 'ri'],
    ['े', 'e'], ['ै', 'ai'], ['ो', 'o'], ['ौ', 'au'], ['ं', 'am'], ['ः', 'ah'],
];

// रि would get slug "ri", which ऋ already owns; doubled letters match the
// retroflex slug style. रृ (the only other "rri" candidate) is skipped below.
const COMBO_SLUG_OVERRIDES = new Map([['रि', 'rri']]);
const COMBO_SKIP = new Set(['रृ']);

// The taught conjuncts that live in the characters group, not in combos.
const BASE_CONJUNCT_SLUGS = new Set(['kshya', 'tra', 'gya']);

// 100 daily-life words, thematic order = teaching order. Meanings verified by
// blind back-translation (2026-07-27); spelling सहर per standard Nepali.
const WORDS = [
    // greetings and responses
    ['नमस्ते', 'hello'],
    ['धन्यवाद', 'thank you'],
    ['माफ', 'sorry, pardon'],
    ['स्वागत', 'welcome'],
    ['हजुर', 'yes (polite)'],
    ['ठीक', 'okay, fine'],
    ['राम्रो', 'good, nice'],
    ['नराम्रो', 'bad'],
    ['हुन्छ', 'okay, agreed'],
    ['होइन', 'no, it is not'],
    ['छैन', 'there is not'],
    ['अनि', 'and then'],
    // people
    ['आमा', 'mother'],
    ['बुबा', 'father'],
    ['दिदी', 'elder sister'],
    ['बहिनी', 'younger sister'],
    ['दाइ', 'elder brother'],
    ['भाइ', 'younger brother'],
    ['छोरा', 'son'],
    ['छोरी', 'daughter'],
    ['बच्चा', 'child'],
    ['परिवार', 'family'],
    ['साथी', 'friend'],
    ['पति', 'husband'],
    ['श्रीमती', 'wife'],
    // time
    ['आज', 'today'],
    ['भोलि', 'tomorrow'],
    ['हिजो', 'yesterday'],
    ['अहिले', 'now'],
    ['पछि', 'later, after'],
    ['समय', 'time'],
    ['दिन', 'day'],
    ['रात', 'night'],
    ['बिहान', 'morning'],
    ['बेलुका', 'evening'],
    ['हप्ता', 'week'],
    ['साल', 'year'],
    ['महिना', 'month'],
    // food and drink
    ['पानी', 'water'],
    ['खाना', 'food, meal'],
    ['भात', 'cooked rice'],
    ['दाल', 'lentils'],
    ['तरकारी', 'vegetables'],
    ['मासु', 'meat'],
    ['दूध', 'milk'],
    ['चिया', 'tea'],
    ['रोटी', 'flatbread'],
    ['अण्डा', 'egg'],
    ['फलफूल', 'fruit'],
    ['नुन', 'salt'],
    ['चिनी', 'sugar'],
    ['मीठो', 'tasty, sweet'],
    ['पिरो', 'spicy'],
    // body and health
    ['टाउको', 'head'],
    ['हात', 'hand'],
    ['खुट्टा', 'leg, foot'],
    ['मुख', 'mouth, face'],
    ['पेट', 'stomach, belly'],
    ['कपाल', 'hair'],
    ['औषधि', 'medicine'],
    ['अस्पताल', 'hospital'],
    // market
    ['पैसा', 'money'],
    ['बजार', 'market'],
    ['पसल', 'shop'],
    ['सस्तो', 'cheap'],
    ['दाम', 'price'],
    ['किन्नु', 'to buy'],
    ['कति', 'how much'],
    // places and travel
    ['घर', 'house, home'],
    ['कोठा', 'room'],
    ['ढोका', 'door'],
    ['बाटो', 'road, way'],
    ['सहर', 'city'],
    ['गाडी', 'car, vehicle'],
    ['बस', 'bus'],
    ['होटल', 'hotel'],
    ['भित्र', 'inside'],
    ['बाहिर', 'outside'],
    ['नजिक', 'near'],
    ['टाढा', 'far'],
    // questions
    ['किन', 'why'],
    ['कता', 'where (which way)'],
    ['कहिले', 'when'],
    ['कसरी', 'how'],
    // verbs
    ['खानु', 'to eat'],
    ['पिउनु', 'to drink'],
    ['जानु', 'to go'],
    ['आउनु', 'to come'],
    ['गर्नु', 'to do'],
    ['हेर्नु', 'to look'],
    ['सुत्नु', 'to sleep'],
    ['बस्नु', 'to sit, to stay'],
    ['भन्नु', 'to say'],
    ['दिनु', 'to give'],
    // adjectives and school
    ['ठूलो', 'big'],
    ['सानो', 'small'],
    ['तातो', 'hot'],
    ['चिसो', 'cold'],
    ['किताब', 'book'],
    ['अक्षर', 'character'],
];

// Word slugs are the roman with the taught diacritics expanded to the same
// ascii digraphs the character slugs use.
const SLUG_LETTERS = new Map([
    ['ā', 'aa'], ['ī', 'ii'], ['ū', 'uu'], ['ṁ', 'm'], ['ḥ', 'h'],
    ['ṅ', 'ng'], ['ñ', 'ny'], ['ṭ', 'tt'], ['ḍ', 'dd'], ['ṇ', 'nn'], ['ṣ', 'ss'],
]);

function slugFromRoman(roman) {
    return [...roman].map(ch => SLUG_LETTERS.get(ch) ?? ch).join('');
}

function fail(message) {
    console.error(`generate-characters: ${message}`);
    process.exit(1);
}

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const characters = data.groups.find(g => g.id === 'characters');
const digits = data.groups.find(g => g.id === 'digits');
if (!characters || !digits)
    fail('characters.json must contain the characters and digits groups');

const baseChars = characters.chars;
const byGlyph = new Map(baseChars.map(c => [c.glyph, c]));
const consonants = baseChars.filter(c => {
    const cps = [...c.glyph];
    return cps.length === 1 && cps[0] >= 'क' && cps[0] <= 'ह';
});
if (consonants.length !== 33)
    fail(`expected 33 consonants, found ${consonants.length}`);

// Combos: every consonant crossed with every sign, consonant-major.
const combos = [];
const generatedConfusables = [];
const comboSlug = (consonant, vowelSlug, glyph) =>
    COMBO_SLUG_OVERRIDES.get(glyph) ?? consonant.slug.slice(0, -1) + vowelSlug;
for (const consonant of consonants) {
    const rowSlugs = new Map();
    for (const [sign, vowelSlug] of SIGNS) {
        const glyph = consonant.glyph + sign;
        if (COMBO_SKIP.has(glyph))
            continue;
        const slug = comboSlug(consonant, vowelSlug, glyph);
        const roman = romanizeWord(glyph, baseChars);
        if (!roman)
            fail(`combo ${glyph} does not romanize`);
        combos.push({glyph, roman, slug});
        rowSlugs.set(vowelSlug, slug);
    }
    // The vowel-length and glide pairs are what actually get confused.
    for (const [a, b] of [['i', 'ii'], ['u', 'uu'], ['e', 'ai'], ['o', 'au'], ['am', 'ah']]) {
        if (rowSlugs.has(a) && rowSlugs.has(b))
            generatedConfusables.push([rowSlugs.get(a), rowSlugs.get(b)]);
    }
}

// Conjuncts: the taught clusters beyond क्ष/त्र/ज्ञ, in map (teaching) order.
const conjuncts = [];
for (const [glyph, slug] of CONJUNCT_SLUGS) {
    if (BASE_CONJUNCT_SLUGS.has(slug))
        continue;
    const cps = [...glyph];
    if (cps.length !== 3 || cps[1] !== '्')
        fail(`conjunct ${glyph} is not consonant + virama + consonant`);
    const first = byGlyph.get(cps[0]);
    const second = byGlyph.get(cps[2]);
    if (!first || !second)
        fail(`conjunct ${glyph} uses an untaught consonant`);
    conjuncts.push({
        glyph,
        roman: first.roman.slice(0, -1) + second.roman,
        slug,
        note: `${cps[0]} + ${cps[2]}`,
    });
}

// Words: romanized against everything taught, meanings in the note field.
const taughtChars = [...baseChars, ...conjuncts];
const wordChars = WORDS.map(([glyph, meaning]) => {
    if (glyph !== glyph.normalize('NFC'))
        fail(`word ${glyph} is not NFC-normalized`);
    if (!decomposeWord(glyph))
        fail(`word ${glyph} contains untaught characters`);
    const roman = romanizeWord(glyph, taughtChars);
    const slug = slugFromRoman(roman);
    if (!/^[a-z]+$/.test(slug))
        fail(`word ${glyph} slug ${slug} is not plain ascii`);
    return {glyph, roman, slug, note: meaning};
});
if (wordChars.length !== 100)
    fail(`expected 100 words, found ${wordChars.length}`);

const groups = [
    {id: 'characters', label: characters.label, chars: baseChars},
    {id: 'combos', label: 'Combinations', chars: combos},
    {id: 'conjuncts', label: 'Compounds', chars: conjuncts},
    {id: 'words', label: 'Words', quiz: 'recall', chars: wordChars},
    {id: 'digits', label: digits.label, chars: digits.chars},
];

// Idempotency: keep only the hand-written confusables (both slugs in the
// characters/digits groups), then append the generated pairs.
const baseSlugs = new Set([...baseChars, ...digits.chars].map(c => c.slug));
const confusables = [
    ...(data.confusables ?? []).filter(pair => pair.every(slug => baseSlugs.has(slug))),
    ...generatedConfusables,
];

// Validations across the final data set.
const allChars = groups.flatMap(g => g.chars);
const slugs = allChars.map(c => c.slug);
if (new Set(slugs).size !== slugs.length)
    fail(`duplicate slugs: ${slugs.filter((s, i) => slugs.indexOf(s) !== i).join(', ')}`);
const glyphs = allChars.map(c => c.glyph);
if (new Set(glyphs).size !== glyphs.length)
    fail(`duplicate glyphs: ${glyphs.filter((g, i) => glyphs.indexOf(g) !== i).join(', ')}`);
for (const group of groups) {
    const romans = group.chars.map(c => c.roman);
    if (new Set(romans).size !== romans.length)
        fail(`duplicate romans in ${group.id}`);
}
const known = new Set(slugs);
for (const pair of confusables) {
    if (pair.length !== 2 || !pair.every(slug => known.has(slug)))
        fail(`bad confusable pair: ${JSON.stringify(pair)}`);
}

// Serialization matching the hand-written style: one char object per line.
function charLine(c) {
    const fields = [`"glyph": ${JSON.stringify(c.glyph)}`, `"roman": ${JSON.stringify(c.roman)}`,
        `"slug": ${JSON.stringify(c.slug)}`];
    if (c.note !== undefined)
        fields.push(`"note": ${JSON.stringify(c.note)}`);
    if (c.tts !== undefined)
        fields.push(`"tts": ${JSON.stringify(c.tts)}`);
    return `                {${fields.join(', ')}}`;
}

function groupBlock(group) {
    const head = [`            "id": ${JSON.stringify(group.id)}`,
        `            "label": ${JSON.stringify(group.label)}`];
    if (group.quiz !== undefined)
        head.push(`            "quiz": ${JSON.stringify(group.quiz)}`);
    return `        {\n${head.join(',\n')},\n            "chars": [\n`
        + group.chars.map(charLine).join(',\n')
        + '\n            ]\n        }';
}

const confusableLines = [];
for (let i = 0; i < confusables.length; i += 6) {
    confusableLines.push('        ' + confusables.slice(i, i + 6)
        .map(pair => JSON.stringify(pair).replaceAll('","', '", "')).join(', '));
}

const out = '{\n    "version": 3,\n    "groups": [\n'
    + groups.map(groupBlock).join(',\n')
    + '\n    ],\n    "confusables": [\n'
    + confusableLines.join(',\n')
    + '\n    ]\n}\n';

writeFileSync(DATA_PATH, out);
console.error(`groups: ${groups.map(g => `${g.id}=${g.chars.length}`).join(' ')}, `
    + `confusables: ${confusables.length}`);
