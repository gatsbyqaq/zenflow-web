/* node tests/sync-merge.test.js */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var code = fs.readFileSync(path.join(__dirname, '..', 'sync-merge.js'), 'utf8');
global.window = global;
vm.runInThisContext(code);
var M = global.ZFMerge;

function rec(id, ts, note, updatedAt) {
  return { id: id, ts: ts, note: note || '', updatedAt: updatedAt == null ? ts : updatedAt, types: ['porn'], triggers: [], other: '', streakMs: 0 };
}
function base(extra) {
  var s = {
    version: 1, createdAt: 1, streakStart: 1, streakStartSetAt: 1, bestStreakMs: 0,
    goalDays: 30, goalSetAt: 1, displayName: '', displayNameSetAt: 0,
    avatarDataUrl: '', avatarSetAt: 0, resetTypes: { masturbation: true }, resetTypesSetAt: 1,
    manualStreakStart: 0, manualStreakStartSetAt: 0,
    checkins: {}, relapses: [], urges: [], reasons: [],
    removed: { ids: {}, reasons: {}, checkins: {} }
  };
  Object.keys(extra || {}).forEach(function (k) { s[k] = extra[k]; });
  return s;
}

var now = Date.now();
function at(n) { return now - 100000 + n; }

/* S1 并发：两台同时读到同一版本，各自新增一条再写 */
var store = new M.MemoryStore();
var empty = base();
store.write(empty, 0);
var readA = store.read();
var readB = store.read();
var a1 = base({ relapses: [rec('r1', at(10), 'a', at(10))] });
var b1 = base({ relapses: [rec('r2', at(11), 'b', at(11))] });
var wa = M.pushWithRetry(store, a1, readA.version, function (local, remote) { return M.mergeRecords(local, remote, now); });
assert.strictEqual(wa.ok, true);
var wb = M.pushWithRetry(store, b1, readB.version, function (local, remote) { return M.mergeRecords(local, remote, now); });
assert.strictEqual(wb.ok, true);
assert.deepStrictEqual(M.idsOf(store.read().data.relapses), ['r1', 'r2']);

/* S2 离线再合并 */
var off = M.mergeRecords(base({ relapses: [rec('r1', at(10), '', at(10))] }), base({ relapses: [rec('r2', at(12), '', at(12))] }), now);
assert.deepStrictEqual(M.idsOf(off.state.relapses), ['r1', 'r2']);

/* S3 后写的备注胜出，旧版进冲突备份 */
var s3 = M.mergeRecords(
  base({ relapses: [rec('r1', at(10), 'from-a', at(10))] }),
  base({ relapses: [rec('r1', at(10), 'from-b', at(20))] }),
  now
);
assert.strictEqual(s3.state.relapses[0].note, 'from-b');
assert.strictEqual(s3.discarded.length, 1);
assert.strictEqual(s3.discarded[0].discarded.note, 'from-a');

/* S4 删除之后的编辑保留 */
var s4 = M.mergeRecords(
  base({ relapses: [rec('r1', at(10), 'old', at(10))], removed: { ids: { r1: at(10) }, reasons: {}, checkins: {} } }),
  base({ relapses: [rec('r1', at(10), 'edited', at(20))] }),
  now
);
assert.strictEqual(s4.state.relapses.length, 1);
assert.strictEqual(s4.state.relapses[0].note, 'edited');

/* S5 更晚的删除胜出 */
var s5 = M.mergeRecords(
  base({ relapses: [rec('r1', at(10), 'edited', at(10))] }),
  base({ relapses: [rec('r1', at(5), 'old', at(5))], removed: { ids: { r1: at(20) }, reasons: {}, checkins: {} } }),
  now
);
assert.strictEqual(s5.state.relapses.length, 0);

/* S6 时间相等则保留 */
var s6 = M.mergeRecords(
  base({ relapses: [rec('r1', at(10), 'same', at(10))], removed: { ids: { r1: at(10) }, reasons: {}, checkins: {} } }),
  base({ relapses: [rec('r1', at(10), 'same', at(10))] }),
  now
);
assert.strictEqual(s6.state.relapses.length, 1);

/* S7 超前时钟被截到服务器时间，随后的正常编辑胜出 */
var server = 100000;
var aStamp = M.clampStamp(server + 60 * 60 * 1000, server);
var bStamp = server + 500;
assert.strictEqual(aStamp, server);
var s7 = M.mergeRecords(
  base({ relapses: [rec('r1', 10, 'fast-clock', aStamp)] }),
  base({ relapses: [rec('r1', 10, 'later', bStamp)] }),
  now
);
assert.strictEqual(s7.state.relapses[0].note, 'later');

/* S8 可交换、幂等 */
var left = base({ relapses: [rec('r1', at(10), 'a', at(10)), rec('r2', at(12), 'b', at(30))], reasons: [{ id: '甲', text: '甲', updatedAt: at(5) }] });
var right = base({ relapses: [rec('r2', at(12), 'c', at(20)), rec('r3', at(14), 'd', at(14))], goalDays: 60, goalSetAt: at(9) });
var ab = M.mergeRecords(left, right, now);
var ba = M.mergeRecords(right, left, now);
var aa = M.mergeRecords(left, left, now);
assert.ok(M.sameState(ab.state, ba.state));
assert.ok(M.sameState(aa.state, M.mergeRecords(left, left, now).state));
assert.ok(M.sameState(M.mergeRecords(aa.state, aa.state, now).state, aa.state));

/* S9 未同步计数在刷新后还在 */
var mem = { bag: {}, getItem: function (k) { return this.bag[k] || null; }, setItem: function (k, v) { this.bag[k] = String(v); } };
assert.strictEqual(M.bumpUnsynced(mem), 1);
assert.strictEqual(M.bumpUnsynced(mem), 2);
assert.strictEqual(M.bumpUnsynced(mem), 3);
var mem2 = { bag: { zenflow_unsynced: mem.bag.zenflow_unsynced }, getItem: mem.getItem, setItem: mem.setItem };
assert.strictEqual(M.unsyncedCount(mem2), 3);
M.clearUnsynced(mem2);
assert.strictEqual(M.unsyncedCount(mem2), 0);

/* S10 未同步且同步失败时必须提示 */
assert.strictEqual(M.logoutGate(0, false), 'proceed');
assert.strictEqual(M.logoutGate(3, true), 'proceed');
assert.strictEqual(M.logoutGate(3, false), 'prompt');

/* S11 云端空着时保留本机 */
var s11 = M.mergeRecords(base({ relapses: [rec('r1', at(10), 'local', at(10))] }), base(), now);
assert.strictEqual(s11.state.relapses[0].id, 'r1');

/* S12 超过 5000 条近期墓碑也不会让记录复活 */
var tombs = {};
for (var i = 0; i < 5001; i++) tombs['id' + i] = at(500);
var many = M.mergeRecords(
  base({ relapses: [rec('id5000', at(10), '', at(10))], removed: { ids: tombs, reasons: {}, checkins: {} } }),
  base(),
  now
);
assert.ok(!many.state.relapses.some(function (r) { return r.id === 'id5000'; }));
assert.ok(Object.keys(many.state.removed.ids).length > 5000);

/* S13 理由按时间和 id 合并，不重复 */
var s13 = M.mergeRecords(
  base({ reasons: [{ id: '甲', text: '理由甲', updatedAt: at(10) }], removed: { ids: {}, reasons: { '甲': at(10) }, checkins: {} } }),
  base({ reasons: [{ id: '甲', text: '理由甲改', updatedAt: at(20) }] }),
  now
);
assert.strictEqual(s13.state.reasons.length, 1);
assert.strictEqual(s13.state.reasons[0].text, '理由甲改');
var s13b = M.mergeRecords(
  base({ reasons: [{ id: '甲', text: '理由甲改', updatedAt: at(10) }] }),
  base({ reasons: [{ id: '甲', text: '理由甲', updatedAt: at(5) }], removed: { ids: {}, reasons: { '甲': at(20) }, checkins: {} } }),
  now
);
assert.strictEqual(s13b.state.reasons.length, 0);

/* S14 旧记录没有 updatedAt 时用 editedAt，再没有则用 ts */
assert.strictEqual(M.stamp({ editedAt: 40, ts: 10 }), 40);
assert.strictEqual(M.stamp({ ts: 10 }), 10);
var s14 = M.mergeRecords(
  base({ relapses: [{ id: 'old', ts: at(10), editedAt: at(15), note: 'legacy', types: [] }] }),
  base({ relapses: [rec('old', at(10), 'new', at(12))] }),
  now
);
assert.strictEqual(s14.state.relapses[0].note, 'legacy');

/* 过期墓碑不再挡住记录 */
var oldTomb = now - M.TOMB_MS - 10;
var revived = M.mergeRecords(
  base({ relapses: [rec('old', 10, 'back', 10)], removed: { ids: { old: oldTomb }, reasons: {}, checkins: {} } }),
  base(),
  now
);
assert.strictEqual(revived.state.relapses.length, 1);
assert.ok(!revived.state.removed.ids.old);

console.log('sync-merge: 14 cases ok');
