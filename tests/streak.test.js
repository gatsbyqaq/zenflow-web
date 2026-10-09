/* node tests/streak.test.js */
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var ctx = { globalThis: {}, console: console, Date: Date };
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '..', 'streak.js'), 'utf8'), ctx);
var S = ctx.globalThis.ZFStreak;
var DAY = 86400000;
var t0 = Date.UTC(2026, 0, 1);

function base(over) {
  var s = {
    createdAt: t0,
    manualStreakStart: 0,
    bestStreakMs: 0,
    resetTypes: S.defaultResetTypes(),
    relapses: []
  };
  if (over) Object.keys(over).forEach(function (k) { s[k] = over[k]; });
  return s;
}

assert.deepStrictEqual(S.normalizeResetTypes(undefined), S.defaultResetTypes());
assert.strictEqual(S.normalizeResetTypes({ masturbation: false, dream: false }).masturbation, true);
assert.strictEqual(S.normalizeResetTypes({ dream: false }).dream, false);
assert.strictEqual(S.normalizeResetTypes({ porn: 'no' }).porn, true);

assert.strictEqual(S.relapseResets({ types: [] }, S.defaultResetTypes()), true);
assert.strictEqual(S.relapseResets({ types: ['dream'] }, { dream: false, masturbation: true }), false);
assert.strictEqual(S.relapseResets({ types: ['dream', 'masturbation'] }, { dream: false }), true);
assert.strictEqual(S.relapseResets({ types: ['porn', 'fantasy'] }, { porn: false, fantasy: false }), false);
assert.strictEqual(S.relapseResets({ types: ['masturbation'] }, { masturbation: false }), true);

var onlyDream = base({
  resetTypes: S.normalizeResetTypes({ dream: false }),
  relapses: [{ ts: t0 + 10 * DAY, types: ['dream'] }]
});
assert.strictEqual(S.computeStreakStart(onlyDream, t0 + 12 * DAY), t0);

var dreamThenMast = base({
  resetTypes: S.normalizeResetTypes({ dream: false }),
  relapses: [
    { ts: t0 + 3 * DAY, types: ['dream'] },
    { ts: t0 + 8 * DAY, types: ['masturbation'] }
  ]
});
assert.strictEqual(S.computeStreakStart(dreamThenMast, t0 + 12 * DAY), t0 + 8 * DAY);

var manualAfter = base({
  manualStreakStart: t0 + 10 * DAY,
  relapses: [{ ts: t0 + 4 * DAY, types: ['porn'] }]
});
assert.strictEqual(S.computeStreakStart(manualAfter, t0 + 12 * DAY), t0 + 10 * DAY);

var manualBefore = base({
  manualStreakStart: t0 + 2 * DAY,
  relapses: [{ ts: t0 + 6 * DAY, types: ['sex'] }]
});
assert.strictEqual(S.computeStreakStart(manualBefore, t0 + 12 * DAY), t0 + 6 * DAY);

assert.strictEqual(S.looksLikeManualStart({ streakStart: t0 + 5 * DAY, createdAt: t0, relapses: [{ ts: t0 + DAY }] }), true);
assert.strictEqual(S.looksLikeManualStart({ streakStart: t0, createdAt: t0, relapses: [] }), false);
assert.strictEqual(S.looksLikeManualStart({ streakStart: t0 + 4 * DAY, createdAt: t0, relapses: [{ ts: t0 + 4 * DAY + 500 }] }), false);

var gaps = base({
  resetTypes: S.normalizeResetTypes({ dream: false, fantasy: false }),
  relapses: [
    { ts: t0 + 2 * DAY, types: ['porn'] },
    { ts: t0 + 3 * DAY, types: ['dream'] },
    { ts: t0 + 9 * DAY, types: ['porn'] }
  ]
});
assert.strictEqual(S.historicalBest(gaps), 7 * DAY);

var ended = S.endedStreakMs(base({
  relapses: [{ id: 'a', ts: t0 + 2 * DAY, types: ['porn'] }]
}), t0 + 5 * DAY, ['fantasy'], null);
assert.strictEqual(ended, 3 * DAY);
assert.strictEqual(S.endedStreakMs(base(), t0 + 5 * DAY, ['porn'], null), 5 * DAY);
assert.strictEqual(S.endedStreakMs(base({ resetTypes: S.normalizeResetTypes({ dream: false }) }), t0 + 5 * DAY, ['dream'], null), 0);

assert.strictEqual(S.historicalBest(gaps), 7 * DAY);
assert.strictEqual(S.totalCleanMs(gaps, t0 + 12 * DAY), 12 * DAY);

var oneReset = base({
  relapses: [{ ts: t0 + 10 * DAY, types: ['porn'], streakMs: 0 }]
});
assert.strictEqual(S.historicalBest(oneReset), 10 * DAY);
assert.strictEqual(S.totalCleanMs(oneReset, t0 + 13 * DAY), 13 * DAY);
assert.strictEqual(S.computeStreakStart(oneReset, t0 + 13 * DAY), t0 + 10 * DAY);

var kept = base({
  bestStreakMs: 10 * DAY,
  relapses: [
    { ts: t0 + 10 * DAY, types: ['masturbation'], streakMs: 10 * DAY },
    { ts: t0 + 12 * DAY, types: ['porn'], streakMs: 2 * DAY }
  ]
});
assert.strictEqual(S.historicalBest(kept), 10 * DAY);
assert.strictEqual(S.totalCleanMs(kept, t0 + 15 * DAY), 15 * DAY);

var dreamOnly = base({
  resetTypes: S.normalizeResetTypes({ dream: false }),
  relapses: [{ ts: t0 + 4 * DAY, types: ['dream'] }]
});
assert.strictEqual(S.totalCleanMs(dreamOnly, t0 + 6 * DAY), 6 * DAY);

var manualLater = base({
  manualStreakStart: t0 + 10 * DAY,
  relapses: [{ ts: t0 + 4 * DAY, types: ['porn'], streakMs: 4 * DAY }]
});
assert.strictEqual(S.computeStreakStart(manualLater, t0 + 12 * DAY), t0 + 10 * DAY);
assert.strictEqual(S.totalCleanMs(manualLater, t0 + 12 * DAY), 6 * DAY);

assert.strictEqual(S.wholeDays(0), 0);
assert.strictEqual(S.wholeDays(-DAY), 0);
assert.strictEqual(S.wholeDays(1.2 * DAY), 1);
assert.strictEqual(S.wholeDays(9.9 * DAY), 9);
assert.strictEqual(S.wholeDays(10 * DAY), 10);
assert.strictEqual(S.wholeDays(10.2 * DAY), 10);

console.log('streak tests ok');
