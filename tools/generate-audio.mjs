// Generates one mp3 per audible character of a course into its audio
// directory, speaking `tts ?? glyph` with Google's voice for the course
// language, then rewrites the directory's manifest.json to list exactly the
// clips present on disk. Audible characters are those in groups flagged
// "audio": true in the course data file.
// Idempotent and resumable: existing non-empty clips are skipped, so a rerun
// only fills gaps; clips whose slug left the data file are deleted.
//
// Setup: python3 -m venv .venv && .venv/bin/pip install gTTS
// Usage: node tools/generate-audio.mjs [courseId]   (default: devanagari)
//
// Requests are paced (~1.2 s apart) and retried with backoff so transient
// rate limits do not abort the run; a truncated download is deleted rather
// than left behind, so a failed run never commits a broken clip.

import {execFile} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync,
    writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {COURSES} from '../js/courses.js';

const run = promisify(execFile);

const courseId = process.argv[2] ?? 'devanagari';
const course = COURSES[courseId];
if (!course) {
    console.error(`unknown course ${courseId}; known: ${Object.keys(COURSES).join(', ')}`);
    process.exit(1);
}
if (!course.audio) {
    console.error(`course ${courseId} has no audio block in js/courses.js`);
    process.exit(1);
}

const ROOT = new URL('../', import.meta.url);
const AUDIO_DIR = fileURLToPath(new URL(course.audio.dir, ROOT));
const MANIFEST_PATH = `${AUDIO_DIR}manifest.json`;
const DATA_PATH = new URL(course.dataFile, ROOT);

const PACE_MS = 1200;
const RETRY_DELAYS_MS = [5_000, 20_000, 60_000];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function findSynthesizer() {
    const local = fileURLToPath(new URL('.venv/bin/gtts-cli', ROOT));
    if (existsSync(local))
        return local;
    return 'gtts-cli'; // PATH fallback; a missing binary fails the first call below.
}

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
const phrases = data.groups.filter(g => g.audio).flatMap(g => g.chars);
if (phrases.length === 0) {
    console.error(`no groups flagged "audio": true in ${course.dataFile}`);
    process.exit(1);
}

mkdirSync(AUDIO_DIR, {recursive: true});
const gtts = findSynthesizer();

async function synthesize(text, path) {
    for (let attempt = 0; ; attempt += 1) {
        try {
            await run(gtts, [text, '--lang', course.audio.lang, '--output', path]);
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
    const match = /^([a-z0-9]+)\.mp3$/.exec(file);
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
