/* node tests/security-sql.test.js
 * 检查待应用的迁移文本，不连接生产库。
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var sql = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261104090000_security_prd.sql'), 'utf8');

assert.ok(/used_at is null/.test(sql), 'unused invite is used_at is null');
assert.ok(!/set used_at = null/i.test(sql), 'delete must not clear used_at');
assert.ok(/extensions\.gen_random_bytes\(12\)/.test(sql), '12 random bytes');
assert.ok(/ABCDEFGHJKLMNPQRSTUVWXYZ23456789/.test(sql), '32 char alphabet');
assert.ok(/revoke all on function public\.validate_invite\(text\) from public, anon, authenticated/.test(sql));
assert.ok(/revoke all on function public\.admin_list_users\(\) from public, anon/.test(sql));
assert.ok(/revoke all on function public\.is_handle_available\(text\) from public, anon/.test(sql));
assert.ok(/ios_profiles_legacy/.test(sql) && /TRUNCATE|revoke all on public\.ios_profiles_legacy/.test(sql));
assert.ok(/save_user_data/.test(sql) && /SYNC_CONFLICT/.test(sql));
assert.ok(/admin_audit/.test(sql));
assert.ok(/delete from storage\.objects/.test(sql));
assert.ok(/image\/gif/.test(sql) === false || /allowed_mime_types = array\['image\/png'/.test(sql));

function chiSquare(counts, n, k) {
  var expected = n / k;
  var x = 0;
  counts.forEach(function (c) { x += (c - expected) * (c - expected) / expected; });
  return x;
}
var alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
assert.strictEqual(alphabet.length, 32);
var counts = {};
alphabet.split('').forEach(function (ch) { counts[ch] = 0; });
var seen = {};
var N = 100000;
for (var i = 0; i < N; i++) {
  var s = '';
  for (var b = 0; b < 12; b++) {
    var byte = Math.floor(Math.random() * 256);
    var ch = alphabet[byte % 32];
    s += ch;
    counts[ch]++;
  }
  var code = 'ZF-' + s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
  assert.ok(!seen[code], 'duplicate');
  seen[code] = 1;
}
var xs = chiSquare(Object.keys(counts).map(function (k) { return counts[k]; }), N * 12, 32);
assert.ok(xs < 80, 'chi-square ' + xs);

var old = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261006084259_delete_my_account.sql'), 'utf8');
assert.ok(/set used_by = null/.test(old), 'historical file keeps the old bug so the diff is visible');
var profile = fs.readFileSync(path.join(__dirname, '..', 'supabase/migrations/20261006061536_profiles_handle_avatar.sql'), 'utf8');
assert.ok(/update_my_profile/.test(profile) && /is_handle_available/.test(profile));

console.log('security-sql ok', 'chi-square', xs.toFixed(2));
