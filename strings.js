/* ZenFlow · 新文案表。界面固定用 zh；en 先存着，还不能切换。
 * 只放这一轮新增的句子，旧文案仍写在页面里。
 */
(function (root) {
  'use strict';
  var LOCALE = 'zh';
  var STRINGS = {
    zh: {
      'urge.button': '我现在很想',
      'urge.resisted': '撑过去了',
      'urge.notResisted': '没撑住',
      'urge.breathTitle': '呼吸',
      'urge.skip': '跳过',
      'urge.inhale': '吸气',
      'urge.exhale': '呼气',
      'urge.breathHint': '跟着圆圈',
      'urge.round': '第 {n} / {total} 轮',
      'urge.streakNow': '当前连续 {n} 天',
      'urge.reasonsTitle': '理由',
      'urge.reasonsEmpty': '还没有理由',
      'urge.logged': '已记下',
      'urge.count': '已撑过',
      'stats.longest': '最长连续',
      'stats.totalDays': '累计坚持天数',
      'stats.dayUnit': '天'
    },
    en: {
      'urge.button': "I'm having an urge",
      'urge.resisted': 'I made it through',
      'urge.notResisted': 'Record what happened',
      'urge.breathTitle': 'Breathing',
      'urge.skip': 'Skip',
      'urge.inhale': 'Breathe in',
      'urge.exhale': 'Breathe out',
      'urge.breathHint': 'Follow the circle',
      'urge.round': 'Round {n} of {total}',
      'urge.streakNow': 'Current streak: {n} days',
      'urge.reasonsTitle': 'Reasons',
      'urge.reasonsEmpty': 'No reasons yet',
      'urge.logged': 'Saved',
      'urge.count': 'Got through',
      'stats.longest': 'Longest streak',
      'stats.totalDays': 'Total days',
      'stats.dayUnit': ''
    }
  };

  function t(key, vars) {
    var pack = STRINGS[LOCALE] || STRINGS.zh;
    var s = Object.prototype.hasOwnProperty.call(pack, key) ? pack[key] : key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return s;
  }

  root.ZFStrings = { t: t, locale: LOCALE, table: STRINGS };
})(typeof window !== 'undefined' ? window : globalThis);
