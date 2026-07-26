// Pure word-card logic: no DOM, no clock. Decomposes Devanagari words into
// taught character slugs and picks which words a session shows.

import {LEARNED_BOX} from './scheduler.js';

// Codepoints readable on their own once the mapped character is learned.
// Matras map to their independent vowel: knowing the vowel makes the word
// eligible, and the card reveal teaches the matra shape.
export const CODEPOINT_SLUGS = new Map([
    ['अ', 'a'], ['आ', 'aa'], ['इ', 'i'], ['ई', 'ii'], ['उ', 'u'], ['ऊ', 'uu'],
    ['ऋ', 'ri'], ['ए', 'e'], ['ऐ', 'ai'], ['ओ', 'o'], ['औ', 'au'],
    ['क', 'ka'], ['ख', 'kha'], ['ग', 'ga'], ['घ', 'gha'], ['ङ', 'nga'],
    ['च', 'cha'], ['छ', 'chha'], ['ज', 'ja'], ['झ', 'jha'], ['ञ', 'nya'],
    ['ट', 'tta'], ['ठ', 'ttha'], ['ड', 'dda'], ['ढ', 'ddha'], ['ण', 'nna'],
    ['त', 'ta'], ['थ', 'tha'], ['द', 'da'], ['ध', 'dha'], ['न', 'na'],
    ['प', 'pa'], ['फ', 'pha'], ['ब', 'ba'], ['भ', 'bha'], ['म', 'ma'],
    ['य', 'ya'], ['र', 'ra'], ['ल', 'la'], ['व', 'wa'],
    ['श', 'sha'], ['ष', 'ssa'], ['स', 'sa'], ['ह', 'ha'],
    ['ा', 'aa'], ['ि', 'i'], ['ी', 'ii'], ['ु', 'u'], ['ू', 'uu'],
    ['ृ', 'ri'], ['े', 'e'], ['ै', 'ai'], ['ो', 'o'], ['ौ', 'au'],
    ['ं', 'am'], ['ः', 'ah'],
]);

// The only conjuncts taught as characters of their own, matched before single
// codepoints. Any other virama sequence makes a word unreadable for now.
export const CONJUNCT_SLUGS = new Map([
    ['क्ष', 'kshya'],
    ['त्र', 'tra'],
    ['ज्ञ', 'gya'],
]);

// Longest conjunct sequence in codepoints (consonant + virama + consonant).
const CONJUNCT_LENGTH = 3;

// Returns the in-order slugs a reader needs for the word, duplicates included
// ('पानी' -> ['pa', 'aa', 'na', 'ii']), or null when anything in the word is
// not taught yet (other conjuncts, chandrabindu, nukta, digits, Latin, ...).
export function decomposeWord(word) {
    if (!word)
        return null;
    const cps = [...word.normalize('NFC')];
    const slugs = [];
    for (let i = 0; i < cps.length;) {
        const conjunct = CONJUNCT_SLUGS.get(cps.slice(i, i + CONJUNCT_LENGTH).join(''));
        if (conjunct) {
            slugs.push(conjunct);
            i += CONJUNCT_LENGTH;
            continue;
        }
        const slug = CODEPOINT_SLUGS.get(cps[i]);
        if (!slug)
            return null;
        slugs.push(slug);
        i += 1;
    }
    return slugs;
}

// Renders a word the way its characters are taught: consonants keep their
// inherent a, a matra replaces it with the vowel's roman, and the signs append
// theirs ('क्षेत्र' -> 'chhyetra' because the app teaches क्ष as chhya).
// `chars` is the characters.json char list; returns null for unreadable words.
export function romanizeWord(word, chars) {
    const slugs = decomposeWord(word);
    if (!slugs)
        return null;
    const romanBySlug = new Map(chars.map(c => [c.slug, c.roman]));
    const cps = [...word.normalize('NFC')];
    let out = '';
    for (let i = 0, s = 0; i < cps.length; s += 1) {
        const cp = cps[i];
        const roman = romanBySlug.get(slugs[s]);
        if (CONJUNCT_SLUGS.has(cps.slice(i, i + CONJUNCT_LENGTH).join(''))) {
            out += roman;
            i += CONJUNCT_LENGTH;
            continue;
        }
        if (cp === 'ं' || cp === 'ः')
            out += roman.slice(1);          // aṁ/aḥ carry the sign after the a
        else if (i > 0 && CODEPOINT_SLUGS.get(cp) === slugs[s] && isMatra(cp))
            out = out.slice(0, -1) + roman; // matra replaces the inherent a
        else
            out += roman;
        i += 1;
    }
    return out;
}

const MATRAS = new Set(['ा', 'ि', 'ी', 'ु', 'ू', 'ृ', 'े', 'ै', 'ो', 'ौ']);

function isMatra(cp) {
    return MATRAS.has(cp);
}

// Picks up to `count` words whose every character is learned. Unseen words go
// first in dictionary (frequency) order; when the eligible pool is exhausted,
// the oldest-shown words recycle so early learners keep getting practice.
// Deterministic: no randomness.
export function pickWords(words, progress, count = 2) {
    const learned = new Set(Object.entries(progress.chars ?? {})
        .filter(([, st]) => st.box >= LEARNED_BOX)
        .map(([slug]) => slug));
    const shown = progress.words ?? {};
    const unseen = [];
    const seen = [];
    for (const word of words) {
        const slugs = decomposeWord(word.d);
        if (!slugs || !slugs.every(slug => learned.has(slug)))
            continue;
        if (shown[word.d] === undefined) {
            unseen.push(word);
            if (unseen.length >= count)
                break;
        } else {
            seen.push(word);
        }
    }
    seen.sort((a, b) => shown[a.d] - shown[b.d]);
    return [...unseen, ...seen].slice(0, count);
}

// Returns a new queue with word cards spread through it: word j of k lands at
// original index ceil((j+1) * n / (k+1)) — thirds for two words, the middle
// for one — never before the first quiz item.
export function insertWordCards(queue, words) {
    const result = [...queue];
    if (!queue.length || !words.length)
        return result;
    for (let j = words.length - 1; j >= 0; j -= 1) {
        const at = Math.ceil((j + 1) * queue.length / (words.length + 1));
        result.splice(at, 0, {word: words[j]});
    }
    return result;
}
