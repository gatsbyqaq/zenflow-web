/* node tests/phone.test.js */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', 'cloud.js'), 'utf8');

function extract(name) {
  var key = 'function ' + name + '(';
  var start = src.indexOf(key);
  if (start < 0) throw new Error('missing ' + name);
  var i = src.indexOf('{', start);
  var depth = 0;
  for (var j = i; j < src.length; j++) {
    var ch = src.charAt(j);
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

var bundle = ['normalizePhone', 'localLooksEmpty', 'chooseSync', 'appDataKey', 'errText', 'cn'].map(extract).join('\n');
var ctx = new Function(bundle + '\nreturn { normalizePhone: normalizePhone, localLooksEmpty: localLooksEmpty, chooseSync: chooseSync, appDataKey: appDataKey, errText: errText, cn: cn };')();

var n = ctx.normalizePhone;
assert.deepStrictEqual(n('86', '13800138000'), { ok: true, e164: '+8613800138000' });
assert.deepStrictEqual(n('86', '138 0013 8000'), { ok: true, e164: '+8613800138000' });
assert.deepStrictEqual(n('86', '+8613800138000'), { ok: true, e164: '+8613800138000' });
assert.deepStrictEqual(n('86', '8613800138000'), { ok: true, e164: '+8613800138000' });
assert.strictEqual(n('86', '12345').ok, false);
assert.strictEqual(n('86', '').error, '请输入手机号');
assert.deepStrictEqual(n('1', '2025550143'), { ok: true, e164: '+12025550143' });
assert.deepStrictEqual(n('other', '+447911123456') && n('', '+447911123456'), { ok: true, e164: '+447911123456' });
assert.strictEqual(n('86', '+1').ok, false);

var empty = { checkins: {}, relapses: [], urges: [], reasons: [], displayName: '', avatarDataUrl: '', goalSetAt: 0, resetTypesSetAt: 0, manualStreakStartSetAt: 0, bestStreakMs: 0, removed: { ids: {}, reasons: {}, checkins: {} } };
var filled = { checkins: { '2026-01-01': { mood: 3 } }, relapses: [], urges: [], reasons: [], goalSetAt: 0, resetTypesSetAt: 0, manualStreakStartSetAt: 0, bestStreakMs: 0, removed: {} };
assert.strictEqual(ctx.localLooksEmpty(empty), true);
assert.strictEqual(ctx.localLooksEmpty(filled), false);
assert.strictEqual(ctx.chooseSync(empty, { streakStart: 1 }, null, 'u', true, false), 'remote');
assert.strictEqual(ctx.chooseSync(empty, { streakStart: 1 }, null, 'u', false, false), 'remote');
assert.strictEqual(ctx.chooseSync(filled, { streakStart: 1 }, null, 'u', false, false), 'merge');
assert.strictEqual(ctx.chooseSync(filled, { streakStart: 1 }, 'old', 'u', false, false), 'remote');
assert.strictEqual(ctx.chooseSync(filled, null, 'old', 'u', false, false), 'local');
assert.strictEqual(ctx.chooseSync(empty, null, null, 'u', true, false), 'local');
assert.strictEqual(ctx.chooseSync(filled, { streakStart: 1 }, 'u', 'u', false, true), 'local');

assert.strictEqual(ctx.appDataKey('zenflow_v1', 'ordgebjytixmbwabpsrj'), true);
assert.strictEqual(ctx.appDataKey('zenflow_theme', 'x'), true);
assert.strictEqual(ctx.appDataKey('zenflow_auth', 'x'), true);
assert.strictEqual(ctx.appDataKey('zenflow_cloud_uid', 'x'), true);
assert.strictEqual(ctx.appDataKey('zenflow_pull_remote', 'x'), false);
assert.strictEqual(ctx.appDataKey('zenflow_supabase_override', 'x'), false);
assert.strictEqual(ctx.appDataKey('sb-ordgebjytixmbwabpsrj-auth-token', 'ordgebjytixmbwabpsrj'), true);
assert.strictEqual(ctx.appDataKey('sb-other-auth-token', 'ordgebjytixmbwabpsrj'), false);
assert.strictEqual(ctx.appDataKey('unrelated', 'ordgebjytixmbwabpsrj'), false);

assert.strictEqual(ctx.cn({ message: 'SMS provider is not configured' }), '短信服务未配置');
assert.strictEqual(ctx.cn({ message: 'Error sending confirmation SMS: missing provider', code: 'sms_send_failed' }), '短信服务未配置');
assert.strictEqual(ctx.cn({ message: 'Token has expired or is invalid', code: 'otp_expired' }), '验证码错误或已过期');
assert.strictEqual(ctx.cn({ message: 'For security purposes, you can only request this after 60 seconds.', code: 'over_sms_send_rate_limit' }), '操作太频繁');
assert.strictEqual(ctx.cn({ message: 'Invalid phone number' }), '手机号不正确');
assert.strictEqual(ctx.cn({ message: 'captcha protection: request disallowed (no captcha_token found)' }), '请完成验证');

console.log('phone.test.js ok');
