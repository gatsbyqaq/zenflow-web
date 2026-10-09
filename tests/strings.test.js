/* node tests/strings.test.js */
var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var ctx = { console: console };
vm.runInNewContext(fs.readFileSync(require('path').join(__dirname, '..', 'strings.js'), 'utf8'), ctx);
var Z = ctx.ZFStrings;
assert.strictEqual(Z.locale, 'zh');
assert.strictEqual(Z.t('urge.button'), '我现在很想');
assert.strictEqual(Z.t('urge.round', { n: 2, total: 6 }), '第 2 / 6 轮');
assert.strictEqual(Z.t('urge.streakNow', { n: 1 }), '当前连续 1 天');
assert.strictEqual(Z.t('urge.streakNow', { n: 2 }), '当前连续 2 天');
assert.strictEqual(Z.t('urge.notResisted'), '没撑住');
assert.strictEqual(Z.t('urge.count'), '已撑过');
assert.strictEqual(Z.t('urge.reasonsTitle'), '理由');
assert.strictEqual(Z.t('urge.breathTitle'), '呼吸');
assert.strictEqual(Z.t('urge.reasonsEmpty'), '还没有理由。');
assert.strictEqual(Z.t('urge.addReason'), '去添加');
var streakEn = Z.table.en['urge.streakNow'];
assert.strictEqual(Z.render(streakEn, { n: 1 }, 'en'), 'Current streak: 1 day');
assert.strictEqual(Z.render(streakEn, { n: '1' }, 'en'), 'Current streak: 1 day');
assert.strictEqual(Z.render(streakEn, { n: 2 }, 'en'), 'Current streak: 2 days');
assert.strictEqual(Z.render(streakEn, { n: '1.5' }, 'en'), 'Current streak: 1.5 days');
assert.strictEqual(Z.render(streakEn, { n: 1 }, 'zh'), 'Current streak: 1 ');
assert.strictEqual(Z.table.en['urge.notResisted'], "I didn't make it this time");
assert.strictEqual(Z.table.en['urge.count'], 'Urges resisted');
assert.strictEqual(Z.table.en['urge.reasonsTitle'], 'Your reasons');
assert.strictEqual(Z.table.en['urge.breathTitle'], 'Take a breath');
assert.strictEqual(Z.table.en['urge.reasonsEmpty'], 'No reasons yet.');
assert.strictEqual(Z.table.en['urge.addReason'], 'Add a reason');
assert.strictEqual(Z.table.en['nav.checkin'], 'Check-in');
assert.strictEqual(Z.table.en['nav.log'], 'Log');
assert.strictEqual(Z.table.en['nav.stats'], 'Stats');
assert.strictEqual(Z.table.en['nav.settings'], 'Settings');
assert.strictEqual(Z.table.en['home.urges'], 'Urges resisted');
assert.strictEqual(Z.table.en['home.checkins'], 'Total days');
assert.strictEqual(Z.t('home.checkins'), '打卡天数');
assert.strictEqual(Z.render(Z.table.en['ring.unit'], { n: 1 }, 'en'), 'day');
assert.strictEqual(Z.render(Z.table.en['ring.unit'], { n: 0 }, 'en'), 'days');
assert.strictEqual(Z.render(Z.table.en['ring.unit'], { n: 12 }, 'en'), 'days');
assert.strictEqual(Z.t('ring.unit', { n: 12 }), '天');
var at = new Date(2026, 9, 7, 15, 29).getTime();
var earlier = new Date(2026, 8, 25, 15, 29).getTime();
assert.strictEqual(Z.formatWhen(at, 'zh', 'h12', at), '今天 下午3:29');
assert.strictEqual(Z.formatWhen(at, 'zh', 'h23', at), '今天 15:29');
assert.strictEqual(Z.formatWhen(at, 'en', 'h12', at), 'Today 3:29 PM');
assert.strictEqual(Z.formatWhen(at, 'en', 'h23', at), 'Today 15:29');
assert.strictEqual(Z.formatWhen(earlier, 'zh', 'h12', at), '9月25日 下午3:29');
assert.strictEqual(Z.formatWhen(earlier, 'zh', 'h23', at), '9月25日 15:29');
assert.strictEqual(Z.formatWhen(earlier, 'en', 'h12', at), 'Sep 25 3:29 PM');
assert.strictEqual(Z.formatWhen(earlier, 'en', 'h23', at), 'Sep 25 15:29');
assert.strictEqual(Z.table.en['urge.button'], "I'm having an urge");
assert.strictEqual(Z.table.en['urge.resisted'], 'I made it through');
assert.strictEqual(Z.table.en['stats.longest'], 'Longest streak');
assert.strictEqual(Z.table.en['stats.totalDays'], 'Total days');
assert.strictEqual(Z.t('record.save'), '保存');
assert.strictEqual(Z.t('record.form'), '记录');
assert.strictEqual(Z.t('record.delete'), '删除这条记录');
assert.strictEqual(Z.t('confirm.entryTitle'), '删除这条记录？');
assert.strictEqual(Z.t('mood.3'), '一般');
assert.strictEqual(Z.t('trigger.熬夜'), '熬夜');
assert.strictEqual(Z.table.en['record.form'], 'Log');
assert.strictEqual(Z.table.en['nav.log'], 'Log');
assert.strictEqual(Z.table.en['record.today'], 'Today');
assert.strictEqual(Z.table.en['record.delete'], 'Delete this entry');
assert.strictEqual(Z.t('confirm.entryStreak'), '会按剩下的记录重算天数。');
assert.strictEqual(Z.table.en['confirm.entryTitle'], 'Delete this entry?');
assert.strictEqual(Z.table.en['confirm.entryStreak'], 'Your streak will be recalculated from the remaining entries.');
assert.strictEqual(Z.table.en['mood.5'], 'Great');
assert.strictEqual(Z.table.en['mood.4'], 'Good');
assert.strictEqual(Z.table.en['mood.3'], 'Okay');
assert.strictEqual(Z.table.en['mood.2'], 'Low');
assert.strictEqual(Z.table.en['mood.1'], 'Struggling');
assert.strictEqual(Z.table.en['trigger.无聊'], 'Bored');
assert.strictEqual(Z.table.en['trigger.压力'], 'Stressed');
assert.strictEqual(Z.table.en['trigger.熬夜'], 'Up late');
assert.strictEqual(Z.table.en['trigger.独处'], 'Alone');
assert.strictEqual(Z.table.en['trigger.刷手机'], 'Scrolling');
assert.strictEqual(Z.table.en['trigger.情绪低落'], 'Feeling down');
assert.strictEqual(Z.table.en['trigger.其他'], 'Other');
assert.strictEqual(Z.t('day.timeline'), '时间线');
assert.strictEqual(Z.t('relapse.kept'), '已记录 · 天数不变');
assert.strictEqual(Z.t('time.today', { time: '15:10' }), '今天 15:10');
assert.strictEqual(Z.t('time.date', { m: 10, d: 5, time: '15:10' }), '10月5日 15:10');
assert.strictEqual(Z.table.en['record.save'], 'Save');
assert.strictEqual(Z.table.en['day.timeline'], 'Timeline');
assert.strictEqual(Z.table.en['relapse.kept'], 'Logged · Streak kept');
assert.strictEqual(Z.t('lock.title'), '应用锁');
assert.strictEqual(Z.t('lock.wrong'), '密码不对');
assert.strictEqual(Z.t('lock.wait', { n: 30 }), '请等 30 秒');
assert.strictEqual(Z.table.en['lock.title'], 'App lock');
assert.strictEqual(Z.table.en['lock.change'], 'Change passcode');
assert.strictEqual(Z.table.en['lock.forgotBody'].indexOf('Cloud data stays') > 0, true);
assert.strictEqual(Z.render(Z.table.en['lock.wait'], { n: 30 }, 'en'), 'Wait 30s');
assert.strictEqual(Z.render(Z.table.en['time.today'], { time: '15:10' }, 'en'), 'Today 15:10');
assert.strictEqual(Z.render(Z.table.en['time.date'], { month: 'Oct', d: 5, time: '15:10' }, 'en'), 'Oct 5 15:10');
var ariaSrc = ['index.html', 'app.js', 'admin.js', 'cloud.js', 'lock.js'].map(function (f) {
  return fs.readFileSync(require('path').join(__dirname, '..', f), 'utf8');
}).join('\n');
var ariaKeys = {};
var reA = /data-i18n-aria="([A-Za-z0-9_.]+)"/g;
var reB = /ariaAttr\(\s*'([A-Za-z0-9_.]+)'/g;
var ariaMatch;
while ((ariaMatch = reA.exec(ariaSrc))) ariaKeys[ariaMatch[1]] = true;
while ((ariaMatch = reB.exec(ariaSrc))) ariaKeys[ariaMatch[1]] = true;
var ariaList = Object.keys(ariaKeys).sort();
assert.ok(ariaList.length >= 15, 'aria keys ' + ariaList.join(','));
ariaList.forEach(function (k) {
  assert.ok(Object.prototype.hasOwnProperty.call(Z.table.zh, k), 'missing zh ' + k);
  assert.ok(Object.prototype.hasOwnProperty.call(Z.table.en, k), 'missing en ' + k);
  assert.notStrictEqual(String(Z.table.zh[k]).trim(), '');
  assert.notStrictEqual(String(Z.table.en[k]).trim(), '');
});
assert.strictEqual(Z.t('confirm.moodTitle'), '删除这天的心情？');
assert.strictEqual(Z.t('confirm.moodTitle').indexOf('打卡'), -1);
assert.strictEqual(Z.table.en['confirm.moodTitle'], 'Delete this day\'s mood?');
assert.strictEqual(Z.t('a11y.reset', { type: '看黄' }), '看黄：重置天数');
assert.strictEqual(Z.render(Z.table.en['a11y.reset'], { type: 'Porn' }, 'en'), 'Porn resets streak');
assert.strictEqual(Z.table.en['type.masturbation'], 'Masturbation');
assert.strictEqual(Z.table.en['type.porn'], 'Porn');
assert.strictEqual(Z.table.en['type.sex'], 'Sex');
assert.strictEqual(Z.table.en['type.fantasy'], 'Sexual fantasy');
assert.strictEqual(Z.table.en['type.dream'], 'Wet dream');
assert.strictEqual(Z.t('type.fantasy'), '意淫');
assert.strictEqual(Z.t('type.dream'), '梦淫');
var sep8 = new Date(2026, 8, 8);
assert.strictEqual(Z.calendarCellLabel(sep8, [], 'zh'), '9月8日，没有记录');
assert.strictEqual(Z.calendarCellLabel(sep8, [], 'en'), 'September 8, No entries');
assert.strictEqual(Z.calendarCellLabel(sep8, [{ kind: 'urge', ts: 1 }], 'zh'), '9月8日，抵御冲动 1 次');
assert.strictEqual(Z.calendarCellLabel(sep8, [{ kind: 'urge', ts: 1 }], 'en'), 'September 8, 1 urge resisted');
assert.strictEqual(Z.calendarCellLabel(sep8, [{ kind: 'urge', ts: 1 }, { kind: 'urge', ts: 2 }], 'zh'), '9月8日，抵御冲动 2 次');
assert.strictEqual(Z.calendarCellLabel(sep8, [{ kind: 'urge', ts: 2 }, { kind: 'urge', ts: 3 }], 'en'), 'September 8, 2 urges resisted');
assert.strictEqual(Z.calendarCellLabel(sep8, [
  { kind: 'relapse', ts: 1, types: ['porn'] },
  { kind: 'urge', ts: 2 },
  { kind: 'urge', ts: 3 }
], 'zh'), '9月8日，看黄，抵御冲动 2 次');
assert.strictEqual(Z.calendarCellLabel(sep8, [
  { kind: 'urge', ts: 3 },
  { kind: 'relapse', ts: 1, types: ['porn'] },
  { kind: 'urge', ts: 2 }
], 'en'), 'September 8, Porn, 2 urges resisted');
assert.strictEqual(Z.calendarCellLabel(sep8, [
  { kind: 'relapse', ts: 3, types: ['porn', 'fantasy'] },
  { kind: 'urge', ts: 2 },
  { kind: 'relapse', ts: 1, types: ['masturbation'] }
], 'zh'), '9月8日，自慰，抵御冲动 1 次，看黄，意淫');
assert.strictEqual(Z.calendarCellLabel(sep8, [
  { kind: 'relapse', ts: 1, types: ['masturbation'] },
  { kind: 'urge', ts: 2 },
  { kind: 'relapse', ts: 3, types: ['porn', 'fantasy'] }
], 'en'), 'September 8, Masturbation, 1 urge resisted, Porn, Sexual fantasy');
assert.strictEqual(Z.calendarCellLabel(sep8, [
  { kind: 'checkin', ts: 1, mood: 5 }
], 'zh'), '9月8日，没有记录');
var stringsSrc = fs.readFileSync(require('path').join(__dirname, '..', 'strings.js'), 'utf8');
assert.strictEqual(stringsSrc.indexOf('TODO'), -1);
assert.strictEqual(stringsSrc.indexOf('cal.cell'), -1);
Object.keys(Z.table.zh).forEach(function (k) {
  assert.ok(Object.prototype.hasOwnProperty.call(Z.table.en, k), 'missing en ' + k);
});
['fail', 'shame', 'relapse', 'broke'].forEach(function (word) {
  Object.keys(Z.table.en).forEach(function (k) {
    assert.strictEqual(String(Z.table.en[k]).toLowerCase().indexOf(word), -1, k + ' has ' + word);
  });
});
console.log('strings tests ok');