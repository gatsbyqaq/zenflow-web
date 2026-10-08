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
      'lock.changed': '已修改'
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
      'home.checkins': 'Check-in days',
      'ring.unit': '{n, plural, one {day} other {days}}',
      'stats.longest': 'Longest streak',
      'stats.totalDays': 'Total days',
      'stats.dayUnit': '',
      'time.today': 'Today {time}',
      'time.yesterday': 'Yesterday {time}',
      'time.date': '{month} {d} {time}',
      'record.save': 'Save',
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
      'lock.changed': 'Updated'
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
    deviceHourCycle: deviceHourCycle, formatClock: formatClock, formatWhen: formatWhen
  };
})(typeof window !== 'undefined' ? window : globalThis);
