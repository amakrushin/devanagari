// Regenerates the app icons with a background color derived from APP_VERSION,
// so every installed PWA version is visually distinguishable on the home screen.
//
// Usage: node tools/generate-icons.mjs   (requires ImageMagick's `magick`)
// Run it after bumping APP_VERSION in js/app.js.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const appJs = readFileSync(join(root, 'js', 'app.js'), 'utf8');
const match = appJs.match(/APP_VERSION = '(\d+)\.(\d+)\.(\d+)'/);
if (!match)
    throw new Error('APP_VERSION not found in js/app.js');
const [, major, minor, patch] = match.map(Number);
const version = `${major}.${minor}.${patch}`;

// Golden-angle hue stepping: consecutive versions land far apart on the color
// wheel. The 216.2 offset anchors v0.2.0 to the original red (hue 358).
const index = major * 10000 + minor * 100 + patch;
const hue = (index * 137.508 + 216.2) % 360;
const background = `hsl(${hue.toFixed(1)}, 63%, 43%)`;

const targets = [
    { glyph: 'glyph-512.png', out: join('icons', 'icon-512.png'), size: 512 },
    { glyph: 'glyph-192.png', out: join('icons', 'icon-192.png'), size: 192 },
    { glyph: 'glyph-180.png', out: join('icons', 'apple-touch-icon.png'), size: 180 },
];

for (const { glyph, out, size } of targets) {
    execFileSync('magick', [
        '-size', `${size}x${size}`, `canvas:${background}`,
        join(root, 'tools', 'icon-glyphs', glyph),
        '-composite',
        '-strip', 'PNG24:' + join(root, out),
    ]);
    console.log(`${out} <- ${background}`);
}

console.log(`Icons regenerated for v${version}.`);
