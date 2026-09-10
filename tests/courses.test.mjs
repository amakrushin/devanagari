import test from 'node:test';
import assert from 'node:assert/strict';
import {COURSES, DEFAULT_COURSE, exportCourseId, recallModeLabel, resolveCourse}
    from '../js/courses.js';

const ids = Object.keys(COURSES);

test('RegistersThreeCourses', () => {
    assert.deepEqual(ids.sort(), ['devanagari', 'hebrew', 'russian']);
});

test('EveryIdResolvesToItsOwnEntry', () => {
    for (const id of ids)
        assert.equal(resolveCourse(id).id, id);
});

test('UnknownOrMissingIdFallsBackToDevanagari', () => {
    assert.equal(DEFAULT_COURSE, 'devanagari');
    assert.equal(resolveCourse('klingon').id, 'devanagari');
    assert.equal(resolveCourse(undefined).id, 'devanagari');
    assert.equal(resolveCourse(null).id, 'devanagari');
    assert.equal(resolveCourse('').id, 'devanagari');
});

test('EntriesCarryAllShellFields', () => {
    for (const course of Object.values(COURSES)) {
        for (const key of ['page', 'dataFile', 'wordsFile', 'title', 'tagline', 'progressKey',
            'language'])
            assert.ok(course[key], `${course.id} lacks ${key}`);
    }
});

test('ProgressKeysDataFilesAndPagesAreUnique', () => {
    for (const key of ['progressKey', 'dataFile', 'wordsFile', 'page']) {
        const values = Object.values(COURSES).map(c => c[key]);
        assert.equal(new Set(values).size, values.length, `duplicate ${key}`);
    }
});

test('DevanagariEntryKeepsLegacyValues', () => {
    const course = COURSES.devanagari;
    assert.equal(course.progressKey, 'devanagari.progress');
    assert.equal(course.dataFile, 'characters.json');
    assert.equal(course.wordsFile, 'words.json');
    assert.equal(course.page, './');
    assert.ok(!course.rtl);
});

test('OnlyHebrewIsRightToLeft', () => {
    assert.equal(COURSES.hebrew.rtl, true);
    assert.ok(!COURSES.russian.rtl);
});

test('RecallModeLabelIsUnchangedForDevanagari', () => {
    assert.equal(recallModeLabel('say', COURSES.devanagari), 'English → Nepali');
    assert.equal(recallModeLabel('read', COURSES.devanagari), 'Nepali → English');
});

test('RecallModeLabelNamesTheCourseLanguage', () => {
    assert.equal(recallModeLabel('say', COURSES.russian), 'English → Russian');
    assert.equal(recallModeLabel('read', COURSES.russian), 'Russian → English');
    assert.equal(recallModeLabel('say', COURSES.hebrew), 'English → Hebrew');
    assert.equal(recallModeLabel('read', COURSES.hebrew), 'Hebrew → English');
});

test('UnknownModeReadsAsRead', () => {
    assert.equal(recallModeLabel(undefined, COURSES.russian), 'Russian → English');
});

test('ExportWithoutCourseFieldIsDevanagari', () => {
    assert.equal(exportCourseId({chars: {}}), 'devanagari');
    assert.equal(exportCourseId(null), 'devanagari');
    assert.equal(exportCourseId({course: 'hebrew'}), 'hebrew');
});
