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
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function ic(name, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function fmtDays(ms) { var d = ms / DAY; return d >= 10 ? Math.floor(d) + '' : (Math.floor(d * 10) / 10) + ''; }
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
      reasons: D.defaultReasons.slice(),
      goalDays: 30,
      goalSetAt: 0,
      displayName: '',
      displayNameSetAt: 0,
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
    catch (e) { toast('保存失败：浏览器存储不可用'); }
    // 已登录时通知云同步模块（未配置云端时 ZFCloud 不存在，行为与以前完全相同）
    if (!(opts && opts.fromCloud) && window.ZFCloud && window.ZFCloud.onLocalChange) window.ZFCloud.onLocalChange(opts && opts.replaceAll);
  }

  function curMs() { return Math.max(0, Date.now() - state.streakStart); }
  function bestMs() { return Math.max(state.bestStreakMs, curMs()); }
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
    if (!relapseResets(types)) return '不会重置戒色天数，仍会显示在日历和时间轴上';
    var which = types.filter(function (id) { return state.resetTypes[id]; }).map(function (id) { return typeById(id).label; });
    return '会重置戒色天数（' + which.join('、') + '）';
  }
  function resetSummary() {
    var on = lapseTypes().filter(function (t) { return state.resetTypes[t.id]; });
    if (on.length === lapseTypes().length) return '全部类型都会重置';
    if (!on.length) return '只有自慰会重置';
    return on.map(function (t) { return t.label; }).join('、') + ' 会重置';
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
  function overlayOpen() {
    return ($('dayMask') && !$('dayMask').classList.contains('hidden')) || ($('modalMask') && !$('modalMask').classList.contains('hidden'));
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
    if (current === 'settings' && tab !== 'settings' && settingsView !== 'root') {
      settingsView = 'root';
      applySettingsDom();
      if (/^#settings/.test(location.hash) && location.hash !== '#admin') {
        try { history.replaceState(null, '', location.pathname + location.search); } catch (err) {}
      }
    }
    current = tab;
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
    var dayOpen = $('dayMask') && !$('dayMask').classList.contains('hidden');
    if (e.key === 'Escape') {
      if (modalOpen) { e.preventDefault(); closeModal(); return; }
      if (dayOpen) { e.preventDefault(); closeDay(); return; }
      if (current === 'settings' && settingsView !== 'root') { e.preventDefault(); backSettings(); }
      return;
    }
    if (modalOpen || dayOpen || (window.ZFAdmin && window.ZFAdmin.isOpen && window.ZFAdmin.isOpen()) || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    var map = { '1': 'home', '2': 'log', '3': 'stats', '4': 'settings', 's': 'sos', 'S': 'sos' };
    var dest = map[e.key];
    if (dest && dest !== current) { e.preventDefault(); go(dest); }
  });

  function render(tab) {
    if (tab === 'home') renderHome();
    else if (tab === 'sos') renderSosStart();
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
    var h = Math.floor(ms % DAY / 3600000), m = Math.floor(ms % 3600000 / 60000), s = Math.floor(ms % 60000 / 1000);
    $('daysNum').textContent = days;
    $('hNum').textContent = pad(h); $('mNum').textContent = pad(m); $('sNum').textContent = pad(s);
    var dFloat = ms / DAY;
    var goal = state.goalDays || 30;
    var p = goal > 0 ? Math.min(1, Math.max(0, dFloat / goal)) : 0;
    var ring = $('ringFg');
    if (ring) {
      ring.style.strokeDasharray = String(RING_LEN);
      ring.style.strokeDashoffset = (RING_LEN * (1 - p)).toFixed(2);
    }
    var bar = $('msBar');
    if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
    var pct = Math.round(p * 100);
    var left = goal - dFloat;
    if (p >= 1) $('nextMs').textContent = '已达成 ' + goal + ' 天目标';
    else $('nextMs').textContent = '目标 ' + goal + ' 天 · ' + (left >= 1 ? ('还差 ' + Math.ceil(left) + ' 天') : '还差不到 1 天') + ' · ' + pct + '%';
    var gauge = $('streakGauge');
    if (gauge) gauge.setAttribute('aria-label', '已戒 ' + days + ' 天，目标 ' + goal + ' 天，完成 ' + pct + '%');
    $('bestStreak').textContent = fmtDays(bestMs()) + '天';
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 5) return ['夜深了，早点休息', 'moon-star'];
    if (h < 11) return ['早上好', 'sunrise'];
    if (h < 14) return ['中午好', 'sun'];
    if (h < 18) return ['下午好', 'cloud-sun'];
    if (h < 23) return ['晚上好', 'sunset'];
    return ['夜深了，放下手机早点睡', 'moon'];
  }

  var selMood = null;
  var selCheckinTypes = {};
  var selCheckinTriggers = {};
  function renderHome() {
    var g = greeting();
    $('greeting').innerHTML = ic(g[1], 'tint-amber') + ' ' + g[0];
    $('startText').textContent = '开始于 ' + fmtDT(state.streakStart);
    $('urgeCountHome').textContent = state.urges.length;
    $('checkinCountHome').textContent = Object.keys(state.checkins).length;
    var now = new Date();
    $('todayDate').textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 星期' + '日一二三四五六'[now.getDay()];
    updateTimer();
    renderCheckin();
    renderCalendar();
    renderBadges();
    var dayIdx = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / DAY);
    $('dailyTip').textContent = D.tips[dayIdx % D.tips.length];
  }

  function shownMood() {
    var today = state.checkins[dateKey(Date.now())];
    if (selMood != null) return selMood;
    return today ? today.mood : null;
  }
  function renderCheckinTriggers() {
    var box = $('checkinTriggers'); if (!box) return;
    box.innerHTML = D.triggers.map(function (t) {
      return '<button type="button" class="tag' + (selCheckinTriggers[t] ? ' sel' : '') + '" data-ct="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('');
    if ($('checkinOther')) $('checkinOther').classList.toggle('hidden', !selCheckinTriggers['其他']);
  }
  function renderCheckin() {
    var k = dateKey(Date.now());
    var today = state.checkins[k];
    var moodNow = shownMood();
    $('moodPicker').innerHTML = D.moods.map(function (m) {
      return '<button type="button" class="mood' + (moodNow === m.v ? ' sel' : '') + '" data-mood="' + m.v + '"><span class="e">' + ic(m.icon) + '</span>' + m.t + '</button>';
    }).join('');
    $('checkinTypes').innerHTML = typeButtons(selCheckinTypes, 'data-ctype');
    var types = selectedTypes(selCheckinTypes);
    $('checkinRelapseExtra').classList.toggle('hidden', !types.length);
    if (types.length && $('checkinTime') && !$('checkinTime').value) $('checkinTime').value = toLocalInput(Date.now());
    renderCheckinTriggers();
    var moodChanged = !!(selMood && (!today || today.mood !== selMood));
    var moodNew = !!(selMood && !today);
    var hint = '';
    if (today && !moodChanged) {
      var saved = D.moods.filter(function (x) { return x.v === today.mood; })[0];
      hint = '今天的心情已记下' + (saved ? ' · ' + saved.t : '') + '。可以改心情，或再记一次破戒。';
    }
    if (types.length) hint = (hint ? hint + ' ' : '') + resetHint(types);
    $('checkinHint').textContent = hint;
    var can = moodChanged || moodNew || types.length > 0;
    $('btnCheckin').disabled = !can;
    var label = '选择心情或破戒类型';
    if (types.length && (moodNew || moodChanged)) label = relapseResets(types) ? '保存心情并记录破戒' : '保存心情，记录破戒（天数不变）';
    else if (types.length) label = relapseResets(types) ? '记录破戒并重新计算天数' : '记录破戒（天数不变）';
    else if (moodNew) label = '保存今日心情';
    else if (moodChanged) label = '更新今日心情';
    $('btnCheckin').innerHTML = (can ? ic('check') : '') + label;
    var todays = state.relapses.filter(function (r) { return dateKey(r.ts) === k; }).sort(function (a, b) { return a.ts - b.ts; });
    $('todayRelapseList').innerHTML = todays.length
      ? '<div class="today-rel"><p class="field-label">今天已记录的破戒</p>' + todays.map(function (r) {
          return '<button type="button" class="h-item relapse" data-open-day="' + k + '" data-type="' + esc((normalizeTypes(r.types)[0]) || '') + '"><div class="h-ico">' + ic((normalizeTypes(r.types)[0] && typeById(normalizeTypes(r.types)[0])) ? typeById(normalizeTypes(r.types)[0]).icon : 'cloud-rain') + '</div><div class="h-main"><b>' + (typeChips(r.types) || '破戒') + '</b><div class="small muted">' + fmtDT(r.ts) + (relapseResets(r.types) ? ' · 会重置天数' : ' · 不重置天数') + '</div></div></button>';
        }).join('') + '<button type="button" class="btn-link" data-open-day="' + k + '">查看今天的线性图</button></div>'
      : (today ? '<p class="small" style="margin-top:10px"><button type="button" class="btn-link" data-open-day="' + k + '">查看今天的线性图</button></p>' : '');
  }
  $('moodPicker').addEventListener('click', function (e) {
    var b = e.target.closest('.mood'); if (!b) return;
    selMood = +b.dataset.mood; renderCheckin();
  });
  $('checkinTypes').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ctype]'); if (!b) return;
    selCheckinTypes[b.dataset.ctype] = !selCheckinTypes[b.dataset.ctype];
    renderCheckin();
  });
  $('checkinTriggers').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ct]'); if (!b) return;
    selCheckinTriggers[b.dataset.ct] = !selCheckinTriggers[b.dataset.ct];
    renderCheckinTriggers();
  });
  $('checkinCard').addEventListener('click', function (e) {
    var open = e.target.closest('[data-open-day]');
    if (open) openDay(open.dataset.openDay);
  });
  function saveTodayCheckin(opts) {
    opts = opts || {};
    var k = dateKey(Date.now());
    var types = selectedTypes(selCheckinTypes);
    var today = state.checkins[k];
    var moodChanged = !!(selMood && (!today || today.mood !== selMood));
    if (!moodChanged && !types.length) { toast('先选择心情，或选择破戒类型'); return; }
    var relapse = null;
    if (types.length) {
      var ts = parseLocalInput($('checkinTime').value);
      if (!isFinite(ts)) { toast('请选择发生时间'); return; }
      if (ts > Date.now() + 60000) { toast('时间不能晚于现在'); return; }
      if (dateKey(ts) !== k) { toast('打卡里的破戒请记在今天。其他日期请点日历。'); return; }
      var triggers = D.triggers.filter(function (t) { return selCheckinTriggers[t]; });
      relapse = {
        ts: ts, types: types, triggers: triggers,
        other: selCheckinTriggers['其他'] ? $('checkinOther').value.trim() : '',
        note: $('checkinNote').value.trim()
      };
    }
    function write() {
      if (moodChanged) {
        var row = { mood: selMood, ts: (today && today.ts) || Date.now(), editedAt: Date.now() };
        if (today && today.note) row.note = today.note;
        state.checkins[k] = row;
        if (state.removed.checkins[k] > 0) state.removed.checkins[k] = -Date.now();
      }
      var result = null;
      if (relapse) result = commitRelapse(relapse);
      else save();
      selCheckinTypes = {}; selCheckinTriggers = {};
      if ($('checkinOther')) $('checkinOther').value = '';
      if ($('checkinNote')) $('checkinNote').value = '';
      if ($('checkinTime')) $('checkinTime').value = '';
      renderHome();
      if (result && result.changed) toast(result.resets ? '已记录。连续天数已重新计算' : '已记录，连续天数不变');
      else if (result) toast('已记录，连续天数不变');
      else toast(today ? '今日心情已更新' : '心情已记下');
    }
    if (relapse && relapseResets(relapse.types) && previewStart(relapse.ts, relapse.types) !== state.streakStart) {
      openModal({
        title: '这次会重置戒色天数',
        html: '<p>所选类型里有会重置天数的项。记录后，当前连续天数将从这次破戒重新计算，历史和最佳纪录都会保留。</p>',
        ok: '记录并重新计算', warm: true, onOk: write
      });
      return;
    }
    write();
  }
  $('btnCheckin').addEventListener('click', function () { saveTodayCheckin(); });

  var calOffset = 0;
  function renderCalendar() {
    var base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + calOffset);
    var y = base.getFullYear(), mo = base.getMonth();
    $('calTitle').textContent = y + '年' + (mo + 1) + '月';
    $('calNext').disabled = calOffset >= 0; $('calNext').style.opacity = calOffset >= 0 ? .35 : 1;
    var first = (new Date(y, mo, 1).getDay() + 6) % 7; // 周一为第一天
    var count = new Date(y, mo + 1, 0).getDate();
    var todayK = dateKey(Date.now());
    var typesByDay = {};
    var relapseDays = {};
    state.relapses.forEach(function (r) {
      var dk = dateKey(r.ts);
      relapseDays[dk] = true;
      normalizeTypes(r.types).forEach(function (id) {
        if (!typesByDay[dk]) typesByDay[dk] = [];
        if (typesByDay[dk].indexOf(id) < 0) typesByDay[dk].push(id);
      });
    });
    var html = '';
    for (var i = 0; i < first; i++) html += '<div class="cal-cell empty"></div>';
    for (var d = 1; d <= count; d++) {
      var k = y + '-' + pad(mo + 1) + '-' + pad(d);
      var cls = 'cal-cell';
      var c = state.checkins[k];
      var types = typesByDay[k] || [];
      if (c) cls += ' m' + c.mood;
      if (relapseDays[k]) cls += ' relapse';
      if (types.length) cls += ' has-types';
      if (types.length === 1) cls += ' one-type';
      if (k === todayK) cls += ' today';
      else if (k > todayK) cls += ' future';
      var names = types.map(function (id) { return typeById(id).label; });
      var title = k + (c ? ' 已打卡' : '') + (names.length ? ' · ' + names.join('、') : (relapseDays[k] ? ' · 有破戒记录' : ''));
      var marks = '';
      if (types.length) {
        marks = '<span class="cal-types">' + types.map(function (id) {
          var t = typeById(id);
          return '<span class="cal-mark" data-type="' + t.id + '" title="' + esc(t.label) + '">' + ic(t.icon) + '</span>';
        }).join('') + '</span>';
      } else if (relapseDays[k]) {
        marks = '<span class="cal-types"><span class="cal-mark legacy" title="破戒">' + ic('cloud-rain') + '</span></span>';
      }
      var future = k > todayK;
      var tag = future ? 'div' : 'button';
      html += '<' + tag + ' class="' + cls + '" ' + (future ? '' : 'type="button" data-date="' + k + '"') + ' title="' + esc(title) + '"><span class="cal-n">' + d + '</span>' + marks + '</' + tag + '>';
    }
    $('calGrid').innerHTML = html;
    $('calLegend').innerHTML = lapseTypes().map(function (t) {
      return '<span class="lg-item" data-type="' + t.id + '">' + ic(t.icon) + esc(t.label) + '</span>';
    }).join('') + '<span class="lg-item"><i class="lg lg-mood"></i>无类型时底色为心情</span>';
  }
  $('calPrev').addEventListener('click', function () { calOffset--; renderCalendar(); });
  $('calNext').addEventListener('click', function () { if (calOffset < 0) { calOffset++; renderCalendar(); } });
  $('calGrid').addEventListener('click', function (e) {
    var cell = e.target.closest('[data-date]');
    if (!cell) return;
    openDay(cell.dataset.date);
  });

  function renderBadges() {
    var cd = curMs() / DAY, bd = bestMs() / DAY;
    var nextSet = false, on = 0;
    $('badges').innerHTML = D.milestones.map(function (m) {
      var cls = 'badge', sub = m.name;
      if (cd >= m.days) { cls += ' on'; on++; }
      else if (!nextSet) { cls += ' next'; nextSet = true; sub = '下一个'; }
      else if (bd >= m.days) { sub = '曾达成'; }
      return '<div class="' + cls + '"><div class="b-ico">' + ic(m.icon) + '</div><span class="b-d">' + m.days + ' 天</span><span class="b-n">' + sub + '</span></div>';
    }).join('');
    $('badgeCount').textContent = '已解锁 ' + on + '/' + D.milestones.length;
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
  $('btnSetGoal').addEventListener('click', function () {
    openModal({
      title: '设置目标天数',
      html: '<p>圆环按已戒天数占目标的比例前进。例如 30 天或 90 天。</p>' +
        '<div class="tags" id="goalModalPresets">' + GOAL_PRESETS.map(function (n) {
          return '<button type="button" class="tag' + (state.goalDays === n ? ' sel' : '') + '" data-goal="' + n + '">' + n + ' 天</button>';
        }).join('') + '</div>' +
        '<input type="number" id="goalModalInput" min="1" max="3650" step="1" value="' + state.goalDays + '" />',
      ok: '保存',
      onOk: function () { return setGoal($('goalModalInput').value); }
    });
  });
  $('goalPresets').addEventListener('click', function (e) {
    var b = e.target.closest('[data-goal-preset]'); if (!b) return;
    setGoal(b.dataset.goalPreset);
  });
  $('btnSaveGoal').addEventListener('click', function () { setGoal($('goalInput').value); });

  $('btnAdjustStart').addEventListener('click', function () {
    openModal({
      title: '调整开始时间',
      html: '<p>如果你是之前就开始坚持的，可以在这里设置真实的开始时间。若这之后还有会重置天数的破戒，连续天数仍从最近的那一次算起。</p><input type="datetime-local" id="startInput" value="' + toLocalInput(state.streakStart) + '" max="' + toLocalInput(Date.now()) + '" />',
      ok: '保存',
      onOk: function () {
        var t = parseLocalInput($('startInput').value);
        if (!isFinite(t)) { toast('请选择有效的时间'); return false; }
        if (t > Date.now()) { toast('开始时间不能晚于现在'); return false; }
        state.manualStreakStart = t;
        state.manualStreakStartSetAt = Date.now();
        var changed = applyStreak(true);
        save(); renderHome();
        toast(changed && state.streakStart !== t ? '已保存。之后有会重置的破戒，连续天数从那次算起' : '开始时间已更新');
      }
    });
  });

  /* ---------------- SOS 急救 ---------------- */
  var BREATH = {
    box: { desc: '吸气 4 秒 · 屏息 4 秒 · 呼气 4 秒 · 屏息 4 秒，共 4 轮（约 64 秒）', rounds: 4,
      phases: [['吸气', 4, 'in'], ['屏息', 4, 'hold'], ['呼气', 4, 'out'], ['屏息', 4, 'hold']] },
    '478': { desc: '吸气 4 秒 · 屏息 7 秒 · 缓慢呼气 8 秒，共 4 轮（约 76 秒）', rounds: 4,
      phases: [['吸气', 4, 'in'], ['屏息', 7, 'hold'], ['呼气', 8, 'out']] }
  };
  var breathMode = 'box', breathTimer = null, sosLogged = false;

  function showSosStep(id) {
    document.querySelectorAll('.sos-step').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    window.scrollTo(0, 0);
  }
  function renderSosStart() { $('urgeCountSos').textContent = state.urges.length; }
  function resetSos() { stopBreath(); showSosStep('sosStart'); }

  document.querySelectorAll('#breathMode .seg-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      breathMode = b.dataset.mode;
      document.querySelectorAll('#breathMode .seg-btn').forEach(function (x) { x.classList.toggle('active', x === b); });
      $('breathDesc').textContent = BREATH[breathMode].desc;
    });
  });

  function stopBreath() { if (breathTimer) { clearTimeout(breathTimer); breathTimer = null; } }

  function startBreath() {
    stopBreath();
    sosLogged = false;
    showSosStep('sosBreath');
    var cfg = BREATH[breathMode];
    var seq = [['准备', 3, 'prep', 0]];
    for (var r = 1; r <= cfg.rounds; r++) cfg.phases.forEach(function (p) { seq.push([p[0], p[1], p[2], r]); });
    var total = seq.reduce(function (a, p) { return a + p[1]; }, 0);
    var circle = $('breathCircle');
    var idx = -1, left = 0, elapsed = 0;
    circle.style.transitionDuration = '0.6s';
    circle.style.transform = 'scale(.55)';
    var hints = { prep: '找一个舒服的姿势，放松肩膀', in: '用鼻子慢慢吸气，感受腹部鼓起', hold: '轻轻屏住呼吸，保持放松', out: '用嘴缓慢呼气，把紧张一起呼出去' };

    function nextPhase() {
      idx++;
      if (idx >= seq.length) { finishBreath(); return; }
      var p = seq[idx]; left = p[1];
      $('breathPhase').textContent = p[0];
      $('breathHint').textContent = hints[p[2]];
      $('breathRound').textContent = p[3] ? ('第 ' + p[3] + ' / ' + cfg.rounds + ' 轮') : '';
      if (p[2] === 'in' || p[2] === 'out') {
        circle.style.transitionDuration = p[1] + 's';
        circle.style.transform = p[2] === 'in' ? 'scale(1)' : 'scale(.55)';
      }
    }
    function tick() {
      if (left <= 0) nextPhase();
      if (idx >= seq.length) return;
      $('breathCount').textContent = left;
      $('breathBar').style.width = (elapsed / total * 100).toFixed(1) + '%';
      left--; elapsed++;
      breathTimer = setTimeout(tick, 1000);
    }
    tick();
  }
  function finishBreath() {
    stopBreath();
    $('breathBar').style.width = '100%';
    showActions();
  }

  function showActions() {
    showSosStep('sosActions');
    renderActionList();
    var q = pick(D.quotes);
    $('quoteText').textContent = '“' + q.q + '”';
    $('quoteSrc').textContent = '—— ' + q.s;
    $('reasonsView').innerHTML = state.reasons.length
      ? state.reasons.map(function (r) { return '<li>' + ic('sparkle', 'tint-blue') + '<span>' + esc(r) + '</span></li>'; }).join('')
      : '<li>' + ic('sparkle', 'tint-blue') + '<span>还没有写下理由 —— 可以在「设置」里添加对你重要的理由。</span></li>';
  }
  function renderActionList() {
    $('actionList').innerHTML = shuffle(D.actions).slice(0, 3).map(function (a) {
      return '<button class="action"><span class="e">' + ic(a.icon) + '</span><span>' + esc(a.t) + '</span></button>';
    }).join('');
  }
  $('actionList').addEventListener('click', function (e) {
    var b = e.target.closest('.action'); if (b) b.classList.toggle('done');
  });

  $('btnSosStart').addEventListener('click', startBreath);
  $('btnSkipBreath').addEventListener('click', finishBreath);
  $('btnRebreath').addEventListener('click', startBreath);
  $('btnShuffle').addEventListener('click', renderActionList);
  $('btnSosClose1').addEventListener('click', resetSos);
  $('btnSosClose2').addEventListener('click', resetSos);
  $('btnSosRelapse').addEventListener('click', function () { go('log'); });
  $('btnMadeIt').addEventListener('click', function () {
    if (!sosLogged) {
      state.urges.push({ id: uid(), ts: Date.now() });
      sosLogged = true; save();
    }
    $('urgeCountDone').textContent = state.urges.length;
    showSosStep('sosDone');
  });

  /* ---------------- 记录 ---------------- */
  var selTriggers = {};
  var selTypes = {};
  var dayKey = null;
  var dayDraft = { mood: null, note: '', types: {}, triggers: {}, time: '', relNote: '', other: '' };

  function selectedTypes(map) { return lapseTypes().filter(function (t) { return map[t.id]; }).map(function (t) { return t.id; }); }
  function renderTypeTags() {
    $('typeTags').innerHTML = typeButtons(selTypes, 'data-lapse');
    var types = selectedTypes(selTypes);
    if ($('logResetHint')) $('logResetHint').textContent = types.length ? resetHint(types) : '选择类型后，这里会说明这次会不会重置戒色天数。';
    if ($('btnLogRelapse')) $('btnLogRelapse').textContent = types.length && relapseResets(types) ? '记录并重新计算天数' : (types.length ? '记录破戒（天数不变）' : '记录破戒');
  }
  function renderLog() {
    if ($('relapseTime') && !$('relapseTime').value) $('relapseTime').value = toLocalInput(Date.now());
    if ($('relapseTime')) $('relapseTime').max = toLocalInput(Date.now() + 60000);
    renderTypeTags();
    renderTriggerTags();
    renderHistory();
  }
  function renderTriggerTags() {
    $('triggerTags').innerHTML = D.triggers.map(function (t) {
      return '<button type="button" class="tag' + (selTriggers[t] ? ' sel' : '') + '" data-t="' + t + '">' + esc(t) + '</button>';
    }).join('');
    $('otherTrigger').classList.toggle('hidden', !selTriggers['其他']);
  }
  $('typeTags').addEventListener('click', function (e) {
    var b = e.target.closest('[data-lapse]'); if (!b) return;
    selTypes[b.dataset.lapse] = !selTypes[b.dataset.lapse];
    renderTypeTags();
  });
  $('triggerTags').addEventListener('click', function (e) {
    var b = e.target.closest('.tag'); if (!b) return;
    var t = b.dataset.t; selTriggers[t] = !selTriggers[t];
    renderTriggerTags();
  });

  function refreshChrome() {
    if (window.ZFCloud && window.ZFCloud.refreshChrome) window.ZFCloud.refreshChrome();
  }
  function readTagMap(root, attr) {
    var map = {};
    if (!root) return map;
    root.querySelectorAll('[' + attr + '].sel').forEach(function (b) { map[b.getAttribute(attr)] = true; });
    return map;
  }

  function finishRelapseForm(ts, types, triggers, other, note, done) {
    function write() {
      var result = commitRelapse({ ts: ts, types: types, triggers: triggers, other: other, note: note });
      if (done) done(result);
      toast(result.changed ? '已记录，连续天数已重新计算' : '已记录，连续天数不变');
    }
    if (relapseResets(types) && previewStart(ts, types) !== state.streakStart) {
      openModal({
        title: '这次会重置戒色天数',
        html: '<p>记录后，当前连续天数将从这次破戒重新计算。历史记录和最佳纪录都会保留。一次失误不会抹去你之前的努力。</p>',
        ok: '记录并重新计算', warm: true, onOk: write
      });
      return;
    }
    write();
  }
  $('btnLogRelapse').addEventListener('click', function () {
    var ts = parseLocalInput($('relapseTime').value);
    if (!isFinite(ts)) { toast('请选择发生时间'); return; }
    if (ts > Date.now() + 60000) { toast('时间不能晚于现在'); return; }
    var types = selectedTypes(selTypes);
    if (!types.length) { toast('请至少选择一个类型'); return; }
    var triggers = D.triggers.filter(function (t) { return selTriggers[t]; });
    var other = selTriggers['其他'] ? $('otherTrigger').value.trim() : '';
    var note = $('relapseNote').value.trim();
    finishRelapseForm(ts, types, triggers, other, note, function () {
      selTriggers = {}; selTypes = {}; $('otherTrigger').value = ''; $('relapseNote').value = '';
      $('relapseTime').value = '';
      renderLog();
      if (dayKey) renderDaySheet();
    });
  });
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
  function hm(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
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
    events.sort(function (a, b) { return a.ts - b.ts; });
    return events;
  }
  function captureDayDraft() {
    if ($('dayNote')) dayDraft.note = $('dayNote').value;
    if ($('dayRelTime') && $('dayRelTime').value) dayDraft.time = $('dayRelTime').value;
    if ($('dayRelNote')) dayDraft.relNote = $('dayRelNote').value;
    if ($('dayRelOther')) dayDraft.other = $('dayRelOther').value;
  }
  function timelineHtml(k) {
    var events = dayEvents(k);
    var ticks = '<span class="day-tl-tick start">00:00</span><span class="day-tl-tick mid">12:00</span><span class="day-tl-tick end">24:00</span>';
    var used = [];
    var dots = events.map(function (ev) {
      var p = Math.max(0, Math.min(100, minuteOf(ev.ts) / 1440 * 100));
      var lane = 0;
      while (used.some(function (u) { return u.lane === lane && Math.abs(u.p - p) < 5; })) lane++;
      if (lane > 1) lane = 1;
      used.push({ lane: lane, p: p });
      var primary = ev.kind === 'relapse' ? ((normalizeTypes(ev.r.types)[0]) || '') : '';
      return '<span class="day-tl-dot' + (ev.kind === 'relapse' ? ' relapse' : '') + (lane ? ' lane1' : '') + '" style="left:' + p.toFixed(2) + '%" data-type="' + esc(primary) + '" title="' + esc(hm(ev.ts) + (ev.kind === 'checkin' ? ' 打卡' : ' 破戒')) + '"></span>';
    }).join('');
    var list = events.length ? events.map(function (ev) {
      var primary = ev.kind === 'relapse' ? ((normalizeTypes(ev.r.types)[0]) || '') : '';
      var body;
      if (ev.kind === 'checkin') {
        var m = D.moods.filter(function (x) { return x.v === ev.mood; })[0] || D.moods[2];
        body = '<b>心情打卡 · ' + esc(m.t) + '</b>' + (ev.note ? '<div class="small">' + esc(ev.note) + '</div>' : '');
      } else {
        var r = ev.r;
        body = '<b>破戒' + (relapseResets(r.types) ? '' : ' · 不重置天数') + '</b>' +
          (typeChips(r.types) ? '<div class="h-tags">' + typeChips(r.types) + '</div>' : '<div class="small muted">未标类型（仍会计入重置）</div>') +
          ((r.triggers && r.triggers.length) ? '<div class="small muted">' + esc(r.triggers.map(function (t) { return t === '其他' && r.other ? '其他：' + r.other : t; }).join('、')) + '</div>' : '') +
          (r.note ? '<div class="small">' + esc(r.note) + '</div>' : '');
      }
      return '<li class="day-tl-item"><span class="day-tl-time">' + hm(ev.ts) + '</span><span class="day-tl-node' + (ev.kind === 'relapse' ? ' relapse' : '') + '" data-type="' + esc(primary) + '"></span><div class="day-tl-card">' + body + '</div></li>';
    }).join('') : '<li class="day-tl-item"><span class="day-tl-time">—</span><span class="day-tl-node"></span><div class="day-tl-card"><span class="muted small">这一天还没有打卡或破戒。下面可以直接补上。</span></div></li>';
    return '<p class="field-label">线性图 · 00:00–24:00</p><div class="day-tl-bar" role="img" aria-label="当天 0 点到 24 点的事件"><div class="day-tl-rail"></div>' + ticks + dots + '</div><ol class="day-tl-list">' + list + '</ol>';
  }
  function renderDaySheet() {
    if (!dayKey) return;
    $('dayTitle').textContent = fmtDayTitle(dayKey);
    var k = dayKey;
    var c = state.checkins[k];
    var rels = state.relapses.filter(function (r) { return dateKey(r.ts) === k; }).sort(function (a, b) { return a.ts - b.ts; });
    var html = timelineHtml(k);
    html += '<div class="day-section"><p class="field-label">这天的心情</p><div class="moods">';
    html += D.moods.map(function (m) {
      return '<button type="button" class="mood' + (dayDraft.mood === m.v ? ' sel' : '') + '" data-day-mood="' + m.v + '"><span class="e">' + ic(m.icon) + '</span>' + m.t + '</button>';
    }).join('');
    html += '</div><label class="field"><span>备注</span><textarea id="dayNote" rows="2" maxlength="500" placeholder="可选。例如：晚上状态不错。">' + esc(dayDraft.note || '') + '</textarea></label>';
    html += '<div class="day-actions"><button class="btn btn-primary" type="button" id="btnSaveDayCheckin">' + ic('check') + '保存心情</button>';
    if (c) html += '<button class="btn btn-ghost" type="button" id="btnClearDayCheckin">清除打卡</button>';
    html += '</div></div>';
    html += '<div class="day-section"><p class="field-label">这天的破戒</p>';
    html += rels.length ? '<div class="history">' + rels.map(relapseItem).join('') + '</div>' : '<p class="muted small">还没有破戒记录。</p>';
    html += '<p class="field-label">补记一次破戒</p>';
    html += '<label class="field"><span>发生时间</span><input type="datetime-local" id="dayRelTime" value="' + esc(dayDraft.time) + '" max="' + esc(toLocalInput(Date.now() + 60000)) + '" /></label>';
    html += '<div class="field"><span>类型（可多选）</span><div class="tags" id="dayTypes">' + typeButtons(dayDraft.types, 'data-day-type') + '</div></div>';
    html += '<p class="small muted">' + esc(resetHint(selectedTypes(dayDraft.types)) || '选择类型后会说明是否重置天数') + '</p>';
    html += '<div class="field"><span>触发因素（可多选）</span><div class="tags" id="dayTriggers">' + D.triggers.map(function (t) {
      return '<button type="button" class="tag' + (dayDraft.triggers[t] ? ' sel' : '') + '" data-day-trigger="' + esc(t) + '">' + esc(t) + '</button>';
    }).join('') + '</div><input type="text" id="dayRelOther" class="' + (dayDraft.triggers['其他'] ? '' : 'hidden') + '" maxlength="20" placeholder="其他触发因素" value="' + esc(dayDraft.other || '') + '" /></div>';
    html += '<label class="field"><span>备注</span><textarea id="dayRelNote" rows="2" maxlength="500">' + esc(dayDraft.relNote || '') + '</textarea></label>';
    html += '<button class="btn btn-warm btn-block" type="button" id="btnAddDayRelapse">添加到这一天</button></div>';
    $('dayBody').innerHTML = html;
  }
  function openDay(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k > dateKey(Date.now())) { toast('还不能查看未来的日期'); return; }
    var c = state.checkins[k];
    dayKey = k;
    dayDraft = {
      mood: c ? c.mood : null,
      note: (c && c.note) || '',
      types: {},
      triggers: {},
      time: k === dateKey(Date.now()) ? toLocalInput(Date.now()) : (k + 'T12:00'),
      relNote: '',
      other: ''
    };
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
  function saveDayCheckin() {
    if (!dayKey) return;
    if (!dayDraft.mood) { toast('请先选择这天的心情'); return; }
    var k = dayKey;
    var prev = state.checkins[k];
    var note = ($('dayNote') && $('dayNote').value || '').trim();
    var ts = (prev && prev.ts) || (k === dateKey(Date.now()) ? Date.now() : atLocal(k, 12, 0));
    var row = { mood: dayDraft.mood, ts: ts, editedAt: Date.now() };
    if (note) row.note = note;
    state.checkins[k] = row;
    if (state.removed.checkins[k] > 0) state.removed.checkins[k] = -Date.now();
    dayDraft.note = note;
    save();
    renderDaySheet();
    if (current === 'home') renderHome();
    if (current === 'log') renderHistory();
    toast('已保存这天的心情');
  }
  function clearDayCheckin() {
    var k = dayKey;
    if (!k || !state.checkins[k]) return;
    openModal({
      title: '清除这天的打卡？',
      html: '<p>会去掉 ' + esc(k) + ' 的心情打卡。破戒记录不受影响。</p>',
      ok: '清除', danger: true,
      onOk: function () {
        delete state.checkins[k];
        state.removed.checkins[k] = Date.now();
        dayDraft.mood = null;
        dayDraft.note = '';
        save();
        renderDaySheet();
        if (current === 'home') renderHome();
        if (current === 'log') renderHistory();
        toast('已清除打卡');
      }
    });
  }
  function addDayRelapse() {
    if (!dayKey) return;
    captureDayDraft();
    var ts = parseLocalInput(dayDraft.time);
    if (!isFinite(ts)) { toast('请选择发生时间'); return; }
    if (ts > Date.now() + 60000) { toast('时间不能晚于现在'); return; }
    if (dateKey(ts) !== dayKey) { toast('发生时间需要在这一天'); return; }
    var types = selectedTypes(dayDraft.types);
    if (!types.length) { toast('请至少选择一个类型'); return; }
    var triggers = D.triggers.filter(function (t) { return dayDraft.triggers[t]; });
    var other = dayDraft.triggers['其他'] ? dayDraft.other.trim() : '';
    var note = dayDraft.relNote.trim();
    finishRelapseForm(ts, types, triggers, other, note, function () {
      dayDraft.types = {};
      dayDraft.triggers = {};
      dayDraft.relNote = '';
      dayDraft.other = '';
      dayDraft.time = dayKey === dateKey(Date.now()) ? toLocalInput(Date.now()) : (dayKey + 'T12:00');
      renderDaySheet();
      if (current === 'home') renderHome();
      if (current === 'log') renderHistory();
    });
  }
  $('dayClose').addEventListener('click', closeDay);
  $('dayMask').addEventListener('click', function (e) { if (e.target === this) closeDay(); });
  $('dayBody').addEventListener('click', function (e) {
    var moodBtn = e.target.closest('[data-day-mood]');
    if (moodBtn) { captureDayDraft(); dayDraft.mood = +moodBtn.dataset.dayMood; renderDaySheet(); return; }
    var tp = e.target.closest('[data-day-type]');
    if (tp) { captureDayDraft(); dayDraft.types[tp.dataset.dayType] = !dayDraft.types[tp.dataset.dayType]; renderDaySheet(); return; }
    var tr = e.target.closest('[data-day-trigger]');
    if (tr) {
      captureDayDraft();
      var name = tr.getAttribute('data-day-trigger');
      dayDraft.triggers[name] = !dayDraft.triggers[name];
      renderDaySheet();
      return;
    }
    if (e.target.closest('#btnSaveDayCheckin')) { saveDayCheckin(); return; }
    if (e.target.closest('#btnClearDayCheckin')) { clearDayCheckin(); return; }
    if (e.target.closest('#btnAddDayRelapse')) { addDayRelapse(); return; }
    if (e.target.closest('.h-del') || e.target.closest('[data-edit]')) onHistoryClick(e);
  });

  function relapseItem(r) {
    var tags = typeChips(r.types);
    var trigs = (r.triggers || []).map(function (t) { return '<span>' + esc(t === '其他' && r.other ? '其他：' + r.other : t) + '</span>'; }).join('');
    var primary = (normalizeTypes(r.types)[0]) || '';
    return '<div class="h-item relapse" data-type="' + esc(primary) + '"><div class="h-ico">' + ic(primary && typeById(primary) ? typeById(primary).icon : 'cloud-rain') + '</div><div class="h-main"><b>破戒记录</b>' +
      (r.streakMs ? '<span class="small muted"> · 本次坚持 ' + fmtDays(r.streakMs) + ' 天</span>' : '') +
      '<div class="small muted">' + fmtDT(r.ts) + '</div>' +
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
      html: '<p class="small muted">改时间、类型、触发因素或备注后，会按当前的重置规则重新计算连续天数。不重置的类型仍留在日历和时间轴上。</p>' +
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
        toast(changed ? '记录已更新，连续天数已重新计算' : '记录已更新');
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
    if (!items.length) { $('historyList').innerHTML = emptyState('notebook', '还没有记录。每一次坚持和复盘都会出现在这里。'); return; }
    $('historyList').innerHTML = items.slice(0, 80).map(function (it) {
      var r = it.r;
      if (it.type === 'urge') {
        return '<div class="h-item urge"><div class="h-ico">' + ic('shield-check') + '</div><div class="h-main"><b>成功抵御一次冲动</b><div class="small muted">' + fmtDT(r.ts) + '</div></div>' +
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
      else if (edit.dataset.edit === 'checkin') openDay(edit.dataset.date);
      return;
    }
    var b = e.target.closest('.h-del'); if (!b) return;
    var type = b.dataset.del, id = b.dataset.id;
    if (type === 'checkin') {
      var dk = b.dataset.date;
      openModal({
        title: '删除这天的打卡？',
        html: '<p>会去掉 ' + esc(dk) + ' 的心情打卡，无法从这里撤销。</p>',
        ok: '删除', danger: true,
        onOk: function () {
          delete state.checkins[dk];
          state.removed.checkins[dk] = Date.now();
          if (dayKey === dk) { dayDraft.mood = null; dayDraft.note = ''; renderDaySheet(); }
          save(); renderHistory();
          if (current === 'home') renderHome();
          toast('已删除');
        }
      });
      return;
    }
    openModal({
      title: '删除这条记录？',
      html: '<p>删除后无法恢复。' + (type === 'relapse' ? '如果这条破戒原本会重置天数，删掉之后会按剩下的记录重新计算连续天数。' : '') + '</p>',
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

  function hbars(rows, cls, raw) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    return rows.map(function (r) {
      return '<div class="hbar"><span class="hbar-l">' + (raw ? r[0] : esc(r[0])) + '</span><div class="hbar-track"><div class="hbar-fill ' + (cls || '') + '" style="width:' + (r[1] / max * 100).toFixed(1) + '%"></div></div><span class="hbar-n">' + r[1] + '</span></div>';
    }).join('');
  }

  function renderStats() {
    var u = state.urges.length, r = state.relapses.length;
    $('stUrges').textContent = u;
    $('stRelapses').textContent = r;
    $('stBest').textContent = fmtDays(bestMs());
    $('stCurrent').textContent = fmtDays(curMs());
    $('stCheckins').textContent = Object.keys(state.checkins).length;
    $('stRate').textContent = (u + r) ? Math.round(u / (u + r) * 100) + '%' : '—';

    // 触发因素
    var tc = {};
    state.relapses.forEach(function (x) { x.triggers.forEach(function (t) { tc[t] = (tc[t] || 0) + 1; }); });
    var trows = Object.keys(tc).map(function (k) { return [k, tc[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    $('triggerChart').innerHTML = trows.length ? hbars(trows) : emptyState('zap', '暂无数据。记录破戒时选择触发因素，这里会帮你找到规律。');

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
        svg += '<rect x="' + bar[2] + '" y="' + (bar[0] ? y : top + chartH - 2) + '" width="' + bw + '" height="' + (bar[0] ? h : 2) + '" rx="0" class="' + bar[1] + '" opacity="' + (bar[0] ? 1 : .28) + '"/>';
        if (bar[0]) svg += '<text x="' + (bar[2] + bw / 2) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="10" class="val">' + bar[0] + '</text>';
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
    $('moodChart').innerHTML = Object.keys(mc).length ? hbars(mrows, 'mint', true) : emptyState('smile', '每天打卡并选择心情后，这里会显示你的心情分布。');

    // 建议
    var ins = [];
    if (r) {
      var peak = rb.indexOf(Math.max.apply(null, rb));
      ins.push(['clock', '你的高风险时段是<b>' + BUCKETS[peak][0] + '（' + BUCKETS[peak][1] + '-' + (BUCKETS[peak][1] + 4) + ' 点）</b>。可以提前为这个时段安排运动、学习或与人相处的计划。']);
    }
    if (trows.length) {
      ins.push(['target', '最常见的触发因素是<b>「' + esc(trows[0][0]) + '」</b>。' + esc(D.triggerTips[trows[0][0]] || D.triggerTips['其他'])]);
    }
    if (u) ins.push(['shield-check', '你已经成功抵御了 <b>' + u + '</b> 次冲动，每一次都在强化新的习惯回路。']);
    var cd = curMs() / DAY;
    var w = milestoneWindow(cd);
    ins.push(['sprout', '当前已坚持 <b>' + fmtDays(curMs()) + '</b> 天，下一个目标是 <b>' + w.next + ' 天</b>。专注于今天就好。']);
    if (!r && !u) ins.push(['notebook', '数据越多，分析越准确。遇到冲动时使用急救功能，或诚实记录每一次失误，都能帮助你更了解自己。']);
    $('insights').innerHTML = ins.map(function (x) { return '<div class="insight"><span class="e">' + ic(x[0]) + '</span><div>' + x[1] + '</div></div>'; }).join('');
  }

  /* ---------------- 外观（浅色 / 深色 / 跟随系统） ---------------- */
  var THEME_KEY = 'zenflow_theme';
  var THEME_COLOR = { light: '#fafafa', dark: '#000000' };
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
    resets: '破戒类型与重置规则',
    theme: '外观',
    reasons: '我坚持的理由',
    data: '数据与同步',
    about: '关于'
  };
  var settingsView = 'root';
  function settingsViewFromHash() {
    var m = (location.hash || '').match(/^#settings(?:\/([a-z]+))?$/);
    if (!m) return null;
    if (!m[1]) return 'root';
    return SETTINGS_PAGES[m[1]] ? m[1] : 'root';
  }
  function applySettingsDom() {
    var isRoot = settingsView === 'root';
    if ($('settingsRoot')) $('settingsRoot').classList.toggle('hidden', !isRoot);
    document.querySelectorAll('.settings-page').forEach(function (p) {
      p.classList.toggle('hidden', p.dataset.settingsPage !== settingsView);
    });
    if ($('settingsBack')) $('settingsBack').classList.toggle('hidden', isRoot);
    if ($('settingsTitle')) $('settingsTitle').textContent = isRoot ? '属于你的空间' : (SETTINGS_PAGES[settingsView] || '设置');
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
        (locked ? '自慰始终会重置戒色天数，不能关闭。' : (on ? '重置戒色天数' : '不重置天数，仍显示在日历和时间轴')) +
        '</p></div><button type="button" class="switch' + (on ? ' on' : '') + (locked ? ' locked' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '" aria-label="' + esc(t.label) + '：重置戒色天数" data-reset-type="' + t.id + '"' + (locked ? ' disabled' : '') + '><span class="switch-knob"></span></button></div>';
    }).join('');
  }
  function updateSettingsChrome() {
    if (!state) return;
    var st = window.ZFCloud && window.ZFCloud.status && window.ZFCloud.status();
    if ($('settingsAdminRow')) $('settingsAdminRow').classList.toggle('hidden', !(st && st.profile && st.profile.is_admin));
    if ($('settingsLogoutRow')) $('settingsLogoutRow').classList.toggle('hidden', !(st && st.loggedIn));
    if ($('settingsAccountSub')) {
      $('settingsAccountSub').textContent = (!st || !st.configured) ? '本机模式' : (st.loggedIn ? (st.email || '已登录') : '登录并同步');
    }
    if ($('settingsGoalSub')) $('settingsGoalSub').textContent = (state.goalDays || 30) + ' 天';
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
    if ($('displayNameInput') && document.activeElement !== $('displayNameInput')) $('displayNameInput').value = state.displayName || '';
    $('reasonsEdit').innerHTML = state.reasons.length
      ? state.reasons.map(function (r, i) { return '<li><span>' + esc(r) + '</span><button data-i="' + i + '" aria-label="删除">' + ic('x') + '</button></li>'; }).join('')
      : '<li class="muted"><span>还没有理由，写下第一条吧。</span></li>';
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
    toast(changed ? '已更新，连续天数已重新计算' : '已更新重置规则');
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
  $('btnSaveDisplayName').addEventListener('click', function () {
    var v = $('displayNameInput').value.trim().slice(0, 20);
    state.displayName = v;
    state.displayNameSetAt = Date.now();
    save();
    refreshChrome();
    toast(v ? '显示名称已保存' : '已清除显示名称');
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

  $('btnExport').addEventListener('click', function () {
    var data = JSON.stringify({ app: 'ZenFlow', exportedAt: new Date().toISOString(), data: state, settings: { theme: getTheme() } }, null, 2);
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'zenflow-backup-' + dateKey(Date.now()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('备份文件已导出');
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
        title: '导入备份？',
        html: '<p>备份包含 ' + Object.keys(parsed.checkins).length + ' 次打卡、' + parsed.urges.length + ' 次抵御冲动、' + parsed.relapses.length + ' 条破戒记录。</p><p>导入将<b>覆盖</b>当前所有数据。</p>',
        ok: '覆盖导入',
        onOk: function () { state = parsed; state.streakStartSetAt = Date.now(); save({ replaceAll: true }); if (importedTheme) setTheme(importedTheme, true); renderSettings(); toast('导入成功'); }
      });
    };
    reader.readAsText(f);
  });
  $('btnReset').addEventListener('click', function () {
    openModal({
      title: '重置所有数据？',
      html: '<p>这会清空打卡、记录、理由等全部数据，且<b>无法撤销</b>。建议先导出备份。</p><p>请输入「重置」确认：</p><input type="text" id="resetConfirm" placeholder="重置" />',
      ok: '确认重置', danger: true,
      onOk: function () {
        if ($('resetConfirm').value.trim() !== '重置') { toast('请输入「重置」以确认'); return false; }
        state = defaultState(); save({ replaceAll: true });
        selTriggers = {}; selTypes = {}; selCheckinTypes = {}; selCheckinTriggers = {}; selMood = null; calOffset = 0;
        if (dayKey) closeDay();
        renderSettings(); toast('已重置，新的开始');
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
  var APP_VERSION = '18';
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
      if (current !== 'sos') render(current);
      updateSettingsChrome();
    },
    updateSettingsChrome: updateSettingsChrome,
    toast: toast, openModal: openModal, closeModal: closeModal, lockScroll: lockScroll, unlockScroll: unlockScroll,
    esc: esc, ic: ic, fmtDT: fmtDT, current: function () { return current; }
  };
})();
