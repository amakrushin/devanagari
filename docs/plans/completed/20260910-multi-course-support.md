# Multi-course support: Russian and Hebrew alphabet courses

## Overview
- Turn the single-course Devanagari trainer into a three-course app sharing one codebase:
  - **devanagari** → Latin readings (existing course, unchanged for its users)
  - **russian** → Devanagari readings (Cyrillic taught to Nepali speakers)
  - **hebrew** → Latin readings (Hebrew script, same answer style as the Devanagari course)
- Each course is its own installable PWA entry ("select, then install"): a person opens the site,
  taps a course, and Add to Home Screen installs that course with its own name and icon.
- Progress, scheduler, quiz, stats, and words machinery are reused as-is; a course is data plus a
  small registry entry.

## Context (from discovery)
- Engine is already data-driven: `characters.json` groups of `{glyph, roman, slug, note?, tts?}`,
  optional `words.json`; `js/scheduler.js` and `js/stats.js` are fully language-agnostic.
- Hardwired course bits live in `js/app.js` (progress key, title handling, export naming),
  `index.html` (title/tagline/manifest), `manifest.webmanifest`, `sw.js` precache list.
- `js/words.js` hardcodes a Devanagari `CODEPOINT_SLUGS` map used for word-card eligibility.
- `glyphClass()`/`isPhrase()` in `js/app.js` treat any glyph containing a plain space as a phrase —
  conflicts with the planned two-case Russian glyphs (see Technical Details).
- Tests: `node --test`; `tests/data.test.mjs` and `tests/words-data.test.mjs` validate the
  Devanagari data files and are intentionally course-specific in places (frozen slugs, group order).
- v0.4.0 added the recall direction toggle: `settings.recallMode` (`read`/`say`) in
  `js/scheduler.js`, `renderRecallMode()`/`toggleRecallMode()`/`saysFirst()` in `js/app.js`, the
  `#btn-recall-mode` row in `index.html`. The label text hardcodes `Nepali`.
- Glyph elements are created in four places in `js/app.js` (`showMeet`, `showRecall` question and
  reveal, `showQuestion`) plus the `showWord` daily-word card; RTL has to cover all of them.

## Development Approach
- **testing approach**: Regular (code first, then tests)
- complete each task fully before moving to the next
- make small, focused changes; almost no code comments (project rule)
- **CRITICAL: every task MUST include new/updated tests** for code changes in that task
  - tests cover both success and error scenarios
- **CRITICAL: all tests must pass before starting next task** — run `node --test`
- **CRITICAL: update this plan file when scope changes during implementation**
- maintain backward compatibility: existing installs, `devanagari.progress` key, and old export
  files must keep working unchanged

## Testing Strategy
- **unit tests**: `node --test` suite; new per-course data test files mirror the generic checks of
  `tests/data.test.mjs` (unique ascii slugs, glyph/roman/slug present, NFC, confusables reference
  real slugs) without the Devanagari-specific frozen-content tests
- **e2e tests**: none in this project; manual smoke checks listed in Post-Completion

## Progress Tracking
- mark completed items with `[x]` immediately when done
- add newly discovered tasks with ➕ prefix
- document issues/blockers with ⚠️ prefix

## Solution Overview
- `js/courses.js` (pure module, no DOM, importable by `node --test`) exports `COURSES` keyed by
  course id: `{dataFile, wordsFile, title, tagline, progressKey, language, rtl?}`,
  `resolveCourse(id)` (unknown or missing id → `devanagari`), and `recallModeLabel(mode, course)`:
  `` `English → ${language}` `` for `say`, `` `${language} → English` `` for `read`.
  `language` is `Nepali`, `Russian`, or `Hebrew`; the Devanagari label output stays byte-identical
  to today's text. `js/app.js` imports from `js/courses.js`; `renderRecallMode()` uses
  `recallModeLabel`.
- The recall direction is stored inside each course's progress (`settings.recallMode`), so it is
  independent per course with no extra work; import/export carry it along as today.
- `index.html` stays the Devanagari app byte-for-byte in behavior. New sibling pages
  `russian.html` and `hebrew.html` reuse `style.css` and `js/` modules; each sets
  `window.COURSE = '<id>'` inline and links its own manifest with its own `name`, `id`,
  `start_url`, and icons. `app.js` reads `window.COURSE`, defaulting to `devanagari`.
- Each home screen footer cross-links the other course pages.
- One shared service worker (`sw.js`, root scope) precaches all three pages, manifests, icons, and
  data files; the network-first rule generalizes to any same-origin `*.json`.
- Progress is fully independent per course via `progressKey`. Export files gain a `course` field;
  import rejects a file whose course does not match (a file without the field counts as
  `devanagari` — all old backups are Devanagari).

## Technical Details
- **Two-case Russian glyphs**: one scheduler item per letter, glyph shows both cases separated by
  a no-break space (U+00A0): `"А а"`. A plain space would trip `isPhrase()` (phrase font, phrase
  preview, "new phrase" tag); U+00A0 keeps the pair on one line and out of the phrase path.
- **Russian groups** (`russian.json`, `characters.json` schema, `version: 1`):
  1. `vowels`: а о у э ы и е ё ю я
  2. `consonants1/2/3` (6 / 6 / 5), early letters chosen so real words form fast
     (м н т к д п, then р с л в б г, then з х ф ч ш)
  3. `signs`: ь ъ й ж ц щ with explanatory notes (e.g. ь softens the previous consonant)
  4. `ruwords`: `quiz: "recall"` group of short frequent words (дом, мама, вода, хлеб…)
  - `roman` holds the Devanagari reading (а→अ, б→ब, ш→श); letters without a clean match get an
    approximation plus a note (ы, ж, ц, ь, ъ, щ)
  - `confusables`: и/й, ш/щ, ь/ъ, е/ё
- **Hebrew groups** (`hebrew.json`): letters in traditional order split into 3–4 groups; the five
  final forms (ך ם ן ף ץ) as their own group right after the base letters, each noting its base
  letter; no niqqud; then a `quiz: "recall"` words group (שלום, בית, מים…) with Latin readings.
  `confusables`: ב/כ, ד/ר, ה/ח/ת, ו/ן, ם/ס.
- **RTL**: one helper `glyphEl(glyph)` in `js/app.js` replaces every `el('p', glyphClass(glyph),
  glyph)` call (`showMeet`, `showRecall` question and reveal, `showQuestion`, `showWord`) and sets
  `dir="rtl"` when the active course has `rtl: true`; the group preview line in `renderHome` gets
  the same attribute. Matching small CSS additions.
- **Word eligibility**: `js/words.js` gets `buildCodepointMap(groups)` — for each char, every
  non-whitespace codepoint of `glyph` maps to its slug (handles both Russian cases and Hebrew
  single letters). `decomposeWord`/`romanizeWord`/`pickWords` accept the map as a parameter
  defaulting to the existing Devanagari `CODEPOINT_SLUGS`, so current callers and tests stay valid.
- **Word files**: `russian-words.json` / `hebrew-words.json` mirror `words.json`
  (`{d, r, e}`: word, reading, English meaning).
- **Manifests**: `manifest-russian.webmanifest`, `manifest-hebrew.webmanifest` with distinct
  `name`, `short_name`, `id`, `start_url` (`./russian.html` / `./hebrew.html`), shared scope `./`,
  per-course icons.
- **Out of scope (deliberately deferred, must not be blocked by v1)**: cursive/handwriting display
  forms (later: bundled font + CSS class, presentation-only), localized UI, Russian phrase groups,
  Hebrew niqqud. Daily word cards from `*-words.json` (`showWord`) keep ignoring the recall
  direction toggle in all courses, as they do today in the Devanagari course.

## What Goes Where
- **Implementation Steps**: registry and plumbing, entry pages and service worker, Russian
  content, Hebrew content + RTL, acceptance, docs.
- **Post-Completion**: manual PWA install checks on a phone, native-speaker review of Hebrew
  romanization.

## Implementation Steps

### Task 1: Course registry module and per-course plumbing in the engine

**Files:**
- Create: `js/courses.js`
- Create: `tests/courses.test.mjs`
- Modify: `js/app.js`
- Modify: `js/words.js`
- Create: `tests/words-map.test.mjs`

- [x] create `js/courses.js` with `COURSES`, `resolveCourse`, `recallModeLabel`; `js/app.js`
      resolves the active course from `window.COURSE` and takes data/words file names, title,
      tagline, progress key, language from it
- [x] set document title, home header brand/tagline, and share title from the course entry
- [x] `renderRecallMode()` uses `recallModeLabel(state.progress.settings.recallMode, course)`
- [x] write `tests/courses.test.mjs`: all three ids resolve; unknown/undefined id falls back to
      `devanagari`; `progressKey` and `dataFile` unique across courses; `recallModeLabel` returns
      exactly `English → Nepali` / `Nepali → English` for devanagari and the Russian/Hebrew
      variants for the other two
- [x] use per-course progress key; export filename becomes `<course>-progress-<date>.txt` and the
      exported JSON gains a `course` field; import rejects a mismatched course (missing field
      counts as `devanagari`) with a `flashButton` message
- [x] add `buildCodepointMap(groups)` to `js/words.js`; parameterize `decomposeWord`,
      `romanizeWord`, `pickWords` with a map defaulting to `CODEPOINT_SLUGS`; thread the active
      course map through `js/app.js`
- [x] write tests in `tests/words-map.test.mjs`: `buildCodepointMap` on a two-case glyph with
      U+00A0, on Hebrew letters, whitespace skipped; `decomposeWord` with a custom map (success +
      untaught-codepoint failure); default-map behavior unchanged
- [x] run `node --test` — all tests must pass before task 2
- ➕ `glyphEl`/RTL routing (Task 4) landed here as well, since the same call sites changed
- ➕ fresh profiles now select the course's first group (`initProgress` hardcodes `characters`);
  `freshProgress()` in `js/app.js` covers first load and Reset progress
- ➕ `APP_VERSION` bumped to 0.5.0 (new shell files need a new icon color and cache)

### Task 2: Entry pages, manifests, icons, service worker

**Files:**
- Create: `russian.html`
- Create: `hebrew.html`
- Create: `manifest-russian.webmanifest`
- Create: `manifest-hebrew.webmanifest`
- Create: `icons/icon-russian-192.png`, `icons/icon-russian-512.png`,
  `icons/icon-hebrew-192.png`, `icons/icon-hebrew-512.png` (+ apple-touch variants)
- Create: `tools/generate-icons.mjs` (or reuse the existing icon approach)
- Modify: `index.html`
- Modify: `sw.js`
- Modify: `tests/data.test.mjs` (only if shared helpers move)

- [x] create `russian.html`/`hebrew.html` from `index.html`: own `<title>`, meta app title,
      manifest link, `window.COURSE` line; everything else shared
- [x] create both manifests with distinct `name`, `short_name`, `id`, `start_url`, icons
- [x] generate per-course icons (single letter on the app background color, e.g. Б and א)
- [x] add course cross-links to the home footer (registry-driven, current course omitted)
- [x] `sw.js`: add new pages, manifests, icons, and data files to the precache; replace the two
      hardcoded JSON paths with a same-origin `*.json` network-first rule; bump `CACHE_VERSION`
- [x] verify `node --test` still passes and the three pages load via `python -m http.server`
      (each shows its own title; devanagari behavior unchanged)
- ➕ `tools/generate-icons.mjs` now also renders the Russian and Hebrew icons (letter on a
  hue-shifted background) so one run regenerates all nine files

### Task 3: Russian course content

**Files:**
- Create: `russian.json`
- Create: `russian-words.json`
- Create: `tests/russian-data.test.mjs`

- [x] author `russian.json`: vowels, consonants1/2/3, signs, recall words group; two-case glyphs
      with U+00A0; Devanagari readings; notes for ы ж ц ь ъ щ ё; confusables и/й ш/щ ь/ъ е/ё
- [x] author `russian-words.json` (~30 short frequent words, `{d, r, e}`)
- [x] write `tests/russian-data.test.mjs`: group ids and order; 33 letters covered exactly once;
      glyphs are `Upper U+00A0 lower` (signs single-case where applicable: ь ъ ы have no word-initial
      uppercase use — decide and pin shape in the test); unique ascii slugs; unique glyphs and
      romans per group; NFC; confusables reference real slugs; every recall word and every
      `russian-words.json` entry decomposes via `buildCodepointMap(russian groups)`
- [x] run `node --test` — all tests must pass before task 4

### Task 4: Hebrew course content and RTL rendering

**Files:**
- Create: `hebrew.json`
- Create: `hebrew-words.json`
- Create: `tests/hebrew-data.test.mjs`
- Modify: `js/app.js`
- Modify: `style.css`

- [x] author `hebrew.json`: 22 letters in traditional order in 3–4 groups; final-forms group with
      base-letter notes; recall words group with Latin readings; confusables ב/כ ד/ר ה/ח/ת ו/ן ם/ס
- [x] author `hebrew-words.json` (~30 words)
- [x] add `glyphEl(glyph)` to `js/app.js`, route all five glyph call sites through it, set
      `dir="rtl"` from the course flag; set the same attribute on the group preview in `renderHome`;
      CSS adjustments
- [x] manual check: Hebrew recall card in `say` mode reveals the glyph right-to-left
      (headless Chromium over the DevTools protocol, 2026-09-10)
- [x] write `tests/hebrew-data.test.mjs`: same generic checks as Task 3; final forms each carry a
      note naming their base letter; words decompose via the Hebrew map
- [x] run `node --test` — all tests must pass before task 5

### Task 5: Verify acceptance criteria
- [x] all three courses load, run a session, and keep separate progress (manual pass via local
      server, plus fresh-profile check in a private window)
- [x] export from one course refuses to import into another; a pre-change Devanagari backup still
      imports
- [x] devanagari course behavior is unchanged (same data files, same progress key, same UI)
- [x] the `Recall cards` toggle reads `Russian → English` / `English → Russian` and
      `Hebrew → English` / `English → Hebrew` on the new pages and is unchanged on the Devanagari page
- [x] flipping the toggle in one course does not change it in another (separate progress keys)
- [x] run full test suite: `node --test`

### Task 6: Update documentation
- [x] update `README.md`: three courses, per-course install flow
- [x] update `sw.js` cache version if any late file changes
- [x] move this plan to `docs/plans/completed/`

## Post-Completion
*Items requiring manual intervention or external systems — informational only*

**Manual verification**:
- load a progress file from another course through the real file picker and confirm the
  `<course> file` message; load a pre-0.5.0 Devanagari backup and confirm it still imports
- install each course from a phone (iPhone Safari Add to Home Screen; Android Chrome) and confirm
  three separate icons/apps, each opening its own course offline
- review Russian Devanagari readings with a Nepali reader if possible
- review Hebrew romanization and letter notes with a Hebrew reader if possible

**Future work parked by design** (nothing in v1 may block these):
- cursive display forms: bundled open-license fonts (Cyrillic school-style handwriting; Hebrew
  ktav yad), one CSS class per course, meet card shows both forms, learned letters alternate forms
- Russian phrase groups; Hebrew niqqud; localized UI strings
