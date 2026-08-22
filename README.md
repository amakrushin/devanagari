# devanagari — Nepali alphabet trainer

Personal web app for learning the Devanagari script as used for Nepali:
a spaced-repetition drill of characters, consonant-vowel combinations,
compound characters, daily words, digits and practical Kathmandu phrases
grouped by topic.

- Static, no build step.
- Install on iPhone: open the GitHub Pages URL in Safari, Share, Add to Home Screen.
- Works offline after the first visit; progress is stored in the browser.

## Development

    python -m http.server 8000    # then open http://localhost:8000
    node --test                   # scheduler and data tests
    node tools/generate-audio.mjs # regenerate phrase audio (needs .venv with gTTS; see tool header)
    node tools/generate-icons.mjs # regenerate app icons after a version bump (needs ImageMagick)

Each version gets its own icon background color (derived from APP_VERSION in
js/app.js), so parallel installs on the iPhone home screen are easy to tell
apart. Version bump checklist: APP_VERSION in js/app.js, CACHE_VERSION in
sw.js, then regenerate the icons.
