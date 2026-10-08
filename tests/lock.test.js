/* node tests/lock.test.js */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

function mem() {
  var store = {};
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; },
    dump: function () { return store; }
  };
}
var local = mem();
var session = mem();
var ctx = {
  localStorage: local,
  sessionStorage: session,
  crypto: globalThis.crypto,
  TextEncoder: TextEncoder,
  btoa: function (s) { return Buffer.from(s, 'binary').toString('base64'); },
  atob: function (s) { return Buffer.from(s, 'base64').toString('binary'); },
  console: console
};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'lock.js'), 'utf8'), ctx);
var L = ctx.ZFLock;

assert.strictEqual(L.enabled(), false);
assert.strictEqual(L.graceMs('now'), 0);
assert.strictEqual(L.graceMs('1m'), 60000);
assert.strictEqual(L.graceMs('5m'), 300000);
assert.strictEqual(L.graceMs('nope'), 60000);

L.setPasscode('1357', '1m').then(function () {
  assert.strictEqual(L.enabled(), true);
  assert.strictEqual(L.grace(), '1m');
  var raw = local.dump()[L.KEY];
  var rec = JSON.parse(raw);
  assert.strictEqual(rec.code, undefined);
  assert.notStrictEqual(rec.hash, '1357');
  assert.notStrictEqual(rec.salt, '1357');
  assert.strictEqual(rec.v, 1);
  assert.ok(rec.salt && rec.salt.length > 8);
  assert.ok(rec.hash && rec.hash.length > 8);
  assert.strictEqual(rec.iter, L.ITER);
  return L.verify('1357');
}).then(function (ok) {
  assert.strictEqual(ok, true);
  return L.verify('0000');
}).then(function (ok) {
  assert.strictEqual(ok, false);
  var first = L.read().hash;
  return L.setPasscode('2468', '5m').then(function () {
    assert.notStrictEqual(L.read().hash, first);
    assert.strictEqual(L.grace(), '5m');
    assert.strictEqual(L.setGrace('now'), true);
    assert.strictEqual(L.grace(), 'now');
    assert.strictEqual(L.graceMs(), 0);
    return L.verify('2468');
  });
}).then(function (ok) {
  assert.strictEqual(ok, true);
  return L.verify('1357');
}).then(function (ok) {
  assert.strictEqual(ok, false);
  L.clearFails();
  for (var i = 1; i <= 4; i++) {
    var r = L.noteFail();
    assert.strictEqual(r.locked, false);
    assert.strictEqual(r.n, i);
  }
  var locked = L.noteFail();
  assert.strictEqual(locked.locked, true);
  assert.ok(locked.wait >= 30000);
  var again = L.noteFail();
  assert.strictEqual(again.locked, true);
  assert.ok(L.waitRemaining() > 0);
  L.clear();
  assert.strictEqual(L.enabled(), false);
  assert.strictEqual(local.dump()[L.KEY], undefined);
  assert.strictEqual(L.waitRemaining(), 0);
  console.log('lock tests ok');
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});
