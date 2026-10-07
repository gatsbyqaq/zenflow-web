/* ZenFlow · 戒色 · 自律 · 平静
 * 纯前端，无依赖，所有数据仅保存在 localStorage。
 * 使用普通 <script>（非 ES module），可直接以 file:// 打开。
 */
(function () {
  'use strict';

  var D = window.ZF_DATA;
  var KEY = 'zenflow_v1';
  var DAY = 86400000;

  /* ---------------- 工具函数 ---------------- */
  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKey(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fmtDT(t) { var d = new Date(t); return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function toLocalInput(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function parseLocalInput(s) { if (!s) return NaN; var t = new Date(s).getTime(); return t; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function ic(name, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function fmtDays(ms) { var d = ms / DAY; return d >= 10 ? Math.floor(d) + '' : (Math.floor(d * 10) / 10) + ''; }
  function dayText(ms) {
    var n = fmtDays(ms);
    var unit = t('stats.dayUnit');
    return unit ? (n + ' ' + unit) : n;
  }
  function hourCycle() {
    return (window.ZFStrings && window.ZFStrings.deviceHourCycle) ? window.ZFStrings.deviceHourCycle() : 'h23';
  }
  function fmtClock(ts) {
    var ui = (window.ZFStrings && window.ZFStrings.locale) || 'zh';
    if (window.ZFStrings && window.ZFStrings.formatClock) return window.ZFStrings.formatClock(ts, ui, hourCycle());
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function fmtWhen(ts) {
    var ui = (window.ZFStrings && window.ZFStrings.locale) || 'zh';
    if (window.ZFStrings && window.ZFStrings.formatWhen) return window.ZFStrings.formatWhen(ts, ui, hourCycle());
    return fmtClock(ts);
  }
  function t(key, vars) { return (window.ZFStrings && window.ZFStrings.t) ? window.ZFStrings.t(key, vars) : key; }
  function applyNewCopy() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
  }
  function lapseTypes() { return D.lapseTypes || []; }
  function typeById(id) {
    for (var i = 0; i < lapseTypes().length; i++) if (lapseTypes()[i].id === id) return lapseTypes()[i];
    return null;
  }
  function normalizeTypes(arr) {
    var out = [];
    if (!Array.isArray(arr)) return out;
    arr.forEach(function (id) {
      id = String(id || '');
      if (typeById(id) && out.indexOf(id) < 0) out.push(id);
    });
    return out.slice(0, 5);
  }
  function typeChips(ids) {
    return normalizeTypes(ids).map(function (id) {
      var t = typeById(id);
      return '<span class="type-chip" data-type="' + t.id + '">' + ic(t.icon) + esc(t.label) + '</span>';
    }).join('');
  }
  function typeButtons(selected, attr) {
    return lapseTypes().map(function (t) {
      var on = selected && selected[t.id];
      return '<button type="button" class="tag type-tag' + (on ? ' sel' : '') + '" data-type="' + t.id + '" ' + attr + '="' + t.id + '">' + ic(t.icon) + esc(t.label) + '</button>';
    }).join('');
  }
  function emptyState(icon, text) {
    return '<div class="empty-state">' + ic(icon, 'empty-ic') + '<p>' + text + '</p></div>';
  }
  function checkinScore(c) { return Math.max(+c.ts || 0, +c.editedAt || 0); }

  /* ---------------- 数据层 ---------------- */
  function defaultState() {
    var now = Date.now();
    return {
      version: 1,
      createdAt: now,
      streakStart: now,
      bestStreakMs: 0,
      checkins: {},     // { 'YYYY-MM-DD': { mood: 1-5, ts } }
      relapses: [],     // [{ id, ts, triggers: [], other, note, streakMs }]
      urges: [],        // [{ id, ts }]
      reasons: [],
      goalDays: 30,
      goalSetAt: 0,
      displayName: '',
      displayNameSetAt: 0,
      avatarDataUrl: '',
      avatarSetAt: 0,
      resetTypes: window.ZFStreak.defaultResetTypes(),
      resetTypesSetAt: 0,
      manualStreakStart: 0,
      manualStreakStartSetAt: 0,
      // 云同步用：开始时间最后一次被设置的时间；已删除条目的墓碑（避免同步时被另一台设备"复活"）
      streakStartSetAt: now,
      removed: { ids: {}, reasons: {}, checkins: {} }   // ids: { id: 删除时间 }；reasons / checkins: { 键: 删除时间（负数 = 之后又重新添加） }
    };
  }

  function sanitize(o) {
    if (!o || typeof o !== 'object') throw new Error('格式不正确');
    var s = defaultState();
    if (typeof o.streakStart !== 'number' || !isFinite(o.streakStart)) throw new Error('缺少有效的 streakStart');
    s.streakStart = Math.min(o.streakStart, Date.now());
    s.createdAt = typeof o.createdAt === 'number' ? o.createdAt : s.streakStart;
    s.bestStreakMs = typeof o.bestStreakMs === 'number' && o.bestStreakMs >= 0 ? o.bestStreakMs : 0;
    if (o.checkins && typeof o.checkins === 'object') {
      Object.keys(o.checkins).forEach(function (k) {
        var c = o.checkins[k];
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && c && c.mood >= 1 && c.mood <= 5) {
          var item = { mood: Math.round(c.mood), ts: +c.ts || 0 };
          if (c.note) item.note = String(c.note).slice(0, 500);
          if (typeof c.editedAt === 'number' && isFinite(c.editedAt) && c.editedAt > 0) item.editedAt = c.editedAt;
          s.checkins[k] = item;
        }
      });
    }
    if (Array.isArray(o.relapses)) {
      s.relapses = o.relapses.filter(function (r) { return r && typeof r.ts === 'number'; }).map(function (r) {
        var row = {
          id: String(r.id || uid()), ts: r.ts,
          triggers: Array.isArray(r.triggers) ? r.triggers.map(String).slice(0, 10) : [],
          other: r.other ? String(r.other).slice(0, 40) : '',
          note: r.note ? String(r.note).slice(0, 1000) : '',
          streakMs: +r.streakMs || 0,
          types: normalizeTypes(r.types)
        };
        if (typeof r.editedAt === 'number' && isFinite(r.editedAt) && r.editedAt > 0) row.editedAt = r.editedAt;
        return row;
      });
    }
    if (Array.isArray(o.urges)) {
      s.urges = o.urges.filter(function (u) { return u && typeof u.ts === 'number'; }).map(function (u) { return { id: String(u.id || uid()), ts: u.ts }; });
    }
    if (Array.isArray(o.reasons)) s.reasons = o.reasons.map(String).filter(Boolean).slice(0, 50);
    var g = Math.round(+o.goalDays);
    s.goalDays = (g >= 1 && g <= 3650) ? g : 30;
    s.goalSetAt = (typeof o.goalSetAt === 'number' && isFinite(o.goalSetAt) && o.goalSetAt > 0) ? o.goalSetAt : 0;
    s.displayName = o.displayName ? String(o.displayName).trim().slice(0, 20) : '';
    s.displayNameSetAt = (typeof o.displayNameSetAt === 'number' && isFinite(o.displayNameSetAt) && o.displayNameSetAt > 0) ? o.displayNameSetAt : 0;
    if (typeof o.avatarDataUrl === 'string' && o.avatarDataUrl.indexOf('data:image/') === 0 && o.avatarDataUrl.length <= 180000) {
      s.avatarDataUrl = o.avatarDataUrl;
      s.avatarSetAt = (typeof o.avatarSetAt === 'number' && isFinite(o.avatarSetAt) && o.avatarSetAt > 0) ? o.avatarSetAt : 0;
    }
    s.streakStartSetAt = typeof o.streakStartSetAt === 'number' && isFinite(o.streakStartSetAt) ? o.streakStartSetAt : 0;
    s.resetTypes = window.ZFStreak.normalizeResetTypes(o.resetTypes);
    s.resetTypesSetAt = (typeof o.resetTypesSetAt === 'number' && isFinite(o.resetTypesSetAt) && o.resetTypesSetAt > 0) ? o.resetTypesSetAt : 0;
    if (typeof o.manualStreakStart === 'number' && isFinite(o.manualStreakStart) && o.manualStreakStart > 0) {
      s.manualStreakStart = Math.min(o.manualStreakStart, Date.now());
      s.manualStreakStartSetAt = (typeof o.manualStreakStartSetAt === 'number' && isFinite(o.manualStreakStartSetAt) && o.manualStreakStartSetAt > 0) ? o.manualStreakStartSetAt : 0;
    } else if (!Object.prototype.hasOwnProperty.call(o, 'manualStreakStart') && window.ZFStreak.looksLikeManualStart(s)) {
      s.manualStreakStart = s.streakStart;
      s.manualStreakStartSetAt = s.streakStartSetAt || s.streakStart || 1;
    } else {
      s.manualStreakStart = 0;
      s.manualStreakStartSetAt = (typeof o.manualStreakStartSetAt === 'number' && isFinite(o.manualStreakStartSetAt) && o.manualStreakStartSetAt > 0) ? o.manualStreakStartSetAt : 0;
    }
    var rm = o.removed && typeof o.removed === 'object' ? o.removed : {};
    ['ids', 'reasons', 'checkins'].forEach(function (k) {
      var src = rm[k] && typeof rm[k] === 'object' ? rm[k] : {};
      Object.keys(src).slice(0, 5000).forEach(function (key) { if (typeof src[key] === 'number' && isFinite(src[key])) s.removed[k][String(key).slice(0, 200)] = src[key]; });
    });
    return s;
  }

  var state;
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      state = raw ? sanitize(JSON.parse(raw)) : defaultState();
    } catch (e) {
      console.warn('读取数据失败，已使用默认数据', e);
      state = defaultState();
    }
    save();
  }
  function save(opts) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('保存失败'); }
    // 已登录时通知云同步模块（未配置云端时 ZFCloud 不存在，行为与以前完全相同）
    if (!(opts && opts.fromCloud) && window.ZFCloud && window.ZFCloud.onLocalChange) window.ZFCloud.onLocalChange(opts && opts.replaceAll);
  }

  function curMs() { return Math.max(0, Date.now() - state.streakStart); }
  function bestMs() { return Math.max(window.ZFStreak.historicalBest(state), curMs()); }
  function totalCleanMs() { return window.ZFStreak.totalCleanMs(state, Date.now()); }
  function keepLineText() {
    var unit = t('stats.dayUnit');
    var bestBit = t('stats.longest') + ' ' + fmtDays(bestMs()) + (unit ? ' ' + unit : '');
    return bestBit + ' · ' + t('stats.totalDays') + ' ' + fmtDays(totalCleanMs()) + ' · ' + t('urge.count') + ' ' + state.urges.length;
  }
  function applyStreak(touchSetAt) {
    var next = window.ZFStreak.computeStreakStart(state);
    var changed = next !== state.streakStart;
    state.streakStart = next;
    state.bestStreakMs = window.ZFStreak.historicalBest(state);
    if (touchSetAt && changed) state.streakStartSetAt = Date.now();
    return changed;
  }
  function relapseResets(types) { return window.ZFStreak.relapseResets({ types: types }, state.resetTypes); }
  function endedStreakMs(ts, types, ignoreId) { return window.ZFStreak.endedStreakMs(state, ts, types, ignoreId); }
  function previewStart(ts, types) {
    var clone = {
      createdAt: state.createdAt,
      manualStreakStart: state.manualStreakStart,
      resetTypes: state.resetTypes,
      relapses: state.relapses.concat([{ ts: ts, types: types }])
    };
    return window.ZFStreak.computeStreakStart(clone);
  }
  function resetHint(types) {
    if (!types.length) return '';
    if (!relapseResets(types)) return '不重置天数，仍记在日历上';
    var which = types.filter(function (id) { return state.resetTypes[id]; }).map(function (id) { return typeById(id).label; });
    return '会重置戒色天数（' + which.join('、') + '）';
  }
  function resetSummary() {
    var types = lapseTypes();
    var on = types.filter(function (t) { return state.resetTypes[t.id]; });
    if (on.length === types.length && types.length) return '全部重置';
    if (on.length > 1) return '自慰等 ' + on.length + ' 项重置';
    return '仅自慰重置';
  }
  function commitRelapse(opts) {
    var row = {
      id: uid(), ts: opts.ts, triggers: opts.triggers || [], types: opts.types,
      other: opts.other || '', note: opts.note || '',
      streakMs: endedStreakMs(opts.ts, opts.types),
      editedAt: Date.now()
    };
    state.relapses.push(row);
    var changed = applyStreak(true);
    save();
    return { changed: changed, resets: relapseResets(opts.types) };
  }

  /* ---------------- 通用 UI ---------------- */
  var toastTimer;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  // 弹窗打开时锁定文档滚动，关闭后恢复原位置（文档是唯一的滚动容器）
  var lockedY = null;
  function lockScroll() {
    if (lockedY !== null) return;
    lockedY = window.scrollY || 0;
    document.body.style.top = -lockedY + 'px';
    document.body.classList.add('scroll-locked');
  }
  function cropSheetOpen() {
    return window.ZFCloud && window.ZFCloud.cropOpen && window.ZFCloud.cropOpen();
  }
  function overlayOpen() {
    return ($('actMask') && !$('actMask').classList.contains('hidden')) || ($('dayMask') && !$('dayMask').classList.contains('hidden')) || ($('modalMask') && !$('modalMask').classList.contains('hidden')) || cropSheetOpen();
  }
  function unlockScroll() {
    if (lockedY === null || overlayOpen()) return;
    document.body.classList.remove('scroll-locked');
    document.body.style.top = '';
    window.scrollTo(0, lockedY);
    lockedY = null;
  }

  var modalOk = null;
  function openModal(o) {
    $('modalTitle').textContent = o.title || '';
    $('modalBody').innerHTML = o.html || '';
    var ok = $('modalOk'), cancel = $('modalCancel');
    ok.textContent = o.ok || '确定';
    ok.className = 'btn ' + (o.danger ? 'btn-danger' : (o.warm ? 'btn-warm' : 'btn-primary'));
    cancel.textContent = o.cancel || '取消';
    cancel.classList.toggle('hidden', o.cancel === null);
    modalOk = o.onOk || null;
    $('modalMask').classList.remove('hidden');
    lockScroll();
    var inp = $('modalBody').querySelector('input');
    if (inp) setTimeout(function () { inp.focus(); }, 50);
  }
  function closeModal() { $('modalMask').classList.add('hidden'); modalOk = null; unlockScroll(); }
  $('modalCancel').addEventListener('click', closeModal);
  $('modalMask').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
  $('modalBody').addEventListener('click', function (e) {
    var g = e.target.closest('[data-goal]');
    if (g && $('goalModalInput')) {
      $('goalModalInput').value = g.dataset.goal;
      g.parentNode.querySelectorAll('[data-goal]').forEach(function (b) { b.classList.toggle('sel', b === g); });
      return;
    }
    var tp = e.target.closest('[data-ed-type]');
    if (tp) { tp.classList.toggle('sel'); return; }
    var tr = e.target.closest('[data-ed-trigger]');
    if (tr) {
      tr.classList.toggle('sel');
      if (tr.getAttribute('data-ed-trigger') === '其他' && $('edOther')) $('edOther').classList.toggle('hidden', !tr.classList.contains('sel'));
    }
  });
  $('modalOk').addEventListener('click', function () {
    if (modalOk && modalOk() === false) return;
    closeModal();
  });

  /* ---------------- 导航 ---------------- */
  var current = 'home';
  function go(tab) {
    if (current === 'sos' && tab !== 'sos') resetSos();
    if (cropSheetOpen()) window.ZFCloud.closeCrop();
    if ($('actMask') && !$('actMask').classList.contains('hidden')) closeAct();
    if (dayKey) closeDay();
    if (current === 'settings' && tab !== 'settings' && settingsView !== 'root') {
      settingsView = 'root';
      applySettingsDom();
      if (/^#settings/.test(location.hash) && location.hash !== '#admin') {
        try { history.replaceState(null, '', location.pathname + location.search); } catch (err) {}
      }
    }
    current = tab;
    document.body.classList.toggle('sos-open', tab === 'sos');
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.dataset.screen === tab); });
    document.querySelectorAll('.tab').forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('tabbar').dataset.active = tab;
    window.scrollTo(0, 0);
    render(tab);
  }
  document.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', function () { go(b.dataset.tab); }); });
  var sideUserBtn = $('sideUser');
  if (sideUserBtn) sideUserBtn.addEventListener('click', function () { go('settings'); });
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-goto]');
    if (g) go(g.dataset.goto);
  });

  // 键盘：Esc 关闭弹窗；1–4 切换页面、S 打开急救（输入框内或按住修饰键时不触发）
  document.addEventListener('keydown', function (e) {
    var modalOpen = !$('modalMask').classList.contains('hidden');
    var actOpen = $('actMask') && !$('actMask').classList.contains('hidden');
    var dayOpen = $('dayMask') && !$('dayMask').classList.contains('hidden');
    var cropOpen = cropSheetOpen();
    if (e.key === 'Escape') {
      if (cropOpen) { e.preventDefault(); window.ZFCloud.closeCrop(); return; }
      if (modalOpen) { e.preventDefault(); closeModal(); return; }
      if (actOpen) { e.preventDefault(); closeAct(); return; }
      if (dayOpen) { e.preventDefault(); closeDay(); return; }
      if (current === 'settings' && settingsView !== 'root') { e.preventDefault(); backSettings(); }
      return;
    }
    if (modalOpen || actOpen || dayOpen || cropOpen || (window.ZFAdmin && window.ZFAdmin.isOpen && window.ZFAdmin.isOpen()) || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    var map = { '1': 'home', '2': 'log', '3': 'stats', '4': 'settings', 's': 'sos', 'S': 'sos' };
    var dest = map[e.key];
    if (dest && dest !== current) { e.preventDefault(); go(dest); }
  });

  function render(tab) {
    if (tab === 'home') renderHome();
    else if (tab === 'sos') startBreath();
    else if (tab === 'log') renderLog();
    else if (tab === 'stats') renderStats();
    else if (tab === 'settings') renderSettings();
  }

  /* ---------------- 首页 ---------------- */
  var RING_LEN = 2 * Math.PI * 86;
  function milestoneWindow(days) {
    var ms = D.milestones.map(function (m) { return m.days; });
    var prev = 0, next = null;
    for (var i = 0; i < ms.length; i++) { if (days < ms[i]) { next = ms[i]; break; } prev = ms[i]; }
    if (next === null) { prev = Math.floor(days / 30) * 30; next = prev + 30; }
    return { prev: prev, next: next };
  }

  function updateTimer() {
    var ms = curMs();
    var days = Math.floor(ms / DAY);
    if ($('daysNum')) $('daysNum').textContent = days;
    if ($('gaugeUnit')) $('gaugeUnit').textContent = t('ring.unit', { n: days });
    var dFloat = ms / DAY;
    var goal = state.goalDays || 30;
    var p = goal > 0 ? Math.min(1, Math.max(0, dFloat / goal)) : 0;
    var ring = $('ringFg');
    if (ring) {
      ring.style.strokeDasharray = String(RING_LEN);
      ring.style.strokeDashoffset = (RING_LEN * (1 - p)).toFixed(2);
    }
    var grad = $('insRing');
    if (grad) {
      var ang = Math.max(p, 0.001) * Math.PI * 2;
      grad.setAttribute('x1', '100');
      grad.setAttribute('y1', '14');
      grad.setAttribute('x2', (100 + 86 * Math.sin(ang)).toFixed(2));
      grad.setAttribute('y2', (100 - 86 * Math.cos(ang)).toFixed(2));
    }
    var pct = Math.round(p * 100);
    var gauge = $('streakGauge');
    if (gauge) gauge.setAttribute('aria-label', days + ' 天，目标 ' + goal + ' 天，完成 ' + pct + '%');
    if ($('bestStreak')) $('bestStreak').textContent = dayText(bestMs());
  }

  function renderHome() {
    if ($('urgeCountHome')) $('urgeCountHome').textContent = state.urges.length;
    if ($('checkinCountHome')) $('checkinCountHome').textContent = Object.keys(state.checkins).length;
    var now = new Date();
    $('todayDate').textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + '日一二三四五六'[now.getDay()];
    updateTimer();
    renderActEntry();
    renderCalendar();
    renderBadges();
  }

  function moodByValue(v) {
    return D.moods.filter(function (x) { return x.v === v; })[0] || null;
  }
  function renderActEntry() {
    var box = $('actSummary'); if (!box) return;
    var k = dateKey(Date.now());
    var today = state.checkins[k];
    var rels = state.relapses.filter(function (r) { return dateKey(r.ts) === k; }).sort(function (a, b) { return a.ts - b.ts; });
    var urgesToday = state.urges.filter(function (u) { return u && dateKey(u.ts) === k; });
    var html = '';
    if (today) {
      var m = moodByValue(today.mood) || D.moods[2];
      html += '<div class="act-status" data-mood="' + m.v + '"><span class="e">' + ic(m.icon) + '</span><div><b>心情 · ' + esc(m.t) + '</b>' +
        (today.note ? '<div class="small muted">' + esc(today.note) + '</div>' : '') + '</div></div>';
    }
    if (rels.length) {
      html += '<div class="today-rel">' + rels.map(function (r) {
        var primary = (normalizeTypes(r.types)[0]) || '';
        var tp = primary && typeById(primary);
        return '<button type="button" class="h-item relapse" data-open-day="' + k + '" data-type="' + esc(primary) + '"><div class="h-ico">' + ic(tp ? tp.icon : 'cloud-rain') + '</div><div class="h-main"><b>' + (typeChips(r.types) || '行为') + '</b><div class="small muted">' + fmtWhen(r.ts) + (relapseResets(r.types) ? '' : ' · ' + t('relapse.kept')) + '</div></div></button>';
      }).join('') + '</div>';
    }
    if (!today && !rels.length && !urgesToday.length) html = '<p class="muted small act-entry-empty">还没有记录</p>';
    else if (rels.length || urgesToday.length) html += '<p class="small" style="margin:4px 0 12px"><button type="button" class="btn-link" data-open-day="' + k + '">' + t('day.timeline') + '</button></p>';
    box.innerHTML = html;
  }
  $('checkinCard').addEventListener('click', function (e) {
    if (e.target.closest('#btnOpenAct')) { openAct(dateKey(Date.now())); return; }
    var open = e.target.closest('[data-open-day]');
    if (open) openDay(open.dataset.openDay);
  });

  var calOffset = 0;
  function renderCalendar() {
    var base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + calOffset);
    var y = base.getFullYear(), mo = base.getMonth();
    $('calTitle').textContent = y + '年' + (mo + 1) + '月';
    $('calNext').disabled = calOffset >= 0; $('calNext').style.opacity = calOffset >= 0 ? .35 : 1;
    var first = (new Date(y, mo, 1).getDay() + 6) % 7; // 周一为第一天
    var count = new Date(y, mo + 1, 0).getDate();
    var nowD = new Date();
    var todayK = dateKey(nowD.getTime());
    var typesByDay = {};
    var relapseDays = {};
    var urgeDays = {};
    state.relapses.forEach(function (r) {
      var dk = dateKey(r.ts);
      relapseDays[dk] = true;
      normalizeTypes(r.types).forEach(function (id) {
        if (!typesByDay[dk]) typesByDay[dk] = [];
        if (typesByDay[dk].indexOf(id) < 0) typesByDay[dk].push(id);
      });
    });
    state.urges.forEach(function (u) {
      if (u && typeof u.ts === 'number') urgeDays[dateKey(u.ts)] = true;
    });
    var html = '';
    for (var i = 0; i < first; i++) html += '<div class="cal-cell empty"></div>';
    for (var d = 1; d <= count; d++) {
      var k = y + '-' + pad(mo + 1) + '-' + pad(d);
      var cls = 'cal-cell';
      var types = typesByDay[k] || [];
      var isToday = y === nowD.getFullYear() && mo === nowD.getMonth() && d === nowD.getDate();
      if (isToday) cls += ' today';
      else if (k > todayK) cls += ' future';
      var markType = '';
      if (relapseDays[k]) {
        var resetting = types.filter(function (id) { return state.resetTypes[id]; });
        var pool = resetting.length ? resetting : types;
        if (pool.indexOf('masturbation') >= 0) markType = 'masturbation';
        else markType = pool[0] || 'masturbation';
      }
      var mark = '';
      var title = k;
      if (markType) {
        var tp = typeById(markType);
        title += ' · ' + (tp ? tp.label : '破戒');
        mark = '<span class="cal-types"><span class="cal-mark dot" data-type="' + esc(markType) + '"></span></span>';
      } else if (urgeDays[k]) {
        title += ' · ' + t('urge.resisted');
        mark = '<span class="cal-types"><span class="cal-mark urge-ring" title="' + esc(t('urge.resisted')) + '"></span></span>';
      }
      var future = k > todayK;
      var tag = future ? 'div' : 'button';
      html += '<' + tag + ' class="' + cls + '" ' + (future ? '' : 'type="button" data-date="' + k + '"') + ' title="' + esc(title) + '"><span class="cal-n">' + d + '</span>' + mark + '</' + tag + '>';
    }
    $('calGrid').innerHTML = html;
  }
  $('calPrev').addEventListener('click', function () { calOffset--; renderCalendar(); });
  $('calNext').addEventListener('click', function () { if (calOffset < 0) { calOffset++; renderCalendar(); } });
  $('calGrid').addEventListener('click', function (e) {
    var cell = e.target.closest('[data-date]');
    if (!cell) return;
    openDay(cell.dataset.date);
  });

  var badgesExpanded = false;
  function badgeHtml(m, cls, sub) {
    return '<div class="' + cls + '"><div class="b-ico">' + ic(m.icon) + '</div><span class="b-d">' + m.days + ' 天</span><span class="b-n">' + sub + '</span></div>';
  }
  function renderBadges() {
    var cd = curMs() / DAY, bd = bestMs() / DAY;
    var items = D.milestones.map(function (m) {
      var on = cd >= m.days;
      return { m: m, on: on };
    });
    var unlocked = items.filter(function (x) { return x.on; });
    var next = null;
    for (var i = 0; i < items.length; i++) if (!items[i].on) { next = items[i]; break; }
    var shown = items;
    if (!badgesExpanded) {
      shown = next ? unlocked.slice(-3).concat([next]) : unlocked.slice(-4);
      if (!shown.length) shown = items.slice(0, 1);
    }
    $('badges').classList.toggle('expanded', badgesExpanded);
    $('badges').innerHTML = shown.map(function (item) {
      var m = item.m, cls = 'badge', sub = m.name;
      if (item.on) cls += ' on';
      else if (next && next.m === m) { cls += ' next'; sub = '下一个'; }
      else if (bd >= m.days) sub = '曾达成';
      return badgeHtml(m, cls, sub);
    }).join('');
    $('badgeCount').textContent = '已解锁 ' + unlocked.length + '/' + D.milestones.length;
    var card = $('badgeCard');
    if (card) card.setAttribute('aria-expanded', badgesExpanded ? 'true' : 'false');
  }
  if ($('badgeCard')) {
    $('badgeCard').addEventListener('click', function () { badgesExpanded = !badgesExpanded; renderBadges(); });
    $('badgeCard').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      badgesExpanded = !badgesExpanded;
      renderBadges();
    });
  }

  var GOAL_PRESETS = [7, 14, 30, 60, 90, 180, 365];
  function setGoal(n) {
    n = Math.round(+n);
    if (!(n >= 1 && n <= 3650)) { toast('请输入 1–3650 之间的天数'); return false; }
    state.goalDays = n;
    state.goalSetAt = Date.now();
    save();
    if (current === 'home') updateTimer();
    if (current === 'settings') renderGoalControl();
    updateSettingsChrome();
    toast('目标已设为 ' + n + ' 天');
    return true;
  }
  function renderGoalControl() {
    var box = $('goalPresets'); if (!box) return;
    box.innerHTML = GOAL_PRESETS.map(function (n) {
      return '<button type="button" class="tag' + (state.goalDays === n ? ' sel' : '') + '" data-goal-preset="' + n + '">' + n + ' 天</button>';
    }).join('');
    if ($('goalInput')) $('goalInput').value = state.goalDays;
  }
  $('goalPresets').addEventListener('click', function (e) {
    var b = e.target.closest('[data-goal-preset]'); if (!b) return;
    setGoal(b.dataset.goalPreset);
  });
  $('btnSaveGoal').addEventListener('click', function () { setGoal($('goalInput').value); });

  $('btnAdjustStart').addEventListener('click', function () {
    openModal({
      title: '调整开始时间',
      html: '<p>可改成更早的开始时间。之后若有会重置的破戒，天数从那次算起。</p><input type="datetime-local" id="startInput" value="' + toLocalInput(state.streakStart) + '" max="' + toLocalInput(Date.now()) + '" />',
      ok: '保存',
      onOk: function () {
        var t = parseLocalInput($('startInput').value);
        if (!isFinite(t)) { toast('请选择有效的时间'); return false; }
        if (t > Date.now()) { toast('开始时间不能晚于现在'); return false; }
        state.manualStreakStart = t;
        state.manualStreakStartSetAt = Date.now();
        var changed = applyStreak(true);
        save();
        if (current === 'home') renderHome();
        else updateTimer();
        updateSettingsChrome();
        toast(changed && state.streakStart !== t ? '已保存。天数从最近一次会重置的破戒算起' : '开始时间已更新');
      }
    });
  });

  /* ---------------- 冲动：约 60 秒呼吸，然后记下或去记录行为 ---------------- */
  var BREATH_IN = 4, BREATH_OUT = 4, BREATH_ROUNDS = 6;
  var breathTimer = null, sosLogged = false;

  function showSosStep(id) {
    document.querySelectorAll('.sos-step').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    window.scrollTo(0, 0);
  }
  function resetSos() { stopBreath(); sosLogged = false; }
  function stopBreath() { if (breathTimer) { clearTimeout(breathTimer); breathTimer = null; } }

  function startBreath() {
    stopBreath();
    sosLogged = false;
    showSosStep('sosBreath');
    var circle = $('breathCircle');
    var total = BREATH_ROUNDS * (BREATH_IN + BREATH_OUT);
    var elapsed = 0;
    circle.style.transitionDuration = '0s';
    circle.style.transform = 'scale(.6)';
    function paintDots(round) {
      var dots = $('breathDots');
      if (!dots) return;
      dots.querySelectorAll('i').forEach(function (el, i) {
        el.classList.toggle('on', i < round - 1);
        el.classList.toggle('now', i === round - 1);
      });
    }
    function frame() {
      if (elapsed >= total) { finishBreath(); return; }
      var cycle = BREATH_IN + BREATH_OUT;
      var pos = elapsed % cycle;
      var round = Math.floor(elapsed / cycle) + 1;
      var inhale = pos < BREATH_IN;
      var left = inhale ? (BREATH_IN - pos) : (BREATH_OUT - (pos - BREATH_IN));
      $('breathPhase').textContent = t(inhale ? 'urge.inhale' : 'urge.exhale');
      $('breathCount').textContent = left;
      if ($('breathHint')) $('breathHint').textContent = round === 1 ? t('urge.breathHint') : '';
      paintDots(round);
      if (pos === 0 || pos === BREATH_IN) {
        circle.style.transitionDuration = (inhale ? BREATH_IN : BREATH_OUT) + 's';
        circle.style.transitionTimingFunction = 'ease-in-out';
        circle.style.transform = inhale ? 'scale(1)' : 'scale(.6)';
      }
      elapsed++;
      breathTimer = setTimeout(frame, 1000);
    }
    requestAnimationFrame(function () { requestAnimationFrame(frame); });
  }
  function finishBreath() {
    stopBreath();
    showUrgeEnd();
  }
  function showUrgeEnd() {
    showSosStep('sosEnd');
    var n = fmtDays(curMs());
    var unit = t('ring.unit', { n: n });
    $('urgeStreakNow').innerHTML = '<span class="gauge-days">' + esc(n) + '</span>' + (unit ? '<span class="gauge-unit">' + esc(unit) + '</span>' : '');
    $('urgeStreakNow').setAttribute('aria-label', t('urge.streakNow', { n: n }));
    $('reasonsView').innerHTML = state.reasons.length
      ? state.reasons.map(function (r) { return '<li><span>' + esc(r) + '</span></li>'; }).join('')
      : '<li class="reasons-empty"><span class="muted">' + esc(t('urge.reasonsEmpty')) + '</span><button type="button" class="reason-add" id="btnGoAddReason">' + esc(t('urge.addReason')) + '</button></li>';
  }

  if ($('reasonsView')) $('reasonsView').addEventListener('click', function (e) {
    if (!e.target.closest('#btnGoAddReason')) return;
    go('settings');
    showSettings('reasons');
  });
  $('btnSkipBreath').addEventListener('click', finishBreath);
  $('btnSosClose1').addEventListener('click', function () { go('home'); });
  $('btnSosClose2').addEventListener('click', function () { go('home'); });
  $('btnUrgeRecord').addEventListener('click', function () { go('home'); openAct(dateKey(Date.now())); });
  $('btnMadeIt').addEventListener('click', function () {
    if (!sosLogged) {
      state.urges.push({ id: uid(), ts: Date.now() });
      sosLogged = true;
      save();
    }
    toast(t('urge.logged'));
    go('home');
  });

  /* ---------------- 记录 ---------------- */
  var dayKey = null;
  var actDay = null;
  var actDraft = { mood: null, types: {}, triggers: {} };

  function selectedTypes(map) { return lapseTypes().filter(function (t) { return map[t.id]; }).map(function (t) { return t.id; }); }
  function renderLog() { renderHistory(); }

  function refreshChrome() {
    if (window.ZFCloud && window.ZFCloud.refreshChrome) window.ZFCloud.refreshChrome();
  }
  function readTagMap(root, attr) {
    var map = {};
    if (!root) return map;
    root.querySelectorAll('[' + attr + '].sel').forEach(function (b) { map[b.getAttribute(attr)] = true; });
    return map;
  }

  if ($('btnOpenActLog')) $('btnOpenActLog').addEventListener('click', function () { openAct(dateKey(Date.now())); });
  if ($('btnGotoCal')) $('btnGotoCal').addEventListener('click', function () {
    go('home');
    var el = $('calCard');
    if (el && el.scrollIntoView) setTimeout(function () { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 40);
  });

  function atLocal(k, hh, mm) {
    var p = k.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], hh || 0, mm || 0, 0, 0).getTime();
  }
  function fmtDayTitle(k) {
    var p = k.split('-');
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    var y = d.getFullYear() === new Date().getFullYear() ? '' : (d.getFullYear() + '年');
    return y + (d.getMonth() + 1) + '月' + d.getDate() + '日 星期' + '日一二三四五六'[d.getDay()];
  }
  function hm(ts) { return fmtClock(ts); }
  function minuteOf(ts) { var d = new Date(ts); return d.getHours() * 60 + d.getMinutes(); }
  function dayEvents(k) {
    var events = [];
    var c = state.checkins[k];
    if (c) {
      var ts = (c.ts && dateKey(c.ts) === k) ? c.ts : atLocal(k, 12, 0);
      events.push({ kind: 'checkin', ts: ts, mood: c.mood, note: c.note || '' });
    }
    state.relapses.forEach(function (r) {
      if (dateKey(r.ts) === k) events.push({ kind: 'relapse', ts: r.ts, r: r });
    });
    state.urges.forEach(function (u) {
      if (dateKey(u.ts) === k) events.push({ kind: 'urge', ts: u.ts, u: u });
    });
    events.sort(function (a, b) { return a.ts - b.ts; });
    return events;
  }
  function tlActions(html) {
    return '<div class="day-tl-actions">' + html + '</div>';
  }
  function timelineHtml(k) {
    var events = dayEvents(k);
    var list = events.length ? events.map(function (ev) {
      var primary = ev.kind === 'relapse' ? ((normalizeTypes(ev.r.types)[0]) || '') : '';
      var kindCls = ev.kind === 'relapse' ? ' relapse' : (ev.kind === 'urge' ? ' urge' : '');
      var body, actions = '';
      if (ev.kind === 'checkin') {
        var m = D.moods.filter(function (x) { return x.v === ev.mood; })[0] || D.moods[2];
        body = '<b>心情 · ' + esc(m.t) + '</b>' + (ev.note ? '<div class="small">' + esc(ev.note) + '</div>' : '');
        actions = tlActions(
          '<button class="h-edit" type="button" data-edit="checkin" data-date="' + esc(k) + '" aria-label="编辑">' + ic('pen-line') + '</button>' +
          '<button class="h-del" type="button" data-del="checkin" data-date="' + esc(k) + '" aria-label="删除">' + ic('x') + '</button>'
        );
      } else if (ev.kind === 'urge') {
        body = '<b>' + esc(t('urge.resisted')) + '</b>';
        actions = tlActions('<button class="h-del" type="button" data-del="urge" data-id="' + esc(ev.u.id) + '" aria-label="删除">' + ic('x') + '</button>');
      } else {
        var r = ev.r;
        body = '<b>' + (relapseResets(r.types) ? '破戒' : esc(t('relapse.kept'))) + '</b>' +
          (typeChips(r.types) ? '<div class="h-tags">' + typeChips(r.types) + '</div>' : '<div class="small muted">未标类型（仍会计入重置）</div>') +
          ((r.triggers && r.triggers.length) ? '<div class="small muted">' + esc(r.triggers.map(function (tg) { return tg === '其他' && r.other ? '其他：' + r.other : tg; }).join('、')) + '</div>' : '') +
          (r.note ? '<div class="small">' + esc(r.note) + '</div>' : '');
        actions = tlActions(
          '<button class="h-edit" type="button" data-edit="relapse" data-id="' + esc(r.id) + '" aria-label="编辑">' + ic('pen-line') + '</button>' +
          '<button class="h-del" type="button" data-del="relapse" data-id="' + esc(r.id) + '" aria-label="删除">' + ic('x') + '</button>'
        );
      }
      return '<li class="day-tl-item"><span class="day-tl-time">' + hm(ev.ts) + '</span><span class="day-tl-node' + kindCls + '" data-type="' + esc(primary) + '"></span><div class="day-tl-card">' + body + actions + '</div></li>';
    }).join('') : '<li class="day-tl-item"><span class="day-tl-time">—</span><span class="day-tl-node"></span><div class="day-tl-card"><span class="muted small">这一天还没有记录。用下面的「记录行为」补上。</span></div></li>';
    return '<p class="field-label">' + esc(t('day.timeline')) + '</p><ol class="day-tl-list">' + list + '</ol>';
  }
  function renderDaySheet() {
    if (!dayKey) return;
    $('dayTitle').textContent = fmtDayTitle(dayKey);
    var k = dayKey;
    var c = state.checkins[k];
    var html = timelineHtml(k);
    html += '<button class="btn btn-gray btn-block" type="button" id="btnOpenActFromDay">' + ic('pen-line') + '记录行为</button>';
    if (c) html += '<button class="btn-link center-block" type="button" id="btnClearDayCheckin">清除这天的心情</button>';
    $('dayBody').innerHTML = html;
  }
  function openDay(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k > dateKey(Date.now())) { toast('还不能查看未来的日期'); return; }
    dayKey = k;
    $('dayMask').classList.remove('hidden');
    lockScroll();
    renderDaySheet();
  }
  function closeDay() {
    if (!$('dayMask') || $('dayMask').classList.contains('hidden')) return;
    $('dayMask').classList.add('hidden');
    dayKey = null;
    unlockScroll();
    if (current === 'home') renderHome();
    else if (current === 'log') renderHistory();
  }
  function clearDayCheckin() {
    var k = dayKey;
    if (!k || !state.checkins[k]) return;
    openModal({
      title: '清除这天的心情？',
      html: '<p>会去掉 ' + esc(k) + ' 的心情。行为记录不受影响。</p>',
      ok: '清除', danger: true,
      onOk: function () {
        delete state.checkins[k];
        state.removed.checkins[k] = Date.now();
        save();
        renderDaySheet();
        if (current === 'home') renderHome();
        if (current === 'log') renderHistory();
        toast('已清除心情');
      }
    });
  }
  function actWillWriteMood(prev, note, types) {
    if (!actDraft.mood) return false;
    if (!prev || prev.mood !== actDraft.mood) return true;
    return !types.length && !!note && note !== (prev.note || '');
  }
  function renderActForm() {
    if (!actDay || !$('actMoods')) return;
    var prev = state.checkins[actDay];
    $('actMoods').innerHTML = D.moods.map(function (m) {
      return '<button type="button" class="mood' + (actDraft.mood === m.v ? ' sel' : '') + '" data-act-mood="' + m.v + '"><span class="e">' + ic(m.icon) + '</span>' + m.t + '</button>';
    }).join('');
    $('actTypes').innerHTML = typeButtons(actDraft.types, 'data-act-type');
    $('actTriggers').innerHTML = D.triggers.map(function (t) {
      return '<button type="button" class="tag' + (actDraft.triggers[t] ? ' sel' : '') + '" data-act-trigger="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('');
    $('actOther').classList.toggle('hidden', !actDraft.triggers['其他']);
    var types = selectedTypes(actDraft.types);
    var note = ($('actNote') && $('actNote').value || '').trim();
    var moodWrite = actWillWriteMood(prev, note, types);
    var can = moodWrite || types.length > 0;
    if ($('btnSaveAct')) {
      $('btnSaveAct').disabled = !can;
      $('btnSaveAct').textContent = t('record.save');
    }
    paintActWhen();
  }
  function paintActWhen() {
    var btn = $('actWhenBtn');
    var raw = $('actTime') && $('actTime').value;
    var ts = parseLocalInput(raw);
    if (btn) btn.textContent = isFinite(ts) ? fmtWhen(ts) : '';
  }
  function openTimePicker() {
    var input = $('actTime');
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try { input.showPicker(); return; } catch (e) {}
    }
    input.focus();
  }
  function openAct(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k > dateKey(Date.now())) { toast('还不能记录未来的日期'); return; }
    var c = state.checkins[k];
    actDay = k;
    actDraft = { mood: c ? c.mood : null, types: {}, triggers: {} };
    $('actTime').value = k === dateKey(Date.now()) ? toLocalInput(Date.now()) : (k + 'T12:00');
    $('actTime').max = toLocalInput(Date.now() + 60000);
    $('actNote').value = '';
    $('actOther').value = '';
    $('actMask').classList.remove('hidden');
    lockScroll();
    renderActForm();
  }
  function closeAct() {
    if (!$('actMask') || $('actMask').classList.contains('hidden')) return;
    $('actMask').classList.add('hidden');
    actDay = null;
    unlockScroll();
  }
  function refreshAfterAct() {
    if (dayKey) renderDaySheet();
    if (current === 'home') renderHome();
    if (current === 'log') renderHistory();
    if (current === 'stats') renderStats();
  }
  function saveAct() {
    if (!actDay) return;
    var k = actDay;
    var prev = state.checkins[k];
    var note = ($('actNote').value || '').trim();
    var types = selectedTypes(actDraft.types);
    var moodWrite = actWillWriteMood(prev, note, types);
    if (!moodWrite && !types.length) { toast('先选择心情，或选择行为类型'); return; }
    var ts = parseLocalInput($('actTime').value);
    if (!isFinite(ts)) { toast('请选择时间'); return; }
    if (ts > Date.now() + 60000) { toast('时间不能晚于现在'); return; }
    if (dateKey(ts) !== k) { toast('时间需要在这一天'); return; }
    var triggers = D.triggers.filter(function (t) { return actDraft.triggers[t]; });
    var other = actDraft.triggers['其他'] ? $('actOther').value.trim() : '';
    function write() {
      if (moodWrite) {
        var row = { mood: actDraft.mood, ts: (prev && prev.ts) || ts, editedAt: Date.now() };
        if (types.length) {
          if (prev && prev.note) row.note = prev.note;
        } else if (note) row.note = note;
        else if (prev && prev.note) row.note = prev.note;
        state.checkins[k] = row;
        if (state.removed.checkins[k] > 0) state.removed.checkins[k] = -Date.now();
      }
      var result = null;
      if (types.length) {
        result = commitRelapse({ ts: ts, types: types, triggers: triggers, other: other, note: note });
      } else save();
      closeAct();
      refreshAfterAct();
      if (result && result.changed) toast('已记录，天数已重算');
      else if (result) toast('已记录');
      else toast(prev ? '心情已更新' : '心情已记下');
    }
    if (types.length && relapseResets(types) && previewStart(ts, types) !== state.streakStart) {
      openModal({
        title: '这次会重置戒色天数',
        html: '<p>保存后连续天数从这次重算。历史和最长连续保留。</p>',
        ok: '保存并重新计算', warm: true, onOk: write
      });
      return;
    }
    write();
  }
  $('actClose').addEventListener('click', closeAct);
  $('actMask').addEventListener('click', function (e) { if (e.target === this) closeAct(); });
  $('actBody').addEventListener('click', function (e) {
    var moodBtn = e.target.closest('[data-act-mood]');
    if (moodBtn) {
      var v = +moodBtn.dataset.actMood;
      actDraft.mood = actDraft.mood === v ? null : v;
      renderActForm();
      return;
    }
    var tp = e.target.closest('[data-act-type]');
    if (tp) { actDraft.types[tp.dataset.actType] = !actDraft.types[tp.dataset.actType]; renderActForm(); return; }
    var tr = e.target.closest('[data-act-trigger]');
    if (tr) {
      var name = tr.getAttribute('data-act-trigger');
      actDraft.triggers[name] = !actDraft.triggers[name];
      renderActForm();
    }
  });
  $('actNote').addEventListener('input', function () { if (actDay) renderActForm(); });
  $('actTime').addEventListener('change', function () { if (actDay) renderActForm(); });
  $('actTime').addEventListener('input', function () { if (actDay) paintActWhen(); });
  if ($('actWhenBtn')) $('actWhenBtn').addEventListener('click', openTimePicker);
  $('btnSaveAct').addEventListener('click', saveAct);
  $('dayClose').addEventListener('click', closeDay);
  $('dayMask').addEventListener('click', function (e) { if (e.target === this) closeDay(); });
  $('dayBody').addEventListener('click', function (e) {
    if (e.target.closest('#btnOpenActFromDay')) { openAct(dayKey); return; }
    if (e.target.closest('#btnClearDayCheckin')) { clearDayCheckin(); return; }
    if (e.target.closest('.h-del') || e.target.closest('[data-edit]')) onHistoryClick(e);
  });

  function relapseItem(r) {
    var tags = typeChips(r.types);
    var trigs = (r.triggers || []).map(function (t) { return '<span>' + esc(t === '其他' && r.other ? '其他：' + r.other : t) + '</span>'; }).join('');
    var primary = (normalizeTypes(r.types)[0]) || '';
    return '<div class="h-item relapse" data-type="' + esc(primary) + '"><div class="h-ico">' + ic(primary && typeById(primary) ? typeById(primary).icon : 'cloud-rain') + '</div><div class="h-main"><b>破戒记录</b>' +
      (r.streakMs ? '<span class="small muted"> · 本次坚持 ' + fmtDays(r.streakMs) + ' 天</span>' : '') +
      '<div class="small muted">' + fmtWhen(r.ts) + '</div>' +
      (tags ? '<div class="h-tags">' + tags + '</div>' : '') +
      (trigs ? '<div class="h-tags">' + trigs + '</div>' : '') +
      (r.note ? '<div class="small" style="margin-top:4px">' + esc(r.note) + '</div>' : '') +
      '</div><div class="h-actions"><button class="h-edit" type="button" data-edit="relapse" data-id="' + esc(r.id) + '" aria-label="编辑">' + ic('pen-line') + '</button>' +
      '<button class="h-del" type="button" data-del="relapse" data-id="' + esc(r.id) + '" aria-label="删除">' + ic('x') + '</button></div></div>';
  }

  function openRelapseEditor(id) {
    var r = null;
    for (var i = 0; i < state.relapses.length; i++) if (state.relapses[i].id === id) r = state.relapses[i];
    if (!r) return;
    var typeMap = {};
    normalizeTypes(r.types).forEach(function (t) { typeMap[t] = true; });
    var trigMap = {};
    (r.triggers || []).forEach(function (t) { trigMap[t] = true; });
    openModal({
      title: '编辑这条记录',
      html: '<p class="small muted">保存后按当前规则重算连续天数。</p>' +
        '<label class="field"><span>发生时间</span><input type="datetime-local" id="edTime" value="' + toLocalInput(r.ts) + '" max="' + toLocalInput(Date.now() + 60000) + '" /></label>' +
        '<div class="field"><span>类型（可多选）</span><div class="tags" id="edTypes">' + typeButtons(typeMap, 'data-ed-type') + '</div></div>' +
        '<div class="field"><span>触发因素（可多选）</span><div class="tags" id="edTriggers">' + D.triggers.map(function (t) {
          return '<button type="button" class="tag' + (trigMap[t] ? ' sel' : '') + '" data-ed-trigger="' + esc(t) + '">' + esc(t) + '</button>';
        }).join('') + '</div>' +
        '<input type="text" id="edOther" class="' + (trigMap['其他'] ? '' : 'hidden') + '" maxlength="20" placeholder="其他触发因素" value="' + esc(r.other || '') + '" /></div>' +
        '<label class="field"><span>备注 / 复盘</span><textarea id="edNote" rows="3" maxlength="500">' + esc(r.note || '') + '</textarea></label>',
      ok: '保存修改',
      onOk: function () {
        var ts = parseLocalInput($('edTime').value);
        if (!isFinite(ts)) { toast('请选择有效的时间'); return false; }
        if (ts > Date.now() + 60000) { toast('时间不能晚于现在'); return false; }
        var types = selectedTypes(readTagMap($('edTypes'), 'data-ed-type'));
        if (!types.length) { toast('请至少选择一个类型'); return false; }
        var trigSel = readTagMap($('edTriggers'), 'data-ed-trigger');
        var triggers = D.triggers.filter(function (t) { return trigSel[t]; });
        var other = trigSel['其他'] ? $('edOther').value.trim() : '';
        var note = $('edNote').value.trim();
        r.ts = ts;
        r.types = types;
        r.triggers = triggers;
        r.other = other;
        r.note = note;
        r.streakMs = endedStreakMs(ts, types, r.id);
        r.editedAt = Date.now();
        var changed = applyStreak(true);
        save();
        if (dayKey) renderDaySheet();
        renderHistory();
        if (current === 'home') renderHome();
        toast(changed ? '已更新，天数已重算' : '已更新');
      }
    });
  }

  function renderHistory() {
    var items = state.relapses.map(function (r) { return { type: 'relapse', ts: r.ts, r: r }; })
      .concat(state.urges.map(function (u) { return { type: 'urge', ts: u.ts, r: u }; }))
      .concat(Object.keys(state.checkins).map(function (k) {
        var c = state.checkins[k];
        return { type: 'checkin', ts: c.ts || Date.parse(k + 'T12:00:00'), k: k, r: c };
      }))
      .sort(function (a, b) { return b.ts - a.ts; });
    $('historyCount').textContent = '共 ' + items.length + ' 条';
    if (!items.length) { $('historyList').innerHTML = emptyState('notebook', '还没有记录'); return; }
    $('historyList').innerHTML = items.slice(0, 80).map(function (it) {
      var r = it.r;
      if (it.type === 'urge') {
        return '<div class="h-item urge"><div class="h-ico">' + ic('circle') + '</div><div class="h-main"><b>' + esc(t('urge.resisted')) + '</b><div class="small muted">' + fmtWhen(r.ts) + '</div></div>' +
          '<div class="h-actions"><button class="h-del" type="button" data-del="urge" data-id="' + esc(r.id) + '" aria-label="删除">' + ic('x') + '</button></div></div>';
      }
      if (it.type === 'checkin') {
        var m = D.moods.filter(function (x) { return x.v === r.mood; })[0] || D.moods[2];
        return '<div class="h-item checkin"><div class="h-ico">' + ic(m.icon) + '</div><div class="h-main"><b>打卡 · ' + esc(m.t) + '</b>' +
          '<div class="small muted">' + esc(it.k) + '</div>' +
          (r.note ? '<div class="small" style="margin-top:4px">' + esc(r.note) + '</div>' : '') +
          '</div><div class="h-actions"><button class="h-edit" type="button" data-edit="checkin" data-date="' + esc(it.k) + '" aria-label="编辑">' + ic('pen-line') + '</button>' +
          '<button class="h-del" type="button" data-del="checkin" data-date="' + esc(it.k) + '" aria-label="删除">' + ic('x') + '</button></div></div>';
      }
      return relapseItem(r);
    }).join('');
  }
  function onHistoryClick(e) {
    var edit = e.target.closest('[data-edit]');
    if (edit) {
      if (edit.dataset.edit === 'relapse') openRelapseEditor(edit.dataset.id);
      else if (edit.dataset.edit === 'checkin') {
        if (dayKey === edit.dataset.date) openAct(edit.dataset.date);
        else openDay(edit.dataset.date);
      }
      return;
    }
    var b = e.target.closest('.h-del'); if (!b) return;
    var type = b.dataset.del, id = b.dataset.id;
    if (type === 'checkin') {
      var dk = b.dataset.date;
      openModal({
        title: '删除这天的打卡？',
        html: '<p>去掉 ' + esc(dk) + ' 的心情，不能撤销。</p>',
        ok: '删除', danger: true,
        onOk: function () {
          delete state.checkins[dk];
          state.removed.checkins[dk] = Date.now();
          if (dayKey === dk) renderDaySheet();
          save(); renderHistory();
          if (current === 'home') renderHome();
          toast('已删除');
        }
      });
      return;
    }
    openModal({
      title: '删除这条记录？',
      html: '<p>删除后不能恢复。' + (type === 'relapse' ? '会按剩下的记录重算天数。' : '') + '</p>',
      ok: '删除', danger: true,
      onOk: function () {
        var arr = type === 'relapse' ? state.relapses : state.urges;
        var i = arr.findIndex(function (x) { return x.id === id; });
        if (i >= 0) arr.splice(i, 1);
        state.removed.ids[id] = Date.now();
        if (type === 'relapse') applyStreak(true);
        save();
        if (dayKey) renderDaySheet();
        renderHistory();
        if (current === 'home') renderHome();
        toast('已删除');
      }
    });
  }
  $('historyList').addEventListener('click', onHistoryClick);

  /* ---------------- 统计 ---------------- */
  var BUCKETS = [['凌晨', 0], ['清晨', 4], ['上午', 8], ['下午', 12], ['傍晚', 16], ['夜间', 20]];
  function bucketOf(ts) { return Math.floor(new Date(ts).getHours() / 4); }

  function hbars(rows, cls, raw, mode) {
    var vals = rows.map(function (r) { return r[1]; });
    var max = Math.max.apply(null, vals.concat([1]));
    var sum = vals.reduce(function (a, b) { return a + b; }, 0) || 1;
    return rows.map(function (r) {
      var w = mode === 'share' ? (r[1] / sum * 100) : (r[1] / max * 100);
      return '<div class="hbar"><span class="hbar-l">' + (raw ? r[0] : esc(r[0])) + '</span><div class="hbar-track"><div class="hbar-fill ' + (cls || '') + '" style="width:' + w.toFixed(1) + '%"></div></div><span class="hbar-n">' + r[1] + '</span></div>';
    }).join('');
  }

  function renderStats() {
    var u = state.urges.length, r = state.relapses.length;
    if ($('stRelapses')) $('stRelapses').textContent = r;
    if ($('stTotal')) $('stTotal').textContent = dayText(totalCleanMs());
    if ($('stCurrent')) $('stCurrent').textContent = dayText(curMs());
    if ($('stRate')) $('stRate').textContent = (u + r) ? Math.round(u / (u + r) * 100) + '%' : '—';

    // 触发因素
    var tc = {};
    state.relapses.forEach(function (x) { x.triggers.forEach(function (t) { tc[t] = (tc[t] || 0) + 1; }); });
    var trows = Object.keys(tc).map(function (k) { return [k, tc[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    $('triggerChart').innerHTML = trows.length ? hbars(trows, '', false, 'share') : emptyState('zap', '还没有数据');

    // 时段分布（SVG 分组柱状图）
    var rb = [0, 0, 0, 0, 0, 0], ub = [0, 0, 0, 0, 0, 0];
    state.relapses.forEach(function (x) { rb[bucketOf(x.ts)]++; });
    state.urges.forEach(function (x) { ub[bucketOf(x.ts)]++; });
    var max = Math.max.apply(null, rb.concat(ub).concat([1]));
    var W = 340, H = 170, top = 16, bottom = 40, chartH = H - top - bottom, gw = W / 6, bw = 16;
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="时段分布图">';
    for (var g = 0; g <= 2; g++) { var gy = top + chartH * g / 2; svg += '<line x1="0" x2="' + W + '" y1="' + gy + '" y2="' + gy + '" class="grid" stroke-dasharray="3 4"/>'; }
    BUCKETS.forEach(function (b, i) {
      var cx = gw * i + gw / 2;
      [[rb[i], 'bar-rel', cx - bw - 2], [ub[i], 'bar-urge', cx + 2]].forEach(function (bar) {
        var h = bar[0] / max * chartH, y = top + chartH - h;
        if (bar[0]) {
          svg += '<rect x="' + bar[2] + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="0" class="' + bar[1] + '"/>';
          svg += '<text x="' + (bar[2] + bw / 2) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="10" class="val">' + bar[0] + '</text>';
        }
      });
      svg += '<text x="' + cx + '" y="' + (H - 22) + '" text-anchor="middle" font-size="12" class="lbl">' + b[0] + '</text>';
      svg += '<text x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="9" class="sub">' + b[1] + '-' + (b[1] + 4) + '点</text>';
    });
    svg += '</svg>';
    $('timeChart').innerHTML = svg;

    // 心情
    var mc = {};
    Object.keys(state.checkins).forEach(function (k) { var m = state.checkins[k].mood; mc[m] = (mc[m] || 0) + 1; });
    var mrows = D.moods.map(function (m) { return ['<span class="mood-tint" data-mood="' + m.v + '">' + ic(m.icon) + '</span>' + m.t, mc[m.v] || 0]; });
    $('moodChart').innerHTML = Object.keys(mc).length ? hbars(mrows, 'mint', true) : emptyState('smile', '还没有打卡');

    // 建议
    var ins = [];
    if (r) {
      var peak = rb.indexOf(Math.max.apply(null, rb));
      ins.push(['clock', '高风险时段：<b>' + BUCKETS[peak][0] + ' ' + BUCKETS[peak][1] + '–' + (BUCKETS[peak][1] + 4) + ' 点</b>']);
    }
    if (trows.length) ins.push(['target', '最常见触发：<b>' + esc(trows[0][0]) + '</b>']);
    if (u) ins.push(['shield-check', '已抵御 <b>' + u + '</b> 次']);
    var w = milestoneWindow(curMs() / DAY);
    ins.push(['sprout', '已戒 <b>' + fmtDays(curMs()) + '</b> 天，下一档 <b>' + w.next + '</b> 天']);
    $('insights').innerHTML = ins.map(function (x) { return '<div class="insight"><span class="e">' + ic(x[0]) + '</span><div>' + x[1] + '</div></div>'; }).join('');
  }

  /* ---------------- 外观（浅色 / 深色 / 跟随系统） ---------------- */
  var THEME_KEY = 'zenflow_theme';
  var THEME_COLOR = { light: '#ffffff', dark: '#000000' };
  var sysDark = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function getTheme() {
    try { var t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : 'system'; } catch (e) { return 'system'; }
  }
  function applyTheme(t, animate) {
    var root = document.documentElement;
    if (animate && !(reduceMotion && reduceMotion.matches)) {
      root.classList.add('theme-anim');
      clearTimeout(applyTheme._t);
      applyTheme._t = setTimeout(function () { root.classList.remove('theme-anim'); }, 450);
    }
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
    // 根背景内联色（与首帧脚本一致）：手动主题时固定为主题色，跟随系统时交给 CSS
    root.style.backgroundColor = t === 'system' ? '' : THEME_COLOR[t];
    root.style.colorScheme = t === 'system' ? '' : t;
    // 让 Safari 工具栏/状态栏与表单控件配色一致
    var ml = document.getElementById('metaThemeLight'), md = document.getElementById('metaThemeDark'), mc = document.getElementById('metaColorScheme');
    if (ml) ml.setAttribute('content', t === 'system' ? THEME_COLOR.light : THEME_COLOR[t]);
    if (md) md.setAttribute('content', t === 'system' ? THEME_COLOR.dark : THEME_COLOR[t]);
    if (mc) mc.setAttribute('content', t === 'system' ? 'light dark' : t);
    renderThemeControl();
    updateSettingsChrome();
  }
  function setTheme(t, animate) {
    if (t !== 'light' && t !== 'dark') t = 'system';
    try { if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (e) {}
    applyTheme(t, animate);
  }
  function renderThemeControl() {
    var t = getTheme();
    document.querySelectorAll('#themeSeg .seg-btn').forEach(function (b) {
      var on = b.dataset.themeOpt === t;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    var isDark = t === 'dark' || (t === 'system' && sysDark && sysDark.matches);
    if ($('themeHint')) $('themeHint').textContent = t === 'system' ? ('当前系统：' + (isDark ? '深色' : '浅色')) : '';
  }
  ['themeSeg'].forEach(function (id) {
    var el = $(id); if (!el) return;
    el.addEventListener('click', function (e) {
      var b = e.target.closest('.seg-btn'); if (!b) return;
      setTheme(b.dataset.themeOpt, true);
    });
  });
  // 跟随系统时实时响应系统外观变化（CSS 自动切换，这里更新提示文字）
  if (sysDark) {
    var onSys = function () { if (getTheme() === 'system') applyTheme('system', true); };
    if (sysDark.addEventListener) sysDark.addEventListener('change', onSys); else if (sysDark.addListener) sysDark.addListener(onSys);
  }

  /* ---------------- 设置（二级菜单） ---------------- */
  var SETTINGS_PAGES = {
    account: '账号与资料',
    goal: '目标天数',
    resets: '重置规则',
    theme: '外观',
    reasons: '理由',
    data: '数据',
    about: '关于'
  };
  var settingsView = 'root';
  function settingsViewFromHash() {
    var m = (location.hash || '').match(/^#settings(?:\/([a-z]+))?$/);
    if (!m) return null;
    if (!m[1]) return 'root';
    if (m[1] === 'privacy') return 'data';
    return SETTINGS_PAGES[m[1]] ? m[1] : 'root';
  }
  function applySettingsDom() {
    var isRoot = settingsView === 'root';
    if ($('settingsRoot')) $('settingsRoot').classList.toggle('hidden', !isRoot);
    document.querySelectorAll('.settings-page').forEach(function (p) {
      p.classList.toggle('hidden', p.dataset.settingsPage !== settingsView);
    });
    if ($('settingsBack')) $('settingsBack').classList.toggle('hidden', isRoot);
    if ($('settingsMe')) $('settingsMe').classList.toggle('hidden', !isRoot);
    var settingsScreen = $('screen-settings');
    if (settingsScreen) settingsScreen.classList.toggle('settings-root', isRoot);
    if ($('settingsTitle')) $('settingsTitle').textContent = isRoot ? '设置' : (SETTINGS_PAGES[settingsView] || '设置');
  }
  function showSettings(view, opts) {
    opts = opts || {};
    if (view !== 'root' && !SETTINGS_PAGES[view]) view = 'root';
    settingsView = view;
    applySettingsDom();
    if (view === 'resets') renderResetToggles();
    if (view === 'goal') renderGoalControl();
    updateSettingsChrome();
    if (!opts.silent) {
      var hash = view === 'root' ? '#settings' : ('#settings/' + view);
      var url = location.pathname + location.search + hash;
      try {
        if (opts.replace) history.replaceState({ zfSettings: view, zfEntry: !!opts.entry }, '', url);
        else history.pushState({ zfSettings: view }, '', url);
      } catch (e) {}
    }
    window.scrollTo(0, 0);
  }
  function backSettings() {
    if (settingsView === 'root') return;
    if (history.state && history.state.zfSettings && history.state.zfSettings !== 'root' && !history.state.zfEntry) {
      history.back();
      return;
    }
    showSettings('root', { replace: true });
  }
  function renderResetToggles() {
    var box = $('resetTypeList'); if (!box) return;
    box.innerHTML = lapseTypes().map(function (t) {
      var on = !!state.resetTypes[t.id];
      var locked = t.id === 'masturbation';
      return '<div class="reset-row" data-type="' + t.id + '"><span class="type-ico">' + ic(t.icon) + '</span><div class="reset-copy"><b>' + esc(t.label) + '</b><p>' +
        (locked ? '不能关闭' : (on ? '重置天数' : '不重置天数')) +
        '</p></div><button type="button" class="switch' + (on ? ' on' : '') + (locked ? ' locked' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(t.label) + '：重置戒色天数" data-reset-type="' + t.id + '"' + (locked ? ' disabled' : '') + '><span class="switch-knob"></span></button></div>';
    }).join('');
  }
  function updateSettingsChrome() {
    if (!state) return;
    var st = window.ZFCloud && window.ZFCloud.status && window.ZFCloud.status();
    if ($('settingsAdminRow')) $('settingsAdminRow').classList.toggle('hidden', !(st && st.profile && st.profile.is_admin));
    if ($('settingsLogoutRow')) $('settingsLogoutRow').classList.toggle('hidden', !(st && st.loggedIn));
    if ($('privacyDeleteRow')) $('privacyDeleteRow').classList.toggle('hidden', !(st && st.loggedIn));
    if ($('settingsAccountSub')) {
      var acct = '本机模式';
      if (st && st.configured) {
        if (st.loggedIn) {
          var handle = st.profile && st.profile.handle;
          var phone = st.phone ? (String(st.phone).charAt(0) === '+' ? st.phone : ('+' + st.phone)) : '';
          acct = handle ? ('@' + handle) : (st.email || phone || '已登录');
        } else acct = '未登录';
      }
      $('settingsAccountSub').textContent = acct;
    }
    if ($('settingsGoalSub')) $('settingsGoalSub').textContent = (state.goalDays || 30) + ' 天';
    if ($('settingsStartSub')) $('settingsStartSub').textContent = fmtWhen(state.streakStart);
    if ($('settingsResetSub')) $('settingsResetSub').textContent = resetSummary();
    if ($('settingsThemeSub')) {
      var theme = getTheme();
      $('settingsThemeSub').textContent = theme === 'light' ? '浅色' : theme === 'dark' ? '深色' : '跟随系统';
    }
    if ($('settingsReasonSub')) $('settingsReasonSub').textContent = state.reasons.length + ' 条';
  }
  function renderSettings() {
    applySettingsDom();
    renderGoalControl();
    renderResetToggles();
    renderThemeControl();
    $('reasonsEdit').innerHTML = state.reasons.length
      ? state.reasons.map(function (r, i) { return '<li><span>' + esc(r) + '</span><button data-i="' + i + '" aria-label="删除">' + ic('x') + '</button></li>'; }).join('')
      : '<li class="muted"><span>还没有理由</span></li>';
    updateSettingsChrome();
  }
  if ($('settingsRoot')) $('settingsRoot').addEventListener('click', function (e) {
    var row = e.target.closest('[data-settings]');
    if (!row) return;
    showSettings(row.dataset.settings);
  });
  if ($('settingsBack')) $('settingsBack').addEventListener('click', backSettings);
  if ($('resetTypeList')) $('resetTypeList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-reset-type]');
    if (!b || b.disabled) return;
    var id = b.getAttribute('data-reset-type');
    if (id === 'masturbation') return;
    state.resetTypes[id] = !state.resetTypes[id];
    state.resetTypes.masturbation = true;
    state.resetTypesSetAt = Date.now();
    var changed = applyStreak(true);
    save();
    renderResetToggles();
    updateSettingsChrome();
    if (current === 'home') renderHome();
    toast(changed ? '已更新，天数已重算' : '已更新');
  });
  window.addEventListener('popstate', function () {
    if ((location.hash || '') === '#admin') return;
    var v = settingsViewFromHash();
    if (v) {
      settingsView = v;
      if (current !== 'settings') go('settings');
      else applySettingsDom();
      if (v === 'resets') renderResetToggles();
      updateSettingsChrome();
      return;
    }
    if (current === 'settings' && settingsView !== 'root') {
      settingsView = 'root';
      applySettingsDom();
      updateSettingsChrome();
    }
  });
  function addReason() {
    var v = $('reasonInput').value.trim();
    if (!v) { toast('请输入内容'); return; }
    state.reasons.push(v);
    if (state.removed.reasons[v] > 0) state.removed.reasons[v] = -Date.now();
    save();
    $('reasonInput').value = ''; renderSettings(); toast('已添加');
  }
  $('btnAddReason').addEventListener('click', addReason);
  $('reasonInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') addReason(); });
  $('reasonsEdit').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-i]'); if (!b) return;
    var gone = state.reasons.splice(+b.dataset.i, 1)[0];
    if (gone != null && state.reasons.indexOf(gone) < 0) state.removed.reasons[gone] = Date.now();
    save(); renderSettings();
  });

  $('btnImport').addEventListener('click', function () { $('importFile').click(); });
  $('importFile').addEventListener('change', function () {
    var f = this.files[0]; this.value = '';
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed, importedTheme = null;
      try {
        var obj = JSON.parse(reader.result);
        parsed = sanitize(obj && obj.data ? obj.data : obj);
        // 新版备份附带外观设置；旧备份没有该字段，保持当前外观不变
        if (obj && obj.settings && /^(system|light|dark)$/.test(obj.settings.theme)) importedTheme = obj.settings.theme;
      } catch (e) { toast('导入失败：' + (e.message || '文件无法解析')); return; }
      openModal({
        title: '导入数据？',
        html: '<p>' + Object.keys(parsed.checkins).length + ' 次打卡，' + parsed.urges.length + ' 次抵御，' + parsed.relapses.length + ' 条破戒。会覆盖当前记录。</p>',
        ok: '覆盖导入',
        onOk: function () { state = parsed; state.streakStartSetAt = Date.now(); save({ replaceAll: true }); if (importedTheme) setTheme(importedTheme, true); renderSettings(); toast('导入成功'); }
      });
    };
    reader.readAsText(f);
  });
  $('btnReset').addEventListener('click', function () {
    openModal({
      title: '重置本机数据？',
      html: '<p>会清空打卡、记录和理由。登录时会覆盖云端。输入「重置」确认。</p><input type="text" id="resetConfirm" placeholder="重置" />',
      ok: '确认重置', danger: true,
      onOk: function () {
        if ($('resetConfirm').value.trim() !== '重置') { toast('请输入「重置」'); return false; }
        state = defaultState(); save({ replaceAll: true });
        calOffset = 0;
        if (actDay) closeAct();
        if (dayKey) closeDay();
        renderSettings(); toast('已重置');
      }
    });
  });

  /* ---------------- 启动 ---------------- */
  load();
  applyTheme(getTheme(), false);
  var lastDay = dateKey(Date.now());
  setInterval(function () {
    if (current === 'home') {
      updateTimer();
      var k = dateKey(Date.now());
      if (k !== lastDay) { lastDay = k; renderHome(); }
    }
  }, 1000);
  applyNewCopy();
  renderHome();
  var bootSettings = settingsViewFromHash();
  if (bootSettings) {
    settingsView = bootSettings;
    go('settings');
    try {
      history.replaceState({ zfSettings: bootSettings, zfEntry: true }, '', location.pathname + location.search + (bootSettings === 'root' ? '#settings' : '#settings/' + bootSettings));
    } catch (e) {}
  }

  // PWA：仅在 http(s) 下启用，避免 file:// 打开时报错
  if (/^https?:$/.test(location.protocol)) {
    var link = document.createElement('link');
    link.rel = 'manifest'; link.href = 'manifest.json';
    document.head.appendChild(link);
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function (e) { console.warn('SW 注册失败', e); });
      });
    }
  }

  /* ---------------- 版本信息（设置 → 关于，便于排查缓存问题） ---------------- */
  var APP_VERSION = '37';
  var DESKTOP_MQ = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : null;
  function renderVersion() {
    var el = $('appVersion'); if (!el) return;
    var cssV = (getComputedStyle(document.documentElement).getPropertyValue('--zf-css') || '').replace(/["'\s]/g, '');
    var layout = getComputedStyle($('tabbar')).position === 'sticky' ? '桌面布局' : '手机布局';
    el.textContent = '版本 v' + APP_VERSION + ' · 样式 ' + (cssV ? 'v' + cssV : '未知') + (cssV && cssV !== APP_VERSION ? '（样式为旧版本，请强制刷新）' : '') +
      ' · ' + layout + ' · 窗口宽度 ' + window.innerWidth + 'px';
  }
  renderVersion();
  window.addEventListener('resize', function () { clearTimeout(renderVersion._t); renderVersion._t = setTimeout(renderVersion, 150); });
  if (DESKTOP_MQ) { if (DESKTOP_MQ.addEventListener) DESKTOP_MQ.addEventListener('change', renderVersion); else if (DESKTOP_MQ.addListener) DESKTOP_MQ.addListener(renderVersion); }

  // 便于测试
  window.ZenFlow = { version: APP_VERSION, go: go, state: function () { return state; }, setTheme: setTheme, getTheme: getTheme };

  // 供 cloud.js 使用的接口（云端模块不直接改内部变量）
  window.ZenFlowCore = {
    getState: function () { return JSON.parse(JSON.stringify(state)); },
    sanitize: sanitize,
    defaultState: defaultState,
    // 用云端合并结果替换本地状态并刷新当前页面（不会再次触发上传）
    replaceState: function (s) {
      state = sanitize(s);
      save({ fromCloud: true });
      if (dayKey && $('dayMask') && !$('dayMask').classList.contains('hidden')) renderDaySheet();
      if (current === 'sos' && $('sosEnd') && $('sosEnd').classList.contains('active')) showUrgeEnd();
      else if (current !== 'sos') render(current);
      updateSettingsChrome();
    },
    updateSettingsChrome: updateSettingsChrome,
    setLocalProfile: function (patch) {
      patch = patch || {};
      if (Object.prototype.hasOwnProperty.call(patch, 'displayName')) {
        state.displayName = String(patch.displayName || '').trim().slice(0, 20);
        state.displayNameSetAt = Date.now();
      }
      if (Object.prototype.hasOwnProperty.call(patch, 'avatarDataUrl')) {
        var url = String(patch.avatarDataUrl || '');
        if (url && (url.indexOf('data:image/') !== 0 || url.length > 180000)) return false;
        state.avatarDataUrl = url;
        state.avatarSetAt = Date.now();
      }
      save();
      refreshChrome();
      if (current === 'settings') updateSettingsChrome();
      return true;
    },
    toast: toast, openModal: openModal, closeModal: closeModal, lockScroll: lockScroll, unlockScroll: unlockScroll,
    esc: esc, ic: ic, fmtDT: fmtDT, current: function () { return current; },
    wipeLocal: function () {
      state = defaultState();
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
      setTheme('system', false);
      calOffset = 0;
      if (actDay) closeAct();
      if (dayKey) closeDay();
      if (current === 'sos') { resetSos(); current = 'home'; }
      document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.dataset.screen === current); });
      var tabs = document.querySelectorAll('#tabbar .tab');
      tabs.forEach(function (b) {
        var on = b.dataset.tab === current;
        b.classList.toggle('active', on);
        if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      });
      var bar = $('tabbar'); if (bar) bar.dataset.active = current;
      settingsView = 'root';
      render(current);
      renderSettings();
    }
  };
})();
