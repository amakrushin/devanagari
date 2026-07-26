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
    progress.activeGroup = data.groups.length - 1;
    const queue = sched.buildSession(progress, data, NOW);
    // Round-robin takes the first new character of each open group in order.
    assert.deepEqual(queue.map(item => item.slug), ['a', 'kaa', 'pra']);
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
    const digitsIndex = data.groups.findIndex(g => g.id === 'digits');
    const progress = metProgress(digitsIndex, 0);
    const digits = new Set(data.groups[digitsIndex].chars.map(c => c.slug));
    const queue = sched.buildSession(progress, data, NOW, {groupIndex: digitsIndex});
    assert.equal(queue.length, digits.size);
    for (const item of queue)
        assert.ok(digits.has(item.slug), `slug ${item.slug} is outside the selected group`);
});

test('BuildSessionWithGroupIndexIntroducesOnlyItsCharacters', () => {
    const digitsIndex = data.groups.findIndex(g => g.id === 'digits');
    const progress = sched.initProgress();
    progress.activeGroup = digitsIndex;
    const queue = sched.buildSession(progress, data, NOW, {groupIndex: digitsIndex});
    assert.deepEqual(queue.map(item => item.slug), ['d0', 'd1', 'd2']);
    assert.ok(queue.every(item => item.isNew));
});

test('TryUnlockAdvancesWhenActiveGroupLearned', () => {
    const progress = metProgress(0, sched.LEARNED_BOX);
    const opened = sched.tryUnlock(progress, data);
    assert.equal(opened.id, 'combos');
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

test('InitProgressSelectsCharactersById', () => {
    const progress = sched.initProgress();
    assert.equal(progress.selectedGroup, 'characters');
    assert.equal(progress.v, sched.PROGRESS_VERSION);
});

test('NormalizeMapsNumericSelectionByHistoricalOrder', () => {
    assert.equal(sched.normalizeProgress({v: 1, chars: {}, selectedGroup: 0}, data).selectedGroup,
        'characters');
    assert.equal(sched.normalizeProgress({v: 1, chars: {}, selectedGroup: 1}, data).selectedGroup,
        'digits');
});

test('NormalizeDefaultsMissingOrInvalidSelectionToFirstGroup', () => {
    const first = data.groups[0].id;
    assert.equal(sched.normalizeProgress({chars: {}}, data).selectedGroup, first);
    assert.equal(sched.normalizeProgress({v: 1, chars: {}, selectedGroup: 7}, data).selectedGroup, first);
    assert.equal(sched.normalizeProgress({v: 2, chars: {}, selectedGroup: 'bogus'}, data).selectedGroup,
        first);
});

test('NormalizeKeepsValidGroupIds', () => {
    assert.equal(sched.normalizeProgress({v: 2, chars: {}, selectedGroup: 'digits'}, data).selectedGroup,
        'digits');
});

test('NormalizeRejectsNewerVersionsAndGarbage', () => {
    assert.equal(sched.normalizeProgress({v: sched.PROGRESS_VERSION + 1, chars: {}}, data), null);
    assert.equal(sched.normalizeProgress(null, data), null);
    assert.equal(sched.normalizeProgress({box: 3}, data), null);
    assert.equal(sched.normalizeProgress('text', data), null);
});

test('NormalizePreservesCharBoxesAndShownWords', () => {
    const blob = {
        v: 1,
        chars: {ka: {box: 4, due: 5, hotLeft: 1}},
        selectedGroup: 1,
        words: {'जल': 42},
        sessions: 9,
    };
    const normalized = sched.normalizeProgress(blob, data);
    assert.deepEqual(normalized.chars, {ka: {box: 4, due: 5, hotLeft: 1}});
    assert.deepEqual(normalized.words, {'जल': 42});
    assert.equal(normalized.sessions, 9);
    assert.equal(normalized.v, sched.PROGRESS_VERSION);
});

test('NormalizeMergesStatsDefaultsIntoLegacyBlobs', () => {
    const legacy = sched.normalizeProgress({chars: {}}, data);
    assert.deepEqual(legacy.stats, {daysActive: 0, streak: 0, lastDay: null, timeMs: 0});
    const partial = sched.normalizeProgress(
        {v: 1, chars: {}, stats: {daysActive: 3, streak: 2, lastDay: 'x', timeMs: 5}}, data);
    assert.equal(partial.stats.daysActive, 3);
});

test('NormalizeClampsActiveGroupToExistingGroups', () => {
    assert.equal(sched.normalizeProgress({v: 1, chars: {}, activeGroup: 99}, data).activeGroup,
        data.groups.length - 1);
});
