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
      'stats.dayUnit': '天',
      'time.today': '今天 {time}',
      'time.yesterday': '昨天 {time}',
      'time.date': '{m}月{d}日 {time}',
      'record.save': '保存',
      'day.timeline': '时间线',
      'relapse.kept': '已记录 · 天数不变'
    },
    en: {
      'urge.button': "I'm having an urge",
      'urge.resisted': 'I made it through',
      'urge.notResisted': "I didn't make it this time",
      'urge.breathTitle': 'Take a breath',
      'urge.skip': 'Skip',
      'urge.inhale': 'Breathe in',
      'urge.exhale': 'Breathe out',
      'urge.breathHint': 'Follow the circle',
      'urge.round': 'Round {n} of {total}',
      'urge.streakNow': 'Current streak: {n} {n, plural, one {day} other {days}}',
      'urge.reasonsTitle': 'Your reasons',
      'urge.reasonsEmpty': 'No reasons yet. Add one in Settings.',
      'urge.logged': 'Saved',
      'urge.count': 'Urges resisted',
      'stats.longest': 'Longest streak',
      'stats.totalDays': 'Total days',
      'stats.dayUnit': '',
      'time.today': 'Today {time}',
      'time.yesterday': 'Yesterday {time}',
      'time.date': '{month} {d} {time}',
      'record.save': 'Save',
      'day.timeline': 'Timeline',
      'relapse.kept': 'Logged · Streak kept'
    }
  };

  function readBalanced(s, open) {
    var depth = 0;
    for (var i = open; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return { text: s.slice(open + 1, i), end: i + 1 };
      }
    }
    return null;
  }

  /* {name, plural, one {…} other {…}}。zh 没有词形变化，这种标记直接丢掉。 */
  function pluralAt(s, start) {
    if (s.charAt(start) !== '{') return null;
    var head = /^([A-Za-z_][\w]*)\s*,\s*plural\s*,\s*one\s*\{/.exec(s.slice(start + 1));
    if (!head) return null;
    var one = readBalanced(s, start + 1 + head[0].length - 1);
    if (!one) return null;
    var mid = /^\s*other\s*\{/.exec(s.slice(one.end));
    if (!mid) return null;
    var other = readBalanced(s, one.end + mid[0].length - 1);
    if (!other || s.charAt(other.end) !== '}') return null;
    return { name: head[1], one: one.text, other: other.text, end: other.end + 1 };
  }

  function applyPlurals(s, vars, ignore) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var block = s.charAt(i) === '{' ? pluralAt(s, i) : null;
      if (!block) { out += s.charAt(i); continue; }
      if (!ignore) {
        var n = vars ? vars[block.name] : undefined;
        out += Number(n) === 1 ? block.one : block.other;
      }
      i = block.end - 1;
    }
    return out;
  }

  function render(template, vars, locale) {
    var s = applyPlurals(String(template), vars, locale === 'zh');
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return s;
  }

  function t(key, vars) {
    var pack = STRINGS[LOCALE] || STRINGS.zh;
    var s = Object.prototype.hasOwnProperty.call(pack, key) ? pack[key] : key;
    return render(s, vars, LOCALE);
  }

  root.ZFStrings = { t: t, locale: LOCALE, table: STRINGS, render: render };
})(typeof window !== 'undefined' ? window : globalThis);
