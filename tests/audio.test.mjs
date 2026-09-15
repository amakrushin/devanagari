import test from 'node:test';
import assert from 'node:assert/strict';

const requested = [];
globalThis.fetch = async url => {
    requested.push(url);
    return {json: async () => ({version: 1, clips: ['a', 'pkakdela']})};
};
const audio = await import('../js/audio.js');

test('WithoutADirectoryNothingIsFetchedAndNoClipResolves', async () => {
    await audio.loadManifest(undefined);
    assert.deepEqual(requested, []);
    assert.equal(audio.resolveClip('a'), null);
});

test('ManifestComesFromTheCourseDirectoryAndClipsResolveInsideIt', async () => {
    await audio.loadManifest('audio/russian/');
    assert.deepEqual(requested, ['audio/russian/manifest.json']);
    assert.equal(audio.resolveClip('a'), 'audio/russian/a.mp3');
    assert.equal(audio.resolveClip('pkakdela'), 'audio/russian/pkakdela.mp3');
    assert.equal(audio.resolveClip('xnamastehajura'), null);
});

test('AFailedManifestFetchLeavesNoClips', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    await audio.loadManifest('audio/hebrew/');
    assert.equal(audio.resolveClip('a'), 'audio/russian/a.mp3');
});
