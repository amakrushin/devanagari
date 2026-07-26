import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as sched from '../js/scheduler.js';

const data = JSON.parse(await readFile(new URL('../characters.json', import.meta.url), 'utf8'));
const NOW = 1_000_000;

function metProgress(activeGroup, box) {
    const progress = sched.initProgress();
    progress.activeGroup = activeGroup;
    for (const c of sched.unlockedChars(data, progress))
        progress.chars[c.slug] = {box, due: NOW + sched.INTERVALS_MS[box], hotLeft: 0};
    return progress;
}

test('CorrectAnswerMovesUpOneBoxAndSchedulesReview', () => {
    const progress = sched.initProgress();
    sched.meetChar(progress, 'ka', NOW);
    const st = sched.applyAnswer(progress, 'ka', true, NOW);
    assert.equal(st.box, 1);
    assert.equal(st.due, NOW + sched.INTERVALS_MS[1]);
});

test('CorrectAnswerCapsAtMaxBox', () => {
    const progress = sched.initProgress();
    progress.chars.ka = {box: sched.MAX_BOX, due: 0, hotLeft: 0};
    assert.equal(sched.applyAnswer(progress, 'ka', true, NOW).box, sched.MAX_BOX);
});

test('WrongAnswerResetsToBoxZeroDueNow', () => {
    const progress = sched.initProgress();
    progress.chars.ka = {box: 3, due: 0, hotLeft: 0};
    const st = sched.applyAnswer(progress, 'ka', false, NOW);
    assert.equal(st.box, 0);
    assert.equal(st.due, NOW);
});

test('CorrectAnswerConsumesHotCharge', () => {
    const progress = sched.initProgress();
    sched.markHot(progress, 'ka', NOW);
    assert.equal(progress.chars.ka.hotLeft, 3);
    sched.applyAnswer(progress, 'ka', true, NOW);
    assert.equal(progress.chars.ka.hotLeft, 2);
});

test('BuildSessionIntroducesAtMostThreeNewCharacters', () => {
    const queue = sched.buildSession(sched.initProgress(), data, NOW);
    assert.equal(queue.length, 3);
    assert.ok(queue.every(item => item.isNew));
});

test('BuildSessionInterleavesIntroductionsAcrossGroups', () => {
    const progress = sched.initProgress();
    progress.activeGroup = 1;
    const queue = sched.buildSession(progress, data, NOW);
    assert.deepEqual(queue.map(item => item.slug), ['a', 'd0', 'aa']);
    assert.ok(queue.every(item => item.isNew));
});

test('BuildSessionPutsHotCharactersFirst', () => {
    const progress = metProgress(0, 2);
    sched.markHot(progress, 'uu', NOW);
    const queue = sched.buildSession(progress, data, NOW);
    assert.equal(queue[0].slug, 'uu');
});

test('BuildSessionUsesOnlyUnlockedCharacters', () => {
    const progress = sched.initProgress();
    const unlocked = new Set(sched.unlockedChars(data, progress).map(c => c.slug));
    for (const item of sched.buildSession(progress, data, NOW))
        assert.ok(unlocked.has(item.slug));
});

test('BuildSessionHasNoDuplicates', () => {
    const progress = metProgress(1, 0);
    const queue = sched.buildSession(progress, data, NOW);
    assert.equal(new Set(queue.map(item => item.slug)).size, queue.length);
});

test('BuildSessionPrefersWeakestDueCharacters', () => {
    const progress = metProgress(1, 3);
    progress.chars.a = {box: 0, due: NOW, hotLeft: 0};
    progress.chars.e = {box: 1, due: NOW, hotLeft: 0};
    const queue = sched.buildSession(progress, data, NOW);
    assert.equal(queue[0].slug, 'a');
    assert.equal(queue[1].slug, 'e');
});

test('BuildSessionCapsAtFifteenQuestions', () => {
    const progress = metProgress(1, 0);
    assert.equal(sched.buildSession(progress, data, NOW).length, 15);
});

test('BuildSessionWithGroupIndexUsesOnlyThatGroup', () => {
    const progress = metProgress(1, 0);
    const digits = new Set(data.groups[1].chars.map(c => c.slug));
    const queue = sched.buildSession(progress, data, NOW, {groupIndex: 1});
    assert.equal(queue.length, digits.size);
    for (const item of queue)
        assert.ok(digits.has(item.slug), `slug ${item.slug} is outside the selected group`);
});

test('BuildSessionWithGroupIndexIntroducesOnlyItsCharacters', () => {
    const progress = sched.initProgress();
    progress.activeGroup = 1;
    const queue = sched.buildSession(progress, data, NOW, {groupIndex: 1});
    assert.deepEqual(queue.map(item => item.slug), ['d0', 'd1', 'd2']);
    assert.ok(queue.every(item => item.isNew));
});

test('TryUnlockAdvancesWhenActiveGroupLearned', () => {
    const progress = metProgress(0, sched.LEARNED_BOX);
    const opened = sched.tryUnlock(progress, data);
    assert.equal(opened.id, 'digits');
    assert.equal(progress.activeGroup, 1);
});

test('TryUnlockRefusesWhileAnyCharacterIsWeak', () => {
    const progress = metProgress(0, sched.LEARNED_BOX);
    progress.chars.a.box = 1;
    assert.equal(sched.tryUnlock(progress, data), null);
    assert.equal(progress.activeGroup, 0);
});

test('TryUnlockStopsAtLastGroup', () => {
    const progress = metProgress(data.groups.length - 1, 4);
    assert.equal(sched.tryUnlock(progress, data), null);
});

test('PickDistractorsReturnsThreeUniqueOtherCharacters', () => {
    const progress = metProgress(0, 2);
    const picked = sched.pickDistractors(data, progress, 'i');
    assert.equal(picked.length, 3);
    assert.equal(new Set(picked).size, 3);
    assert.ok(!picked.includes('i'));
});

test('PickDistractorsPrefersConfusablePartners', () => {
    const progress = metProgress(0, 2);
    const picked = sched.pickDistractors(data, progress, 'gha');
    assert.ok(picked.includes('ga'), 'aspirate partner ga expected');
    assert.ok(picked.includes('dha'), 'lookalike dha expected');
});

test('PickDistractorsStaysWithinUnlockedGroups', () => {
    const progress = sched.initProgress();
    const unlocked = new Set(sched.unlockedChars(data, progress).map(c => c.slug));
    for (const slug of sched.pickDistractors(data, progress, 'a'))
        assert.ok(unlocked.has(slug));
});
