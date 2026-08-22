// Generates one mp3 per phrase (slugs x*) from characters.json into audio/,
// speaking `tts ?? glyph` with Google's Nepali voice, then rewrites
// audio/manifest.json to list exactly the clips present on disk.
// Idempotent and resumable: existing non-empty clips are skipped, so a rerun
// only fills gaps; clips whose slug left characters.json are deleted.
//
// Setup: python3 -m venv .venv && .venv/bin/pip install gTTS
// Usage: node tools/generate-audio.mjs
//
// Requests are paced (~1.2 s apart) and retried with backoff so transient
// rate limits do not abort the run; a truncated download is deleted rather
// than left behind, so a failed run never commits a broken clip.

import {execFile} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync,
    writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run = promisify(execFile);

const AUDIO_DIR = fileURLToPath(new URL('../audio/', import.meta.url));
const MANIFEST_PATH = new URL('../audio/manifest.json', import.meta.url);
const DATA_PATH = new URL('../characters.json', import.meta.url);

const PACE_MS = 1200;
const RETRY_DELAYS_MS = [5_000, 20_000, 60_000];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function findSynthesizer() {
    const local = fileURLToPath(new URL('../.venv/bin/gtts-cli', import.meta.url));
    if (existsSync(local))
        return local;
    return 'gtts-cli'; // PATH fallback; a missing binary fails the first call below.
}

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const phrases = data.groups.flatMap(g => g.chars)
    .filter(c => /^x[a-z0-9]+$/.test(c.slug));
if (phrases.length === 0) {
    console.error('no phrase entries (slug x*) found in characters.json');
    process.exit(1);
}

mkdirSync(AUDIO_DIR, {recursive: true});
const gtts = findSynthesizer();

async function synthesize(text, path) {
    for (let attempt = 0; ; attempt += 1) {
        try {
            await run(gtts, [text, '--lang', 'ne', '--output', path]);
            if (statSync(path).size > 0)
                return;
            throw new Error('empty output file');
        } catch (error) {
            rmSync(path, {force: true});
            if (attempt >= RETRY_DELAYS_MS.length)
                throw error;
            console.error(`  retrying in ${RETRY_DELAYS_MS[attempt] / 1000}s: ${error.message}`);
            await sleep(RETRY_DELAYS_MS[attempt]);
        }
    }
}

let generated = 0;
let skipped = 0;
const failedSlugs = [];
for (const c of phrases) {
    const path = `${AUDIO_DIR}${c.slug}.mp3`;
    if (existsSync(path) && statSync(path).size > 0) {
        skipped += 1;
        continue;
    }
    try {
        await synthesize(c.tts ?? c.glyph, path);
        generated += 1;
        console.error(`${c.slug}: ${c.glyph}`);
    } catch (error) {
        failedSlugs.push(c.slug);
        console.error(`${c.slug}: FAILED (${error.message})`);
    }
    await sleep(PACE_MS);
}

// Clips whose slug no longer exists are stale; remove them before the manifest
// is rebuilt so it can never point at deleted content.
const known = new Set(phrases.map(c => c.slug));
for (const file of readdirSync(AUDIO_DIR)) {
    const match = /^(x[a-z0-9]+)\.mp3$/.exec(file);
    if (match && !known.has(match[1])) {
        rmSync(`${AUDIO_DIR}${file}`);
        console.error(`deleted stale clip ${file}`);
    }
}

const clips = phrases.map(c => c.slug)
    .filter(slug => existsSync(`${AUDIO_DIR}${slug}.mp3`))
    .sort();
writeFileSync(MANIFEST_PATH,
    `{\n    "version": 1,\n    "clips": ${JSON.stringify(clips)}\n}\n`);

console.error(`generated ${generated}, skipped ${skipped}, missing ${failedSlugs.length}`
    + (failedSlugs.length ? ` (${failedSlugs.join(', ')})` : ''));
process.exit(failedSlugs.length ? 1 : 0);
