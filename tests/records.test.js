/* node tests/records.test.js */
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var ctx = { console: console };
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '..', 'records.js'), 'utf8'), ctx);
var R = ctx.ZFRecords;

function kinds(marks) { return marks.map(function (m) { return m.kind + (m.type ? ':' + m.type : ''); }).join(','); }

assert.strictEqual(kinds(R.dayMarkers(['porn', 'masturbation', 'sex'], false)), 'dot:porn,dot:masturbation,dot:sex');
assert.strictEqual(kinds(R.dayMarkers(['porn', 'masturbation', 'sex', 'dream'], false)), 'dot:porn,dot:masturbation,dot:sex');
assert.strictEqual(kinds(R.dayMarkers(['porn', 'masturbation', 'sex'], true)), 'dot:porn,dot:masturbation,ring');
assert.strictEqual(kinds(R.dayMarkers(['porn'], true)), 'dot:porn,ring');
assert.strictEqual(kinds(R.dayMarkers([], true)), 'ring');
assert.strictEqual(kinds(R.dayMarkers(['porn', 'porn', 'sex'], false)), 'dot:porn,dot:sex');
assert.strictEqual(R.dayMarkers(['a', 'b', 'c', 'd'], true).length, 3);
assert.strictEqual(R.dayMarkers(['a', 'b', 'c'], true)[2].kind, 'ring');
assert.ok(R.dayMarkers(['a', 'b', 'c', 'd'], false).every(function (m) { return m.kind === 'dot'; }));

assert.strictEqual(R.dayNumberState({ future: true, mood: true, today: true }), 'future');
assert.strictEqual(R.dayNumberState({ today: true, selected: true, mood: false }), 'today');
assert.strictEqual(R.dayNumberState({ today: true, mood: true }), 'today');
assert.strictEqual(R.dayNumberState({ selected: true, mood: true }), 'selected');
assert.strictEqual(R.dayNumberState({ selected: true, mood: false }), 'selected');
assert.strictEqual(R.dayNumberState({ mood: false }), 'nomood');
assert.strictEqual(R.dayNumberState({ mood: true }), 'checked');
assert.strictEqual(R.dayNumberState({}), 'nomood');

var oct = new Date(2026, 9, 8);
assert.strictEqual(R.monthTitle(oct, 'zh'), '2026年10月');
assert.strictEqual(R.monthTitle(oct, 'en'), 'October 2026');
assert.strictEqual(R.dayTitle(oct, 'zh'), '10月8日 周四');
assert.strictEqual(R.dayTitle(oct, 'en'), 'Thursday, October 8');
assert.strictEqual(R.monthDay(oct, 'zh'), '10月8日');
assert.strictEqual(R.monthDay(new Date(2026, 8, 8), 'en'), 'September 8');

console.log('records tests ok');
