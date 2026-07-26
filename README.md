# devanagari — Nepali alphabet trainer

Personal web app for learning the Devanagari script as used for Nepali:
a spaced-repetition drill of vowels, consonants and digits.

- Static, no build step.
- Install on iPhone: open the GitHub Pages URL in Safari, Share, Add to Home Screen.
- Works offline after the first visit; progress is stored in the browser.

## Development

    python -m http.server 8000    # then open http://localhost:8000
    node --test                   # scheduler and data tests
