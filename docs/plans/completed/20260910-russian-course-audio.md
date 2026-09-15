# Russian course audio

## Overview
- Give the Russian course pronunciation clips the way the Devanagari course has them for
  phrases: a play button on letter cards, on the short-word cards after the reveal, and on new
  Russian phrase cards after the reveal.
- Clips are generated once with gTTS (Russian voice) and committed, so the app stays static and
  offline-capable.
- Adds five Russian phrase groups mirroring the Devanagari topics greetings, basics, shopping,
  directions and questions, phrase for phrase.

## Context (from discovery)
- `tools/generate-audio.mjs`: hardcoded Nepali voice, reads `characters.json`, phrase slugs `x*`,
  flat `audio/` directory, `audio/manifest.json`.
- `js/audio.js`: loads `audio/manifest.json`, resolves `audio/<slug>.mp3`, blob prefetch,
  synchronous play. `js/app.js` calls `audio.loadManifest()` in `init` and shows a play button
  wherever a clip resolves.
- `sw.js`: precaches `./audio/manifest.json`, prefetches every clip into `devanagari-audio-v1`,
  runtime-caches `/audio/*.mp3`.
- `js/courses.js`: pure-data course registry shared with tests.
- `russian.json`: five letter groups (33 letters, slugs collide with Devanagari slugs) and
  `ruwords` (35 words, `w*` slugs, recall).
- Tests: `tests/audio-data.test.mjs`, `tests/russian-data.test.mjs`, `tests/courses.test.mjs`,
  `tests/data.test.mjs`. Test names are CamelCase without underscores.

## Development Approach
- **testing approach**: regular (code first, then tests), tests in the same task
- complete each task fully before moving to the next
- every task with code changes updates or adds tests; all tests pass before the next task
- update this plan when scope changes
- minimal code comments, no new acronyms, no commits until explicitly asked

## Testing Strategy
- unit and data tests via `node --test`
- no e2e suite in this project; manual check in the browser after the version bump

## Progress Tracking
- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix

## Solution Overview
- One audio directory per course: `audio/devanagari/` (git rename of the current clips and
  manifest) and `audio/russian/`, each with its own `manifest.json`.
- The course registry carries an optional `audio: {lang, dir}` block; Hebrew has none.
- Groups flagged `"audio": true` in the data file get clips. No slug regex anywhere.
- Every Russian letter gets a `tts` with its letter name; words and phrases speak the glyph.
- The audio module takes the course directory; the service worker precaches both manifests and
  prefetches both courses' clips; the audio cache name bumps to purge the old flat layout.
- The generator takes a course id and reads voice, directory and data file from the registry.

## Technical Details
- Registry: `devanagari.audio = {lang: 'ne', dir: 'audio/devanagari/'}`,
  `russian.audio = {lang: 'ru', dir: 'audio/russian/'}`.
- Data: `"audio": true` on the 11 Devanagari phrase groups and on every Russian group.
- Russian letter names: а, бэ, вэ, гэ, дэ, е, ё, жэ, зэ, и, и краткое, ка, эль, эм, эн, о, пэ,
  эр, эс, тэ, у, эф, ха, цэ, че, ша, ща, твёрдый знак, ы, мягкий знак, э, ю, я.
- Russian phrase entry: `glyph` Russian sentence ending in `.` or `?`, `roman` Devanagari reading
  with spaces and an optional `?`, `note` English meaning copied from the Devanagari counterpart,
  `slug` `p` plus lowercase Latin transliteration. Groups carry `"quiz": "recall"` and
  `"audio": true`, placed after `ruwords`.
- Audio module: `loadManifest(dir)` stores `dir` and fetches `${dir}manifest.json`; no `dir`
  means no clips. `resolveClip(slug)` returns `${dir}${slug}.mp3`.
- Service worker: `SHELL` lists both manifests; `prefetchAudio` loops over both; `AUDIO_CACHE`
  becomes `devanagari-audio-v2`.
- Generator: `node tools/generate-audio.mjs [courseId]`, default `devanagari`; exits with a
  message when the course has no audio block; synthesizes `tts ?? glyph` for characters of
  flagged groups with `--lang course.audio.lang`; stale sweep and manifest scoped to the course
  directory.

## Implementation Steps

### Task 1: Audio block in the course registry

**Files:**
- Modify: `js/courses.js`
- Modify: `tests/courses.test.mjs`

- [x] add `audio: {lang: 'ne', dir: 'audio/devanagari/'}` to devanagari and
      `audio: {lang: 'ru', dir: 'audio/russian/'}` to russian
- [x] test: an audio block, when present, has a `lang` and a `dir` ending in `/`
- [x] test: hebrew has no audio block, audio dirs are unique
- [x] run tests

### Task 2: Per-course clip directories in the app and service worker

**Files:**
- Rename: `audio/*.mp3`, `audio/manifest.json` → `audio/devanagari/`
- Modify: `characters.json` (flag phrase groups), `js/audio.js`, `js/app.js`, `sw.js`
- Modify: `tests/data.test.mjs`

- [x] `git mv` the clips and manifest into `audio/devanagari/`
- [x] add `"audio": true` to the 11 phrase groups in `characters.json`
- [x] `audio.loadManifest(dir)` stores the directory and fetches its manifest; `resolveClip`
      builds paths from it; `init` passes `course.audio?.dir`
- [x] `sw.js`: both manifests in `SHELL`, prefetch loops over both, `AUDIO_CACHE` v2
- [x] test in `data.test.mjs`: phrase groups and only phrase groups are flagged `audio`
- [x] run tests

### Task 3: Generator per course

**Files:**
- Modify: `tools/generate-audio.mjs`
- Modify: `README.md` (command line)

- [x] take the course id from `process.argv[2]`, default `devanagari`, read `COURSES`
- [x] exit with a message for unknown courses or courses without an audio block
- [x] select characters of groups with `audio: true`; voice from `course.audio.lang`
- [x] scope clip paths, stale sweep and manifest to `course.audio.dir`; drop the `x*` regex
- [x] run it for devanagari after the rename: all skipped, manifest rewritten unchanged

### Task 4: Russian letter names and group flags

**Files:**
- Modify: `russian.json`
- Modify: `tests/russian-data.test.mjs`

- [x] add `tts` with the letter name to all 33 letters
- [x] add `"audio": true` to every Russian group
- [x] test: every letter has a non-empty Cyrillic `tts`; every group is flagged `audio`
- [x] run tests

### Task 5: Russian phrase groups

**Files:**
- Modify: `russian.json`
- Modify: `tests/russian-data.test.mjs`

- [x] author greetings (25), basics (25), shopping (30), directions (30), questions (25) after
      `ruwords`, mirroring the Devanagari groups: same ids, labels, order and English notes
- [x] Devanagari readings follow the letter cards' transliteration; slugs `p` + Latin
- [x] relax the group-order, no-space and Devanagari-only-roman tests to letter and word groups;
      add a phrase-shape test (recall, audio, `.`/`?` ending, Devanagari roman with spaces,
      unique glyphs and slugs, notes copied from the Devanagari counterpart)
- [x] run tests
- [x] review checkpoint: phrases listed for the user to check before or after generation; a
      corrected phrase only needs its clip deleted and the generator rerun
      ➕ clips were generated before the review since implementation ran unattended; the
      review is a post-completion item

### Task 6: Generate Russian clips

**Files:**
- Create: `audio/russian/*.mp3`, `audio/russian/manifest.json`
- Modify: `tests/audio-data.test.mjs`

- [x] recreate `.venv` with gTTS (`python3 -m venv .venv && .venv/bin/pip install gTTS`)
- [x] `node tools/generate-audio.mjs russian`, rerun until no clip is missing
- [x] audio-data test loops over courses with an audio block: every flagged character has a
      clip, manifest sorted, unique and flagged-only, real mp3 over 1000 bytes, no stray mp3
- [x] run tests

### Task 7: Version bump, icons, docs, acceptance

**Files:**
- Modify: `js/app.js`, `sw.js`, `icons/*`, `README.md`

- [x] bump APP_VERSION to 0.7.0 and CACHE_VERSION to match, regenerate icons
- [x] README: per-course audio directories, group `audio` flag, generator argument
- [x] verify: Devanagari phrase buttons still work, Russian letters, words and phrases show
      buttons, Hebrew shows none (serve locally and check in a browser)
- [x] run full test suite: `node --test`
- [x] move this plan to `docs/plans/completed/`

## Post-Completion
- Install the Russian course on the phone once more; the audio cache bump downloads every clip
  again, once.
- Listen through the letter-name clips; a wrong voice guess is fixed by editing `tts`, deleting
  that clip, and rerunning the generator.
- The remaining six Devanagari topics (time, transport, food, smalltalk, grammar, artschool)
  can be added to Russian as pure data later.
