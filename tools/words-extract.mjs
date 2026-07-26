// Extracts ranked word candidates for words.json from Devanagari corpus files.
//
// Usage: node tools/words-extract.mjs tools/corpus/*.json > candidates.tsv
//
// JSON inputs contribute only their text fields ("text", "shloka_text") so
// gloss/commentary fields don't skew frequencies; any other file is scanned
// whole. Only words readable with taught characters (decomposeWord) survive.
// Output: count<TAB>word<TAB>roman, most frequent first; stats go to stderr.

import {readFileSync} from 'node:fs';
import {decomposeWord, romanizeWord} from '../js/words.js';

const chars = JSON.parse(readFileSync(new URL('../characters.json', import.meta.url), 'utf8'))
    .groups[0].chars;

const TEXT_FIELDS = new Set(['text', 'shloka_text']);

function* textsOf(value) {
    if (typeof value === 'string')
        return;
    if (Array.isArray(value)) {
        for (const item of value)
            yield* textsOf(item);
        return;
    }
    if (!value || typeof value !== 'object')
        return;
    for (const [key, item] of Object.entries(value)) {
        if (TEXT_FIELDS.has(key) && typeof item === 'string')
            yield item;
        else
            yield* textsOf(item);
    }
}

// Vedic accents, dandas, Devanagari digits, and zero-width joiners separate
// or decorate words; treat them as whitespace before tokenizing.
const SEPARATORS = /[॑-॔।॥०-९‌‍]/gu;

const counts = new Map();
let total = 0;
for (const path of process.argv.slice(2)) {
    const raw = readFileSync(path, 'utf8');
    const texts = path.endsWith('.json') ? [...textsOf(JSON.parse(raw))] : [raw];
    for (const text of texts) {
        const cleaned = text.normalize('NFC').replace(SEPARATORS, ' ');
        for (const token of cleaned.match(/[ऀ-ॿ]+/gu) ?? []) {
            total += 1;
            counts.set(token, (counts.get(token) ?? 0) + 1);
        }
    }
}

const decomposable = [...counts.entries()]
    .filter(([word]) => decomposeWord(word))
    .sort((a, b) => b[1] - a[1]);

console.error(`tokens: ${total}, unique: ${counts.size}, decomposable unique: ${decomposable.length}`);
for (const [word, count] of decomposable)
    console.log(`${count}\t${word}\t${romanizeWord(word, chars)}`);
