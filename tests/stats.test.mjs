import test from 'node:test';
import assert from 'node:assert/strict';
import * as stats from '../js/stats.js';

const DAY_MS = 24 * 60 * 60 * 1000;
// Midday avoids timezone edges around midnight in local-day math.
const NOON = new Date(2026, 6, 27, 12, 0, 0).getTime();

function freshStats() {
    return {daysActive: 0, streak: 0, lastDay: null, timeMs: 0};
}

test('FirstActivityStartsDaysAndStreak', () => {
    const s = freshStats();
    stats.touchDay(s, NOON);
    assert.equal(s.daysActive, 1);
    assert.equal(s.streak, 1);
    assert.equal(s.lastDay, stats.localDayString(NOON));
});

test('SameDayActivityChangesNothing', () => {
    const s = freshStats();
    stats.touchDay(s, NOON);
    stats.touchDay(s, NOON + 60 * 1000);
    assert.equal(s.daysActive, 1);
    assert.equal(s.streak, 1);
});

test('ConsecutiveDayExtendsStreak', () => {
    const s = freshStats();
    stats.touchDay(s, NOON);
    stats.touchDay(s, NOON + DAY_MS);
    assert.equal(s.daysActive, 2);
    assert.equal(s.streak, 2);
});

test('GapResetsStreakButKeepsDays', () => {
    const s = freshStats();
    stats.touchDay(s, NOON);
    stats.touchDay(s, NOON + DAY_MS);
    stats.touchDay(s, NOON + 5 * DAY_MS);
    assert.equal(s.daysActive, 3);
    assert.equal(s.streak, 1);
});

test('AddTimeAccumulates', () => {
    const s = freshStats();
    stats.addTime(s, 5000);
    stats.addTime(s, 2500);
    assert.equal(s.timeMs, 7500);
});

test('AddTimeCapsLongGaps', () => {
    const s = freshStats();
    stats.addTime(s, 10 * 60 * 1000);
    assert.equal(s.timeMs, 60 * 1000);
});

test('AddTimeIgnoresNegativeDeltas', () => {
    const s = freshStats();
    stats.addTime(s, -500);
    assert.equal(s.timeMs, 0);
});

test('FormatTimeCoversAllRanges', () => {
    assert.equal(stats.formatTime(0), '<1m');
    assert.equal(stats.formatTime(59 * 1000), '<1m');
    assert.equal(stats.formatTime(60 * 1000), '1m');
    assert.equal(stats.formatTime(42 * 60 * 1000), '42m');
    assert.equal(stats.formatTime(60 * 60 * 1000), '1h 0m');
    assert.equal(stats.formatTime((3 * 60 + 42) * 60 * 1000 + 30 * 1000), '3h 42m');
});
