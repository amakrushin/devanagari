import test from 'node:test';
import assert from 'node:assert/strict';
import {readdir, readFile, stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {COURSES} from '../js/courses.js';

const ROOT = new URL('../', import.meta.url);

const courses = await Promise.all(Object.values(COURSES).filter(c => c.audio).map(async course => {
    const dir = fileURLToPath(new URL(course.audio.dir, ROOT));
    const manifest = JSON.parse(await readFile(`${dir}manifest.json`, 'utf8'));
    const data = JSON.parse(await readFile(new URL(course.dataFile, ROOT), 'utf8'));
    const slugs = data.groups.filter(g => g.audio).flatMap(g => g.chars.map(c => c.slug));
    return {id: course.id, dir, manifest, slugs};
}));

test('AudibleCoursesAreDevanagariAndRussian', () => {
    assert.deepEqual(courses.map(c => c.id).sort(), ['devanagari', 'russian']);
});

for (const {id, dir, manifest, slugs} of courses) {
    test(`${id}: EveryAudibleCharacterHasAClipInTheManifest`, () => {
        const clips = new Set(manifest.clips);
        for (const slug of slugs)
            assert.ok(clips.has(slug), `${slug} has no clip in the manifest`);
    });

    test(`${id}: ManifestIsSortedUniqueAndAudibleOnly`, () => {
        assert.equal(manifest.version, 1);
        assert.deepEqual(manifest.clips, [...manifest.clips].sort());
        assert.equal(new Set(manifest.clips).size, manifest.clips.length);
        const known = new Set(slugs);
        for (const slug of manifest.clips)
            assert.ok(known.has(slug), `manifest entry ${slug} is not an audible slug`);
    });

    test(`${id}: EveryManifestClipIsARealMp3`, async () => {
        for (const slug of manifest.clips) {
            const path = `${dir}${slug}.mp3`;
            assert.ok((await stat(path)).size > 1000, `${slug}.mp3 is suspiciously small`);
            const head = (await readFile(path)).subarray(0, 3);
            const isMp3 = head.toString('latin1').startsWith('ID3')
                || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0);
            assert.ok(isMp3, `${slug}.mp3 does not start like an mp3 file`);
        }
    });

    test(`${id}: NoStrayFilesInAudioDir`, async () => {
        const clips = new Set(manifest.clips);
        for (const file of await readdir(dir)) {
            if (!file.endsWith('.mp3'))
                continue;
            assert.ok(clips.has(file.slice(0, -4)), `stray clip ${file} not in the manifest`);
        }
    });
}

test('NoClipsOutsideCourseDirectories', async () => {
    const root = fileURLToPath(new URL('audio/', ROOT));
    for (const file of await readdir(root))
        assert.ok(!file.endsWith('.mp3') && file !== 'manifest.json', `stray ${file} in audio/`);
});
