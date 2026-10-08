/* 记录页的纯计算：日历标记和日期数字状态。不改存储格式。 */
(function (root) {
  'use strict';
  var TYPE_ORDER = ['masturbation', 'porn', 'sex', 'fantasy', 'dream'];

  /* types 按发生顺序。有抵御冲动时圆点最多 2 个，圆环永远在最后，一共不超过 3 个。 */
  function dayMarkers(types, hasUrge) {
    var seen = [];
    (types || []).forEach(function (id) {
      id = String(id || '');
      if (!id || seen.indexOf(id) >= 0) return;
      seen.push(id);
    });
    var urge = !!hasUrge;
    var dots = seen.slice(0, urge ? 2 : 3);
    var marks = dots.map(function (id) { return { kind: 'dot', type: id }; });
    if (urge) marks.push({ kind: 'ring' });
    return marks.slice(0, 3);
  }

  /* future | today | selected | nomood | checked
     今天永远是 today，不因为选中而改成灰底。 */
  function dayNumberState(opts) {
    opts = opts || {};
    if (opts.future) return 'future';
    if (opts.today) return 'today';
    if (opts.selected) return 'selected';
    if (!opts.mood) return 'nomood';
    return 'checked';
  }

  function intlLocale(locale) { return locale === 'en' ? 'en' : 'zh-CN'; }

  function monthTitle(date, locale) {
    var ui = locale === 'en' ? 'en' : 'zh';
    return new Intl.DateTimeFormat(intlLocale(ui), { year: 'numeric', month: 'long' }).format(date);
  }

  function monthDay(date, locale) {
    var ui = locale === 'en' ? 'en' : 'zh';
    return new Intl.DateTimeFormat(intlLocale(ui), {
      month: ui === 'en' ? 'long' : 'short',
      day: 'numeric'
    }).format(date);
  }

  /* 中文「10月8日 周四」：月日来自 Intl，星期前补一个空格。 */
  function dayTitle(date, locale) {
    var ui = locale === 'en' ? 'en' : 'zh';
    var fmt = new Intl.DateTimeFormat(intlLocale(ui), ui === 'en'
      ? { weekday: 'long', month: 'long', day: 'numeric' }
      : { month: 'short', day: 'numeric', weekday: 'short' });
    if (ui === 'en') return fmt.format(date);
    var out = '';
    fmt.formatToParts(date).forEach(function (p) {
      if (p.type === 'weekday') out += ' ';
      out += p.value;
    });
    return out;
  }

  root.ZFRecords = {
    typeOrder: TYPE_ORDER,
    dayMarkers: dayMarkers,
    dayNumberState: dayNumberState,
    monthTitle: monthTitle,
    monthDay: monthDay,
    dayTitle: dayTitle
  };
})(typeof window !== 'undefined' ? window : globalThis);
