/* ZenFlow · 应用锁。只存在这台设备，不进云同步。
 * 密码是 PBKDF2 加盐哈希，localStorage 里没有明文。
 */
(function (root) {
  'use strict';
  var KEY = 'zenflow_lock';
  var GUARD = 'zenflow_lock_guard';
  var ITER = 120000;
  var MAX_FAILS = 5;
  var WAIT_MS = 30000;
  var GRACES = { now: 0, '1m': 60000, '5m': 300000 };

  function ls() { return root.localStorage; }
  function ss() { return root.sessionStorage; }

  function b64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return root.btoa(s);
  }
  function fromB64(s) {
    var bin = root.atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function eq(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var d = 0;
    for (var i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
  }
  function validCode(code) { return /^\d{4}$/.test(String(code || '')); }
  function validGrace(g) { return g === 'now' || g === '1m' || g === '5m'; }

  function read() {
    try {
      var o = JSON.parse(ls().getItem(KEY) || '');
      if (!o || o.v !== 1 || typeof o.salt !== 'string' || typeof o.hash !== 'string') return null;
      if (!validGrace(o.grace)) o.grace = '1m';
      var iter = +o.iter;
      o.iter = (iter >= 10000 && iter <= 2000000) ? iter : ITER;
      return o;
    } catch (e) { return null; }
  }
  function write(rec) {
    ls().setItem(KEY, JSON.stringify({
      v: 1,
      salt: rec.salt,
      hash: rec.hash,
      iter: rec.iter,
      grace: validGrace(rec.grace) ? rec.grace : '1m'
    }));
  }
  function enabled() { return !!read(); }
  function grace() {
    var rec = read();
    return rec ? rec.grace : '1m';
  }
  function graceMs(g) {
    if (g == null) g = grace();
    return Object.prototype.hasOwnProperty.call(GRACES, g) ? GRACES[g] : GRACES['1m'];
  }

  function hashCode(code, salt, iter) {
    var subtle = root.crypto && root.crypto.subtle;
    if (!subtle) return Promise.reject(new Error('no webcrypto'));
    return subtle.importKey('raw', new TextEncoder().encode(String(code)), 'PBKDF2', false, ['deriveBits']).then(function (key) {
      return subtle.deriveBits({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, key, 256);
    }).then(function (bits) { return new Uint8Array(bits); });
  }

  function setPasscode(code, g) {
    if (!validCode(code)) return Promise.reject(new Error('code'));
    var salt = root.crypto.getRandomValues(new Uint8Array(16));
    var nextGrace = validGrace(g) ? g : (grace() || '1m');
    return hashCode(code, salt, ITER).then(function (hash) {
      write({ salt: b64(salt), hash: b64(hash), iter: ITER, grace: nextGrace });
      clearFails();
    });
  }
  function setGrace(g) {
    var rec = read();
    if (!rec || !validGrace(g)) return false;
    rec.grace = g;
    write(rec);
    return true;
  }
  function verify(code) {
    var rec = read();
    if (!rec || !validCode(code)) return Promise.resolve(false);
    var salt, expect;
    try { salt = fromB64(rec.salt); expect = fromB64(rec.hash); }
    catch (e) { return Promise.resolve(false); }
    return hashCode(code, salt, rec.iter).then(function (hash) { return eq(hash, expect); }, function () { return false; });
  }
  function clear() {
    try { ls().removeItem(KEY); } catch (e) {}
    clearFails();
  }

  function guard() {
    try { return JSON.parse(ss().getItem(GUARD) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveGuard(g) {
    try { ss().setItem(GUARD, JSON.stringify(g)); } catch (e) {}
  }
  function clearFails() {
    try { ss().removeItem(GUARD); } catch (e) {}
  }
  function waitRemaining() {
    var g = guard();
    if (!g.until) return 0;
    var left = g.until - Date.now();
    if (left <= 0) { clearFails(); return 0; }
    return left;
  }
  function noteFail() {
    if (waitRemaining() > 0) return { n: 0, wait: waitRemaining(), locked: true };
    var g = guard();
    var n = (g.n || 0) + 1;
    if (n >= MAX_FAILS) {
      var until = Date.now() + WAIT_MS;
      saveGuard({ n: 0, until: until });
      return { n: n, wait: WAIT_MS, locked: true };
    }
    saveGuard({ n: n });
    return { n: n, wait: 0, locked: false };
  }

  root.ZFLock = {
    KEY: KEY,
    ITER: ITER,
    MAX_FAILS: MAX_FAILS,
    WAIT_MS: WAIT_MS,
    enabled: enabled,
    read: read,
    grace: grace,
    graceMs: graceMs,
    setPasscode: setPasscode,
    setGrace: setGrace,
    verify: verify,
    clear: clear,
    noteFail: noteFail,
    clearFails: clearFails,
    waitRemaining: waitRemaining,
    validCode: validCode
  };
})(typeof window !== 'undefined' ? window : globalThis);
