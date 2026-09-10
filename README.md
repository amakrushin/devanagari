# devanagari — alphabet trainers

Personal web app for learning an alphabet by spaced repetition. One codebase
serves three courses, each installable as its own app:

- `index.html` — **devanagari**: the Devanagari script as used for Nepali, with
  Latin readings: characters, consonant-vowel combinations, compound
  characters, daily words, digits and practical Kathmandu phrases by topic.
- `russian.html` — **russian**: the Cyrillic alphabet with Devanagari readings,
  for Nepali speakers; both cases on every card, plus a group of short words.
- `hebrew.html` — **hebrew**: the Hebrew alphabet with Latin readings, final
  forms as their own group, right-to-left cards, plus a group of short words.

- Static, no build step.
- Install on iPhone: open the course page in Safari, Share, Add to Home Screen.
  Each course installs as a separate icon; the flags at the top of every
  course page switch to the other two.
- Works offline after the first visit; progress is stored in the browser per
  course. A saved progress file names its course and loads only into that one.

A course is a `<name>.json` character file, an optional `<name>-words.json`
daily-word file, a manifest, and an entry in `js/courses.js`.

## Development

    python -m http.server 8000    # then open http://localhost:8000
    node --test                   # scheduler, course and data tests
    node tools/generate-audio.mjs # regenerate phrase audio (needs .venv with gTTS; see tool header)
    node tools/generate-icons.mjs # regenerate app icons after a version bump (needs ImageMagick)

Each version gets its own icon background color (derived from APP_VERSION in
js/app.js), so parallel installs on the iPhone home screen are easy to tell
apart; the Russian and Hebrew icons take the same hue shifted by a third of
the wheel and show one letter of their alphabet. Version bump checklist: APP_VERSION in js/app.js, CACHE_VERSION in
sw.js, then regenerate the icons.
