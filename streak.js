/* ZenFlow · 连续天数计算（无 DOM，浏览器与 Node 都能跑）
 * 一条破戒会重置连续天数，当且仅当它的类型里至少有一个被设为「重置」。
 * 自慰始终重置。没有类型的旧记录视为重置，避免升级后把已有连续天数算丢。
 */
(function (root) {
  'use strict';
  var TYPE_IDS = ['masturbation', 'porn', 'sex', 'fantasy', 'dream'];
  var LOCKED = { masturbation: true };

  function defaultResetTypes() {
    var o = {};
    TYPE_IDS.forEach(function (id) { o[id] = true; });
    return o;
  }

  function normalizeResetTypes(raw) {
    var o = defaultResetTypes();
    if (raw && typeof raw === 'object') {
      TYPE_IDS.forEach(function (id) {
        if (LOCKED[id]) { o[id] = true; return; }
        if (typeof raw[id] === 'boolean') o[id] = raw[id];
      });
    }
    o.masturbation = true;
    return o;
  }

  function normalizeTypes(arr) {
    var out = [];
    if (!Array.isArray(arr)) return out;
    arr.forEach(function (id) {
      id = String(id || '');
      if (TYPE_IDS.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id);
    });
    return out.slice(0, 5);
  }

  function relapseResets(relapse, resetTypes) {
    var map = normalizeResetTypes(resetTypes);
    var types = normalizeTypes(relapse && relapse.types);
    if (!types.length) return true;
    for (var i = 0; i < types.length; i++) if (map[types[i]]) return true;
    return false;
  }

  function computeStreakStart(s, now) {
    now = typeof now === 'number' ? now : Date.now();
    var latest = 0;
    (s.relapses || []).forEach(function (r) {
      if (!r || typeof r.ts !== 'number' || r.ts > now + 60000) return;
      if (!relapseResets(r, s.resetTypes)) return;
      if (r.ts > latest) latest = r.ts;
    });
    var manual = (typeof s.manualStreakStart === 'number' && isFinite(s.manualStreakStart) && s.manualStreakStart > 0)
      ? Math.min(s.manualStreakStart, now) : 0;
    var created = (typeof s.createdAt === 'number' && isFinite(s.createdAt) && s.createdAt > 0) ? s.createdAt : now;
    var start = (manual && manual >= latest) ? manual : (latest || manual || created);
    if (start > now) start = now;
    return start;
  }

  /* 开始时间对不上「安装时刻」也对不上任何破戒：当成用户手动调整过，升级后保留。 */
  function looksLikeManualStart(s) {
    if (!s || typeof s.streakStart !== 'number') return false;
    var created = s.createdAt || 0;
    if (Math.abs(s.streakStart - created) < 2000) return false;
    var rels = s.relapses || [];
    for (var i = 0; i < rels.length; i++) {
      if (rels[i] && typeof rels[i].ts === 'number' && Math.abs(rels[i].ts - s.streakStart) < 2000) return false;
    }
    return true;
  }

  /* 这次破戒之前，连续天数从哪一刻算起（不含这次本身）。 */
  function segmentStartBefore(s, ts, now) {
    now = typeof now === 'number' ? now : Date.now();
    var manual = (typeof s.manualStreakStart === 'number' && s.manualStreakStart > 0) ? Math.min(s.manualStreakStart, now) : 0;
    var created = (typeof s.createdAt === 'number' && s.createdAt > 0) ? s.createdAt : 0;
    var prev = manual || created || 0;
    (s.relapses || []).forEach(function (r) {
      if (!r || typeof r.ts !== 'number' || r.ts >= ts) return;
      if (!relapseResets(r, s.resetTypes)) return;
      if (r.ts > prev) prev = r.ts;
    });
    return prev > ts ? ts : prev;
  }

  function endedStreakMs(s, ts, types, ignoreId) {
    if (!relapseResets({ types: types }, s.resetTypes)) return 0;
    var rels = (s.relapses || []).filter(function (r) { return !ignoreId || r.id !== ignoreId; });
    var prev = segmentStartBefore({
      createdAt: s.createdAt,
      manualStreakStart: s.manualStreakStart,
      resetTypes: s.resetTypes,
      relapses: rels
    }, ts);
    return Math.max(0, ts - prev);
  }

  /* 已结束的间隔。不含「现在还在走的这一段」，避免每次同步都把 best 改掉。 */
  function historicalBest(s) {
    var times = (s.relapses || []).filter(function (r) {
      return r && typeof r.ts === 'number' && relapseResets(r, s.resetTypes);
    }).map(function (r) { return r.ts; }).sort(function (a, b) { return a - b; });
    var best = (typeof s.bestStreakMs === 'number' && s.bestStreakMs > 0) ? s.bestStreakMs : 0;
    for (var i = 1; i < times.length; i++) best = Math.max(best, times[i] - times[i - 1]);
    (s.relapses || []).forEach(function (r) {
      if (r && typeof r.streakMs === 'number' && r.streakMs > best) best = r.streakMs;
    });
    return best;
  }

  root.ZFStreak = {
    TYPE_IDS: TYPE_IDS,
    LOCKED: LOCKED,
    defaultResetTypes: defaultResetTypes,
    normalizeResetTypes: normalizeResetTypes,
    normalizeTypes: normalizeTypes,
    relapseResets: relapseResets,
    computeStreakStart: computeStreakStart,
    looksLikeManualStart: looksLikeManualStart,
    segmentStartBefore: segmentStartBefore,
    endedStreakMs: endedStreakMs,
    historicalBest: historicalBest
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
