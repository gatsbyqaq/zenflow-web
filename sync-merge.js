/* 记录级合并。两台设备结果必须相同：merge(a,b) = merge(b,a)，merge(a,a) = a。 */
(function (root) {
  var TOMB_MS = 180 * 24 * 60 * 60 * 1000;
  var CONFLICT_MS = 30 * 24 * 60 * 60 * 1000;

  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    }
    return JSON.stringify(v);
  }

  function stamp(r) {
    if (!r || typeof r !== 'object') return 0;
    var n = +r.updatedAt || +r.editedAt || +r.ts || 0;
    return isFinite(n) && n > 0 ? n : 0;
  }

  function clampStamp(t, serverNow) {
    t = +t || 0;
    serverNow = +serverNow || 0;
    if (serverNow && t > serverNow + 5 * 60 * 1000) return serverNow;
    return t;
  }

  function reasonOf(r) {
    if (r && typeof r === 'object') {
      var text = String(r.text || '');
      var id = String(r.id || text);
      return { id: id, text: text || id, updatedAt: stamp(r) };
    }
    var s = String(r || '');
    return { id: s, text: s, updatedAt: 0 };
  }

  function prefer(aTime, aVal, bTime, bVal) {
    if (aTime !== bTime) return aTime > bTime;
    var sa = stable(aVal), sb = stable(bVal);
    if (sa === sb) return true;
    return sa > sb;
  }

  function betterRec(x, y) {
    var tx = stamp(x), ty = stamp(y);
    if (tx !== ty) return tx > ty ? x : y;
    return stable(x) >= stable(y) ? x : y;
  }

  function mergeTomb(a, b, now) {
    var out = {};
    var cutoff = (+now || Date.now()) - TOMB_MS;
    [a || {}, b || {}].forEach(function (m) {
      Object.keys(m).forEach(function (k) {
        var v = +m[k];
        if (!isFinite(v) || v === 0) return;
        if (Math.abs(v) < cutoff) return;
        if (!(k in out) || Math.abs(v) > Math.abs(out[k])) out[k] = v;
      });
    });
    return out;
  }

  function tombAt(map, id) { return Math.abs(+((map || {})[id]) || 0); }

  function kept(rec, tombs) {
    var d = tombAt(tombs, rec.id);
    if (!d) return true;
    var u = stamp(rec);
    return u >= d;
  }

  function mergeById(x, y, tombs, discarded) {
    var map = {};
    x.concat(y).forEach(function (r) {
      if (!r || !r.id) return;
      if (!(r.id in map)) { map[r.id] = r; return; }
      var prev = map[r.id];
      var win = betterRec(prev, r);
      var lose = win === prev ? r : prev;
      if (stable(win) !== stable(lose)) discarded.push({ kind: 'record', id: r.id, discarded: lose, kept: win });
      map[r.id] = win;
    });
    return Object.keys(map).filter(function (id) { return kept(map[id], tombs); }).map(function (id) { return map[id]; })
      .sort(function (p, q) { return (p.ts || 0) - (q.ts || 0) || String(p.id).localeCompare(String(q.id)); });
  }

  function mergeReasons(a, b, tombs, discarded) {
    var map = {};
    function put(raw) {
      var r = reasonOf(raw);
      if (!r.id) return;
      if (!(r.id in map)) { map[r.id] = r; return; }
      var prev = map[r.id];
      var win = betterRec(prev, r);
      var lose = win === prev ? r : prev;
      if (stable(win) !== stable(lose)) discarded.push({ kind: 'reason', id: r.id, discarded: lose, kept: win });
      map[r.id] = win;
    }
    (a || []).forEach(put);
    (b || []).forEach(put);
    return Object.keys(map).filter(function (id) { return kept(map[id], tombs); }).map(function (id) { return map[id]; })
      .sort(function (p, q) { return String(p.id).localeCompare(String(q.id)); });
  }

  function mergeCheckins(a, b, tombs) {
    var out = {};
    [a || {}, b || {}].forEach(function (m) {
      Object.keys(m).forEach(function (k) {
        var row = m[k];
        if (!row) return;
        var rec = Object.assign({ id: k }, row, { updatedAt: stamp(row) });
        if (!kept(rec, tombs)) return;
        if (!out[k] || betterRec(out[k], rec) === rec) out[k] = row;
      });
    });
    Object.keys(out).forEach(function (k) {
      var rec = Object.assign({ id: k }, out[k], { updatedAt: stamp(out[k]) });
      if (!kept(rec, tombs)) delete out[k];
    });
    return out;
  }

  function mergeRecords(a, b, now) {
    a = a || {}; b = b || {};
    var discarded = [];
    var removed = {
      ids: mergeTomb(a.removed && a.removed.ids, b.removed && b.removed.ids, now),
      reasons: mergeTomb(a.removed && a.removed.reasons, b.removed && b.removed.reasons, now),
      checkins: mergeTomb(a.removed && a.removed.checkins, b.removed && b.removed.checkins, now)
    };
    function field(timeKey, valKey) {
      var at = +a[timeKey] || 0, bt = +b[timeKey] || 0;
      var left = prefer(at, a[valKey], bt, b[valKey]);
      return { value: left ? a[valKey] : b[valKey], time: Math.max(at, bt) };
    }
    var streak = field('streakStartSetAt', 'streakStart');
    var goal = field('goalSetAt', 'goalDays');
    var name = field('displayNameSetAt', 'displayName');
    var avatar = field('avatarSetAt', 'avatarDataUrl');
    var reset = field('resetTypesSetAt', 'resetTypes');
    var manual = field('manualStreakStartSetAt', 'manualStreakStart');
    var state = {
      version: 1,
      createdAt: Math.min(+a.createdAt || 0, +b.createdAt || 0) || (+a.createdAt || +b.createdAt || 0),
      streakStart: streak.value,
      streakStartSetAt: streak.time,
      bestStreakMs: Math.max(+a.bestStreakMs || 0, +b.bestStreakMs || 0),
      goalDays: goal.value,
      goalSetAt: goal.time,
      displayName: name.value || '',
      displayNameSetAt: name.time,
      avatarDataUrl: avatar.value || '',
      avatarSetAt: avatar.time,
      resetTypes: reset.value || {},
      resetTypesSetAt: reset.time,
      manualStreakStart: manual.value || 0,
      manualStreakStartSetAt: manual.time,
      checkins: mergeCheckins(a.checkins, b.checkins, removed.checkins),
      relapses: mergeById(a.relapses || [], b.relapses || [], removed.ids, discarded),
      urges: mergeById(a.urges || [], b.urges || [], removed.ids, discarded),
      reasons: mergeReasons(a.reasons, b.reasons, removed.reasons, discarded),
      removed: removed
    };
    return { state: state, discarded: discarded };
  }

  function sameState(a, b) { return stable(a) === stable(b); }

  function idsOf(list) {
    return (list || []).map(function (r) { return r.id; }).sort();
  }

  function bumpUnsynced(storage) {
    var n = +(storage.getItem('zenflow_unsynced') || 0) + 1;
    storage.setItem('zenflow_unsynced', String(n));
    return n;
  }
  function unsyncedCount(storage) { return +(storage.getItem('zenflow_unsynced') || 0); }
  function clearUnsynced(storage) { storage.setItem('zenflow_unsynced', '0'); }

  function logoutGate(count, syncOk) {
    if (!count) return 'proceed';
    if (syncOk) return 'proceed';
    return 'prompt';
  }

  function pruneConflicts(list, now) {
    var cutoff = (+now || Date.now()) - CONFLICT_MS;
    return (list || []).filter(function (row) { return row && (+row.at || 0) >= cutoff; });
  }

  /* 内存里的版本校验写入，用来测两台设备同时保存。 */
  function MemoryStore() {
    this.row = null;
    this.version = 0;
  }
  MemoryStore.prototype.read = function () {
    return { data: this.row ? JSON.parse(JSON.stringify(this.row)) : null, version: this.version };
  };
  MemoryStore.prototype.write = function (data, expected) {
    if (this.version !== expected) {
      var err = new Error('SYNC_CONFLICT');
      err.code = 'SYNC_CONFLICT';
      throw err;
    }
    this.row = JSON.parse(JSON.stringify(data));
    this.version += 1;
    return this.version;
  };

  function pushWithRetry(store, local, readVersion, mergeFn) {
    var expected = readVersion;
    var current = local;
    for (var i = 0; i < 5; i++) {
      try {
        var next = store.write(current, expected);
        return { ok: true, version: next, data: current, tries: i + 1 };
      } catch (e) {
        if (!e || e.code !== 'SYNC_CONFLICT') throw e;
        var remote = store.read();
        expected = remote.version;
        current = mergeFn(current, remote.data || {}).state;
      }
    }
    return { ok: false, data: current };
  }

  root.ZFMerge = {
    TOMB_MS: TOMB_MS,
    stable: stable,
    stamp: stamp,
    clampStamp: clampStamp,
    reasonOf: reasonOf,
    mergeRecords: mergeRecords,
    sameState: sameState,
    idsOf: idsOf,
    bumpUnsynced: bumpUnsynced,
    unsyncedCount: unsyncedCount,
    clearUnsynced: clearUnsynced,
    logoutGate: logoutGate,
    pruneConflicts: pruneConflicts,
    MemoryStore: MemoryStore,
    pushWithRetry: pushWithRetry
  };
})(typeof window !== 'undefined' ? window : global);
