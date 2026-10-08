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
      'urge.reasonsEmpty': '还没有理由。',
      'urge.addReason': '去添加',
      'urge.logged': '已记下',
      'urge.count': '已撑过',
      'nav.checkin': '打卡',
      'nav.log': '记录',
      'nav.stats': '统计',
      'nav.settings': '设置',
      'home.urges': '抵御冲动',
      'home.checkins': '打卡天数',
      'ring.unit': '天',
      'stats.longest': '最长连续',
      'stats.totalDays': '累计坚持天数',
      'stats.dayUnit': '天',
      'time.today': '今天 {time}',
      'time.yesterday': '昨天 {time}',
      'time.date': '{m}月{d}日 {time}',
      'record.save': '保存',
      'record.form': '记录',
      'record.edit': '编辑',
      'record.today': '今天',
      'record.date': '日期',
      'record.time': '时间',
      'record.behavior': '行为',
      'record.mood': '心情',
      'record.triggers': '触发因素',
      'record.note': '备注',
      'record.other': '其他',
      'record.delete': '删除这条记录',
      'record.moodRow': '心情 · {name}',
      'confirm.entryTitle': '删除这条记录？',
      'confirm.entryBody': '删除后不能恢复。',
      'confirm.entryStreak': '会按剩下的记录重算天数。',
      'mood.5': '很好',
      'mood.4': '不错',
      'mood.3': '一般',
      'mood.2': '低落',
      'mood.1': '挣扎',
      'trigger.无聊': '无聊',
      'trigger.压力': '压力',
      'trigger.熬夜': '熬夜',
      'trigger.独处': '独处',
      'trigger.刷手机': '刷手机',
      'trigger.情绪低落': '情绪低落',
      'trigger.其他': '其他',
      'day.timeline': '时间线',
      'relapse.kept': '已记录 · 天数不变',
      'lock.section': '隐私与安全',
      'lock.title': '应用锁',
      'lock.off': '关闭',
      'lock.graceNow': '立即锁定',
      'lock.grace1': '离开 1 分钟后锁定',
      'lock.grace5': '离开 5 分钟后锁定',
      'lock.change': '修改密码',
      'lock.when': '锁定时机',
      'lock.whenHint': '离开后再打开，超过这个时间要输入密码。',
      'lock.optNow': '立即',
      'lock.opt1': '1 分钟',
      'lock.opt5': '5 分钟',
      'lock.setTitle': '设置密码',
      'lock.confirmTitle': '再输入一次',
      'lock.enterTitle': '输入密码',
      'lock.currentTitle': '输入当前密码',
      'lock.newTitle': '设置新密码',
      'lock.wrong': '密码不对',
      'lock.mismatch': '两次不一致',
      'lock.wait': '请等 {n} 秒',
      'lock.forgot': '忘记密码',
      'lock.forgotTitle': '忘记密码',
      'lock.forgotBody': '会退出登录，并清除这台设备上的数据。云端数据保留。重新登录后应用锁关闭。',
      'lock.forgotOk': '退出并清除',
      'lock.cancel': '取消',
      'lock.delete': '删除',
      'lock.onToast': '已打开',
      'lock.offToast': '已关闭',
      'lock.changed': '已修改',
      'lock.deleteDigit': '删除一位',
      'a11y.month.prev': '上个月',
      'a11y.month.next': '下个月',
      'a11y.back.checkin': '返回打卡',
      'a11y.close': '关闭',
      'a11y.settings.back': '返回设置',
      'a11y.entry.edit': '编辑这条记录',
      'a11y.entry.delete': '删除这条记录',
      'a11y.mood.edit': '编辑这天的心情',
      'a11y.mood.delete': '删除这天的心情',
      'a11y.reason.delete': '删除这条理由',
      'a11y.reset': '{type}：重置天数',
      'a11y.admin.back': '返回应用',
      'a11y.admin.refresh': '刷新数据',
      'cal.empty': '没有记录',
      'cal.sep': '，',
      'cal.urges': '抵御冲动 {n} 次',
      'confirm.moodTitle': '删除这天的心情？',
      'confirm.moodBody': '去掉 {date} 的心情，不能撤销。',
      'confirm.reasonTitle': '删除这条理由？',
      'confirm.reasonBody': '删除后不能恢复。',
      'confirm.delete': '删除',
      'type.masturbation': '自慰',
      'type.porn': '看黄',
      'type.sex': '性行为',
      'type.fantasy': '意淫',
      'type.dream': '梦淫'
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
      'urge.reasonsEmpty': 'No reasons yet.',
      'urge.addReason': 'Add a reason',
      'urge.logged': 'Saved',
      'urge.count': 'Urges resisted',
      'nav.checkin': 'Check-in',
      'nav.log': 'Log',
      'nav.stats': 'Stats',
      'nav.settings': 'Settings',
      'home.urges': 'Urges resisted',
      'home.checkins': 'Total days',
      'ring.unit': '{n, plural, one {day} other {days}}',
      'stats.longest': 'Longest streak',
      'stats.totalDays': 'Total days',
      'stats.dayUnit': '',
      'time.today': 'Today {time}',
      'time.yesterday': 'Yesterday {time}',
      'time.date': '{month} {d} {time}',
      'record.save': 'Save',
      'record.form': 'Log',
      'record.edit': 'Edit',
      'record.today': 'Today',
      'record.date': 'Date',
      'record.time': 'Time',
      'record.behavior': 'Behavior',
      'record.mood': 'Mood',
      'record.triggers': 'Triggers',
      'record.note': 'Note',
      'record.other': 'Other',
      'record.delete': 'Delete this entry',
      'record.moodRow': 'Mood · {name}',
      'confirm.entryTitle': 'Delete this entry?',
      'confirm.entryBody': 'This can\'t be undone.',
      'confirm.entryStreak': 'The streak is recalculated from what remains.',
      'mood.5': 'Great',
      'mood.4': 'Good',
      'mood.3': 'Okay',
      'mood.2': 'Low',
      'mood.1': 'Struggling',
      'trigger.无聊': 'Bored',
      'trigger.压力': 'Stressed',
      'trigger.熬夜': 'Up late',
      'trigger.独处': 'Alone',
      'trigger.刷手机': 'Scrolling',
      'trigger.情绪低落': 'Feeling down',
      'trigger.其他': 'Other',
      'day.timeline': 'Timeline',
      'relapse.kept': 'Logged · Streak kept',
      'lock.section': 'Privacy and security',
      'lock.title': 'App lock',
      'lock.off': 'Off',
      'lock.graceNow': 'Lock immediately',
      'lock.grace1': 'Lock after 1 minute away',
      'lock.grace5': 'Lock after 5 minutes away',
      'lock.change': 'Change passcode',
      'lock.when': 'Lock after',
      'lock.whenHint': 'When you come back after this long, enter the passcode.',
      'lock.optNow': 'Now',
      'lock.opt1': '1 min',
      'lock.opt5': '5 min',
      'lock.setTitle': 'Set a passcode',
      'lock.confirmTitle': 'Enter it again',
      'lock.enterTitle': 'Enter passcode',
      'lock.currentTitle': 'Enter current passcode',
      'lock.newTitle': 'Set a new passcode',
      'lock.wrong': 'Wrong passcode',
      'lock.mismatch': 'Those don\'t match',
      'lock.wait': 'Wait {n}s',
      'lock.forgot': 'Forgot passcode',
      'lock.forgotTitle': 'Forgot passcode',
      'lock.forgotBody': 'This logs you out and clears data on this device. Cloud data stays. After you log in, the lock is off.',
      'lock.forgotOk': 'Log out and clear',
      'lock.cancel': 'Cancel',
      'lock.delete': 'Delete',
      'lock.onToast': 'On',
      'lock.offToast': 'Off',
      'lock.changed': 'Updated',
      'lock.deleteDigit': 'Delete last digit',
      'a11y.month.prev': 'Previous month',
      'a11y.month.next': 'Next month',
      'a11y.back.checkin': 'Back to Check-in',
      'a11y.close': 'Close',
      'a11y.settings.back': 'Back to Settings',
      'a11y.entry.edit': 'Edit this entry',
      'a11y.entry.delete': 'Delete this entry',
      'a11y.mood.edit': 'Edit this day\'s mood',
      'a11y.mood.delete': 'Delete this day\'s mood',
      'a11y.reason.delete': 'Delete this reason',
      'a11y.reset': '{type} resets streak',
      'a11y.admin.back': 'Back to app',
      'a11y.admin.refresh': 'Refresh data',
      'cal.empty': 'No entries',
      'cal.sep': ', ',
      'cal.urges': '{n, plural, one {{n} urge resisted} other {{n} urges resisted}}',
      'confirm.moodTitle': 'Delete this day\'s mood?',
      'confirm.moodBody': 'Removes the mood for {date}. This can\'t be undone.',
      'confirm.reasonTitle': 'Delete this reason?',
      'confirm.reasonBody': 'This can\'t be undone.',
      'confirm.delete': 'Delete',
      'type.masturbation': 'Masturbation',
      'type.porn': 'Porn',
      'type.sex': 'Sex',
      'type.fantasy': 'Sexual fantasy',
      'type.dream': 'Wet dream'
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

  function intlLocale(locale) { return locale === 'en' ? 'en' : 'zh-CN'; }

  /* 日期只走 Intl。中文 month:short 的样式是「9月8日」（numeric 在 CLDR 里是「9/8」）。
     英文 month:long。不在这里拼接「月」「日」或英文月份。 */
  function calendarDate(date, locale) {
    var ui = locale === 'en' ? 'en' : 'zh';
    var when = date instanceof Date ? date : new Date(date);
    return new Intl.DateTimeFormat(intlLocale(ui), {
      month: ui === 'en' ? 'long' : 'short',
      day: 'numeric'
    }).format(when);
  }

  /* events: { kind:'relapse', ts, types:[] } | { kind:'urge', ts }，按发生时间排列。
     连续的抵御冲动合成一句「抵御冲动 N 次」。心情不进格子标签。 */
  function calendarCellLabel(date, events, locale) {
    var ui = locale === 'en' ? 'en' : 'zh';
    var pack = STRINGS[ui] || STRINGS.zh;
    var sep = pack['cal.sep'];
    var parts = [];
    var urgeN = 0;
    function flushUrges() {
      if (!urgeN) return;
      parts.push(render(pack['cal.urges'], { n: urgeN }, ui));
      urgeN = 0;
    }
    (events || []).slice().sort(function (a, b) {
      return (a.ts || 0) - (b.ts || 0);
    }).forEach(function (ev) {
      if (!ev || ev.kind === 'urge') {
        if (ev && ev.kind === 'urge') urgeN += 1;
        return;
      }
      flushUrges();
      if (ev.kind !== 'relapse') return;
      var types = ev.types || (ev.type ? [ev.type] : []);
      types.forEach(function (id) {
        var name = pack['type.' + id];
        if (name) parts.push(name);
      });
    });
    flushUrges();
    var detail = parts.length ? parts.join(sep) : pack['cal.empty'];
    return calendarDate(date, ui) + sep + detail;
  }

  /* 12/24 小时跟设备。hourCycle 缺失时用 h23，不拿浏览器语言去猜。 */
  function deviceHourCycle() {
    try {
      var hc = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle;
      if (hc === 'h11' || hc === 'h12' || hc === 'h23' || hc === 'h24') return hc;
    } catch (e) {}
    return 'h23';
  }

  function formatClock(ts, locale, hourCycle) {
    return new Intl.DateTimeFormat(intlLocale(locale), {
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: hourCycle || 'h23'
    }).format(new Date(ts));
  }

  function formatWhen(ts, locale, hourCycle, nowTs) {
    var d = new Date(ts);
    var now = new Date(nowTs == null ? Date.now() : nowTs);
    var ui = locale === 'en' ? 'en' : 'zh';
    var time = formatClock(ts, ui, hourCycle || 'h23');
    var start = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
    var diff = Math.round((start(d) - start(now)) / 86400000);
    if (diff === 0) return render(STRINGS[ui]['time.today'], { time: time }, ui);
    if (diff === -1) return render(STRINGS[ui]['time.yesterday'], { time: time }, ui);
    if (ui === 'en') {
      var month = new Intl.DateTimeFormat('en', { month: 'short' }).format(d);
      return render(STRINGS.en['time.date'], { month: month, d: d.getDate(), time: time }, 'en');
    }
    return render(STRINGS.zh['time.date'], { m: d.getMonth() + 1, d: d.getDate(), time: time }, 'zh');
  }

  root.ZFStrings = {
    t: t, locale: LOCALE, table: STRINGS, render: render,
    deviceHourCycle: deviceHourCycle, formatClock: formatClock, formatWhen: formatWhen,
    calendarCellLabel: calendarCellLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
