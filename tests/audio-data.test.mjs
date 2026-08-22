import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const AUDIO_DIR = fileURLToPath(new URL('../audio/', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../audio/manifest.json', import.meta.url), 'utf8'));
const phraseSlugs = JSON.parse(await readFile(new URL('../characters.json', import.meta.url), 'utf8'))
    .groups.flatMap(g => g.chars.map(c => c.slug))
    .filter(slug => /^x[a-z0-9]+$/.test(slug));

test('EveryPhraseHasAClipInTheManifest', () => {
    const clips = new Set(manifest.clips);
    for (const slug of phraseSlugs)
        assert.ok(clips.has(slug), `phrase ${slug} has no clip in the manifest`);
});

test('ManifestIsSortedUniqueAndPhraseOnly', () => {
    assert.equal(manifest.version, 1);
    assert.deepEqual(manifest.clips, [...manifest.clips].sort());
    assert.equal(new Set(manifest.clips).size, manifest.clips.length);
    const known = new Set(phraseSlugs);
    for (const slug of manifest.clips)
        assert.ok(known.has(slug), `manifest entry ${slug} is not a phrase slug`);
});

test('EveryManifestClipIsARealMp3', async () => {
    for (const slug of manifest.clips) {
        const path = `${AUDIO_DIR}${slug}.mp3`;
        assert.ok((await stat(path)).size > 1000, `${slug}.mp3 is suspiciously small`);
        const head = (await readFile(path)).subarray(0, 3);
        const isMp3 = head.toString('latin1').startsWith('ID3')
            || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
        assert.ok(isMp3, `${slug}.mp3 does not start like an mp3 file`);
    }
});

test('NoStrayFilesInAudioDir', async () => {
    const clips = new Set(manifest.clips);
    for (const file of await readdir(AUDIO_DIR)) {
        if (!file.endsWith('.mp3'))
            continue;
        assert.ok(clips.has(file.slice(0, -4)), `stray clip ${file} not in the manifest`);
    }
});
