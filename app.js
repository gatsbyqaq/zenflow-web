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
  function motionReduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function motionReady() { return document.documentElement.classList.contains('motion-ready'); }
  function motionScale() {
    var n = parseFloat(document.documentElement.getAttribute('data-motion-scale') || '1');
    return isFinite(n) && n > 0 ? n : 1;
  }
  function motionMs(name, fallback) {
    var raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    var n = parseFloat(raw);
    return isFinite(n) ? n : fallback;
  }
  function ic(name, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function fmtDays(ms) { return String(window.ZFStreak.wholeDays(ms)); }
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
  function i18nVarsOf(el) {
    var raw = el.getAttribute('data-i18n-vars');
    if (!raw) return undefined;
    try { return JSON.parse(raw); } catch (e) { return undefined; }
  }
  function applyNewCopy(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'), i18nVarsOf(el));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'), i18nVarsOf(el)));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title'), i18nVarsOf(el)));
    });
    scope.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
      el.setAttribute('alt', t(el.getAttribute('data-i18n-alt'), i18nVarsOf(el)));
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'), i18nVarsOf(el)));
    });
  }
  /* 从 JS 写的标签。静态节点用 data-i18n-aria，动态节点用 ariaAttr / setAria。 */
  function setAria(el, key, vars) {
    if (!el || !key) return;
    el.setAttribute('data-i18n-aria', key);
    if (vars) el.setAttribute('data-i18n-vars', JSON.stringify(vars));
    else el.removeAttribute('data-i18n-vars');
    el.setAttribute('aria-label', t(key, vars));
  }
  function ariaAttr(key, vars) {
    return ' data-i18n-aria="' + esc(key) + '" aria-label="' + esc(t(key, vars)) + '"' +
      (vars ? ' data-i18n-vars="' + esc(JSON.stringify(vars)) + '"' : '');
  }
  function lapseTypes() { return D.lapseTypes || []; }
  function typeById(id) {
    for (var i = 0; i < lapseTypes().length; i++) if (lapseTypes()[i].id === id) return lapseTypes()[i];
    return null;
  }
  function typeName(id) {
    var key = 'type.' + id;
    var name = t(key);
    if (name && name !== key) return name;
    var tp = typeById(id);
    return tp ? tp.label : id;
  }
  function moodLabel(m) {
    if (!m) return '';
    var key = 'mood.' + m.v;
    var name = t(key);
    return name && name !== key ? name : m.t;
  }
  function triggerLabel(name) {
    var key = 'trigger.' + name;
    var label = t(key);
    return label && label !== key ? label : name;
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
      var tp = typeById(id);
      return '<span class="type-chip" data-type="' + tp.id + '">' + ic(tp.icon) + esc(typeName(tp.id)) + '</span>';
    }).join('');
  }
  function typeButtons(selected, attr) {
    return lapseTypes().map(function (tp) {
      var on = selected && selected[tp.id];
      return '<button type="button" class="tag type-tag' + (on ? ' sel' : '') + '" data-type="' + tp.id + '" ' + attr + '="' + tp.id + '" style="--c:var(--type-' + tp.id + ')">' + ic(tp.icon) + esc(typeName(tp.id)) + '</button>';
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
    return { changed: changed, resets: relapseResets(opts.types), id: row.id };
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
  var screenMotionGen = 0;
  var screenMotionTimer = 0;
  function clearScreenMotion(el) {
    if (!el) return;
    el.classList.remove('screen-leave', 'enter');
    el.style.opacity = '';
    el.style.transition = '';
    el.style.pointerEvents = '';
  }
  function shownScreenOpacity(el) {
    if (!el || (!el.classList.contains('active') && !el.classList.contains('screen-leave'))) return 0;
    var o = parseFloat(window.getComputedStyle(el).opacity);
    return isFinite(o) ? o : 0;
  }
  function playScreenCrossfade(toEl) {
    var gen = ++screenMotionGen;
    clearTimeout(screenMotionTimer);
    var outMs = motionMs('--motion-tab-out', 120);
    var inMs = motionMs('--motion-tab-in', 160);
    var delay = motionMs('--motion-tab-delay', 40);
    var ease = 'var(--ease)';
    var leaves = [];
    var toOp = shownScreenOpacity(toEl);
    document.querySelectorAll('.screen').forEach(function (s) {
      if (s === toEl) return;
      var op = shownScreenOpacity(s);
      if (op > 0.015) leaves.push({ el: s, op: op });
      else {
        s.classList.remove('active');
        clearScreenMotion(s);
      }
    });
    leaves.forEach(function (L) {
      L.el.style.transition = 'none';
      L.el.style.opacity = String(L.op);
      L.el.classList.remove('active');
      L.el.classList.add('screen-leave');
      L.el.style.pointerEvents = 'none';
    });
    toEl.style.transition = 'none';
    toEl.style.opacity = String(toOp);
    toEl.classList.remove('screen-leave');
    toEl.classList.add('active');
    toEl.style.pointerEvents = '';
    void toEl.offsetWidth;
    leaves.forEach(function (L) {
      L.el.style.transition = 'opacity ' + outMs + 'ms ' + ease;
      L.el.style.opacity = '0';
    });
    toEl.style.transition = 'opacity ' + inMs + 'ms ' + ease + ' ' + delay + 'ms';
    toEl.style.opacity = '1';
    var total = Math.max(outMs, delay + inMs);
    screenMotionTimer = setTimeout(function () {
      if (gen !== screenMotionGen) return;
      leaves.forEach(function (L) {
        L.el.classList.remove('active');
        clearScreenMotion(L.el);
      });
      if (toEl.classList.contains('active')) {
        toEl.style.opacity = '';
        toEl.style.transition = '';
      }
    }, total + 70);
  }
  function go(tab) {
    if (current === 'sos' && tab !== 'sos') resetSos();
    if (cropSheetOpen()) window.ZFCloud.closeCrop();
    if ($('actMask') && !$('actMask').classList.contains('hidden')) closeAct();
    if (dayKey) closeDay();
    if (current === 'settings' && tab !== 'settings' && settingsView !== 'root') {
      settingsMotionLive = false;
      settingsMotionGen++;
      clearTimeout(settingsMotionTimer);
      settingsView = 'root';
      applySettingsDom();
      if (/^#settings/.test(location.hash) && location.hash !== '#admin') {
        try { history.replaceState(null, '', location.pathname + location.search); } catch (err) {}
      }
    }
    var screenChanged = tab !== current;
    current = tab;
    document.body.classList.toggle('sos-open', tab === 'sos');
    document.querySelectorAll('.tab').forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('tabbar').dataset.active = tab;
    var toEl = document.querySelector('.screen[data-screen="' + tab + '"]');
    if (!toEl) return;
    if (!screenChanged || !motionReady()) {
      if (screenChanged) {
        screenMotionGen++;
        clearTimeout(screenMotionTimer);
        document.querySelectorAll('.screen').forEach(function (s) {
          clearScreenMotion(s);
          s.classList.toggle('active', s.dataset.screen === tab);
        });
      }
    } else {
      playScreenCrossfade(toEl);
    }
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

  var RING_DAYS_KEY = 'zenflow_ring_days';
  var ringDeferred = false;
  var ringFadeGen = 0;
  var ringAnimUntil = 0;
  function readRingDays() {
    try {
      var v = localStorage.getItem(RING_DAYS_KEY);
      if (v === null || v === '') return null;
      var n = parseInt(v, 10);
      return isFinite(n) ? n : null;
    } catch (e) { return null; }
  }
  function writeRingDays(n) {
    try { localStorage.setItem(RING_DAYS_KEY, String(n)); } catch (e) {}
  }
  function ringProgress(dayFloat) {
    var goal = state.goalDays || 30;
    return goal > 0 ? Math.min(1, Math.max(0, dayFloat / goal)) : 0;
  }
  function setRingOffset(p, animate, shownDays) {
    var ring = $('ringFg');
    if (!ring) return;
    var empty = shownDays <= 0 || !(p > 0);
    ring.style.strokeDasharray = String(RING_LEN);
    if (empty) {
      ring.classList.add('is-empty');
      ring.style.strokeDashoffset = String(RING_LEN);
      return;
    }
    ring.classList.remove('is-empty');
    var ms = animate && motionReady() && !motionReduced() ? motionMs('--motion-ring', 600) : 0;
    ring.style.transition = ms ? ('stroke-dashoffset ' + ms + 'ms var(--ease)') : 'none';
    ring.style.strokeDashoffset = (RING_LEN * (1 - p)).toFixed(2);
    if (ring.style.opacity === '0') ring.style.opacity = '1';
  }
  function paintDays(days, mode) {
    var el = $('daysNum');
    if (!el) return;
    if (mode === 'snap' || !motionReady()) {
      el.style.transition = 'none';
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.textContent = String(days);
      return;
    }
    var ms = mode === 'enter'
      ? (motionReduced() ? motionMs('--motion-reduced', 150) : motionMs('--motion-ring', 600))
      : motionMs('--motion-state', 200);
    if (mode === 'enter') {
      el.textContent = String(days);
      el.style.transition = 'none';
      el.style.opacity = '0';
      el.style.transform = motionReduced() ? 'none' : 'translateY(4px)';
      el.offsetHeight;
      el.style.transition = 'opacity ' + ms + 'ms var(--ease), transform ' + ms + 'ms var(--ease)';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
      return;
    }
    el.style.transition = 'opacity ' + ms + 'ms var(--ease)';
    el.style.transform = 'none';
    el.style.opacity = '0';
    var gen = ++ringFadeGen;
    setTimeout(function () {
      if (gen !== ringFadeGen) return;
      el.textContent = String(days);
      el.style.opacity = '1';
    }, ms);
  }
  function crossfadeRing(p, days) {
    var ring = $('ringFg');
    var ms = motionMs(motionReduced() ? '--motion-reduced' : '--motion-state', 200);
    if (!ring) { paintDays(days, 'cross'); setRingOffset(p, false, days); return; }
    ring.style.transition = 'opacity ' + ms + 'ms var(--ease)';
    ring.style.opacity = '0';
    paintDays(days, 'cross');
    var gen = ringFadeGen;
    setTimeout(function () {
      if (gen !== ringFadeGen) return;
      if (days <= 0 || !(p > 0)) {
        ring.classList.add('is-empty');
        ring.style.transition = 'none';
        ring.style.opacity = '0';
        ring.style.strokeDashoffset = String(RING_LEN);
        return;
      }
      setRingOffset(p, false, days);
      ring.style.transition = 'none';
      ring.style.opacity = '0';
      ring.offsetHeight;
      ring.style.transition = 'opacity ' + ms + 'ms var(--ease)';
      ring.style.opacity = '1';
    }, ms);
  }
  function updateTimer() {
    if (ceremonyHeld && motionReady()) return;
    var msTime = curMs();
    var days = window.ZFStreak.wholeDays(msTime);
    var dFloat = msTime / DAY;
    var goal = state.goalDays || 30;
    var p = ringProgress(dFloat);
    var prev = readRingDays();
    var sheetOpen = $('actMask') && !$('actMask').classList.contains('hidden');
    if (sheetOpen && prev !== null && prev !== days && motionReady()) {
      ringDeferred = true;
    } else {
      if (!motionReady()) {
        var holdDays = prev === null || prev === days ? days : prev;
        paintDays(holdDays, 'snap');
        setRingOffset(prev === null || prev === days ? p : ringProgress(prev), false, holdDays);
        if (prev === null) writeRingDays(days);
      } else if (prev !== null && days > prev) {
        if (motionReduced()) {
          ringAnimUntil = Date.now() + motionMs('--motion-reduced', 150);
          crossfadeRing(p, days);
        } else {
          ringAnimUntil = Date.now() + motionMs('--motion-ring', 600);
          setRingOffset(p, true, days);
          paintDays(days, 'enter');
        }
        writeRingDays(days);
      } else if (prev !== null && days < prev) {
        ringAnimUntil = Date.now() + motionMs(motionReduced() ? '--motion-reduced' : '--motion-state', 200);
        crossfadeRing(p, days);
        writeRingDays(days);
      } else if (Date.now() < ringAnimUntil) {
        writeRingDays(days);
      } else {
        paintDays(days, 'snap');
        setRingOffset(p, false, days);
        if (days <= 0) {
          var ringNow = $('ringFg');
          if (ringNow) ringNow.style.opacity = '0';
        }
        writeRingDays(days);
      }
      ringDeferred = false;
    }
    if ($('gaugeUnit')) $('gaugeUnit').textContent = t('ring.unit', { n: days });
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
    updateTimer();
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
  if ($('btnOpenAct')) $('btnOpenAct').addEventListener('click', function () { openAct(dateKey(Date.now())); });

  var calOffset = 0;
  var selectedDay = dateKey(Date.now());
  function monthOffsetOf(date) {
    var now = new Date();
    return (date.getFullYear() - now.getFullYear()) * 12 + (date.getMonth() - now.getMonth());
  }
  var ceremonyHeld = false;
  try { ceremonyHeld = sessionStorage.getItem('zf-hold-ceremony') === '1'; } catch (e) {}
  var dayAnimateNext = false;
  var enterRowId = null;
  var dayFlipGen = 0;
  var monthGen = 0;
  var pendingDelete = null;
  function flushDelete() {
    if (!pendingDelete) return;
    var job = pendingDelete;
    pendingDelete = null;
    exitRow._g++;
    var btn = $('btnOpenActLog');
    if (btn) { btn.style.transition = 'none'; btn.style.transform = ''; }
    performDelete(job.kind, job.id);
  }
  function shiftMonth(delta) {
    if (delta > 0 && calOffset >= 0) return;
    flushDelete();
    calOffset += delta;
    if (motionReady()) playMonth(delta);
    else renderRecords();
  }
  function monthFadeTiming() {
    return {
      outMs: motionMs('--motion-month-out', 100),
      inMs: motionMs('--motion-month-in', 170),
      delay: motionMs('--motion-month-delay', 80)
    };
  }
  function settleMonthChrome() {
    document.querySelectorAll('.title-leave').forEach(function (n) { n.remove(); });
    var title = $('calTitle');
    if (title) { title.style.transition = 'none'; title.style.opacity = '1'; }
    var pill = $('calToday');
    if (!pill) return;
    pill.style.transition = 'none';
    if (calOffset === 0) {
      pill.classList.add('hidden');
      pill.style.opacity = '';
    } else {
      pill.classList.remove('hidden');
      pill.style.opacity = '1';
    }
  }
  function fadeMonthTitle(gen, timing) {
    var title = $('calTitle');
    var slot = title && title.parentNode;
    if (!title || !slot) return;
    slot.querySelectorAll('.title-leave').forEach(function (n) { n.remove(); });
    var leave = title.cloneNode(true);
    leave.removeAttribute('id');
    leave.classList.add('title-leave');
    leave.setAttribute('aria-hidden', 'true');
    leave.style.transition = 'none';
    leave.style.opacity = '1';
    slot.appendChild(leave);
    title.style.transition = 'none';
    title.style.opacity = '0';
    leave.offsetHeight;
    leave.style.transition = 'opacity ' + timing.outMs + 'ms var(--ease-exit)';
    leave.style.opacity = '0';
    setTimeout(function () {
      if (gen !== monthGen || !title.isConnected) return;
      title.style.transition = 'opacity ' + timing.inMs + 'ms var(--ease)';
      title.style.opacity = '1';
    }, timing.delay);
    setTimeout(function () {
      if (leave.parentNode) leave.remove();
      if (gen !== monthGen || !title.isConnected) return;
      title.style.transition = '';
      title.style.opacity = '';
    }, timing.delay + timing.inMs + 40);
  }
  function fadeTodayPill(gen, timing) {
    var pill = $('calToday');
    if (!pill) return;
    var shown = !pill.classList.contains('hidden') && pill.style.opacity !== '0';
    var want = calOffset !== 0;
    if (shown === want) {
      if (want) { pill.classList.remove('hidden'); pill.style.opacity = '1'; }
      return;
    }
    if (want) {
      pill.classList.remove('hidden');
      pill.style.transition = 'none';
      pill.style.opacity = '0';
      pill.offsetHeight;
      setTimeout(function () {
        if (gen !== monthGen) return;
        pill.style.transition = 'opacity ' + timing.inMs + 'ms var(--ease)';
        pill.style.opacity = '1';
      }, timing.delay);
      setTimeout(function () {
        if (gen !== monthGen) return;
        pill.style.transition = '';
        pill.style.opacity = '';
      }, timing.delay + timing.inMs + 40);
      return;
    }
    pill.style.transition = 'opacity ' + timing.outMs + 'ms var(--ease-exit)';
    pill.style.opacity = '0';
    setTimeout(function () {
      if (gen !== monthGen) return;
      pill.classList.add('hidden');
      pill.style.transition = '';
      pill.style.opacity = '';
    }, timing.outMs + 40);
  }
  function slideMonthBelow(residual, delta, gen) {
    var below = $('recDay');
    if (!below) return;
    if (motionReduced() || (!delta && !residual)) {
      below.style.transition = 'none';
      below.style.transform = '';
      below.style.background = '';
      below.style.zIndex = '';
      return;
    }
    var ms = motionMs('--motion-height', 250);
    below.style.transition = 'none';
    below.style.background = 'var(--bg)';
    below.style.zIndex = '1';
    below.style.transform = 'translateY(' + (residual - delta) + 'px)';
    below.offsetHeight;
    below.style.transition = 'transform ' + ms + 'ms var(--ease)';
    below.style.transform = 'translateY(0)';
    setTimeout(function () {
      if (gen !== monthGen) return;
      below.style.transition = 'none';
      below.style.transform = '';
      below.style.background = '';
      below.style.zIndex = '';
    }, ms + 40);
  }
  function selectDay(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k > dateKey(Date.now())) return;
    if (k === selectedDay) return;
    flushDelete();
    selectedDay = k;
    paintDaySelection();
    dayAnimateNext = true;
    renderDayPanel();
  }
  function paintDaySelection() {
    var nodes = document.querySelectorAll('#calGrid [data-date]');
    nodes.forEach(function (cell) {
      var on = cell.dataset.date === selectedDay && !cell.classList.contains('today');
      cell.classList.toggle('sel', on);
    });
  }
  function playMonth(dir) {
    var grid = $('calGrid');
    var clip = grid && grid.parentNode;
    if (!grid || !clip) { renderRecords(); return; }
    var gen = ++monthGen;
    clip.querySelectorAll('.grid-leave').forEach(function (n) { n.remove(); });
    var leave = grid.cloneNode(true);
    leave.removeAttribute('id');
    leave.classList.add('grid-leave');
    leave.style.transition = 'none';
    leave.style.transform = grid.style.transform || 'none';
    leave.style.opacity = '1';
    clip.appendChild(leave);
    var reduced = motionReduced();
    var timing = monthFadeTiming();
    var outMs = timing.outMs;
    var inMs = timing.inMs;
    var delay = timing.delay;
    var h0 = grid.offsetHeight;
    var below = $('recDay');
    var residual = below ? translateY(below) : 0;
    fadeMonthTitle(gen, timing);
    var shift = 12;
    var dragged = parseFloat(String(leave.style.transform).replace(/[^-0-9.]/g, ''));
    if (!isFinite(dragged)) dragged = 0;
    var exitTo = (dragged + (-dir * shift)) + 'px';
    var enterFrom = (dir * shift) + 'px';
    grid.style.transition = 'none';
    grid.style.opacity = '0';
    grid.style.transform = reduced ? 'none' : ('translateX(' + enterFrom + ')');
    renderRecords({ holdChrome: true });
    fadeTodayPill(gen, timing);
    slideMonthBelow(residual, grid.offsetHeight - h0, gen);
    leave.offsetHeight;
    leave.style.transition = reduced
      ? ('opacity ' + outMs + 'ms var(--ease-exit)')
      : ('transform ' + outMs + 'ms var(--ease-exit), opacity ' + outMs + 'ms var(--ease-exit)');
    leave.style.opacity = '0';
    if (!reduced) leave.style.transform = 'translateX(' + exitTo + ')';
    setTimeout(function () {
      if (gen !== monthGen || !grid.isConnected) return;
      grid.style.transition = reduced
        ? ('opacity ' + inMs + 'ms var(--ease)')
        : ('transform ' + inMs + 'ms var(--ease), opacity ' + inMs + 'ms var(--ease)');
      grid.style.opacity = '1';
      grid.style.transform = 'none';
    }, delay);
    setTimeout(function () {
      if (gen !== monthGen) return;
      if (leave.parentNode) leave.remove();
      grid.style.transition = '';
      grid.style.transform = '';
      grid.style.opacity = '';
    }, delay + inMs + 40);
  }
  function renderRecords() {
    if (!$('calGrid') || !window.ZFRecords) return;
    var base = new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + calOffset);
    var y = base.getFullYear(), mo = base.getMonth();
    var ui = (window.ZFStrings && window.ZFStrings.locale) || 'zh';
    if ($('calTitle')) $('calTitle').textContent = window.ZFRecords.monthTitle(base, ui);
    var holdChrome = arguments[0] && arguments[0].holdChrome;
    if ($('calToday') && !holdChrome) $('calToday').classList.toggle('hidden', calOffset === 0);
    if ($('calNext')) {
      var blocked = calOffset >= 0;
      $('calNext').disabled = blocked;
      if (blocked) $('calNext').setAttribute('aria-disabled', 'true');
      else $('calNext').removeAttribute('aria-disabled');
    }
    if ($('calWeek')) {
      var loc = ui === 'en' ? 'en' : 'zh-CN';
      var wk = new Intl.DateTimeFormat(loc, { weekday: 'narrow' });
      var wkHtml = '';
      for (var wi = 0; wi < 7; wi++) wkHtml += '<span>' + esc(wk.format(new Date(2026, 9, 5 + wi))) + '</span>';
      $('calWeek').innerHTML = wkHtml;
    }
    var first = (new Date(y, mo, 1).getDay() + 6) % 7;
    var count = new Date(y, mo + 1, 0).getDate();
    var nowD = new Date();
    var todayK = dateKey(nowD.getTime());
    var eventsByDay = {};
    var urgeDays = {};
    var typeCounts = {};
    var urgeN = 0;
    function pushDayEvent(dk, ev) {
      if (!eventsByDay[dk]) eventsByDay[dk] = [];
      eventsByDay[dk].push(ev);
    }
    function inMonth(ts) {
      var d = new Date(ts);
      return d.getFullYear() === y && d.getMonth() === mo;
    }
    state.relapses.forEach(function (r) {
      var dk = dateKey(r.ts);
      var types = normalizeTypes(r.types);
      pushDayEvent(dk, { kind: 'relapse', ts: r.ts, types: types });
      if (inMonth(r.ts)) types.forEach(function (id) { typeCounts[id] = (typeCounts[id] || 0) + 1; });
    });
    state.urges.forEach(function (u) {
      if (!u || typeof u.ts !== 'number') return;
      var dk = dateKey(u.ts);
      urgeDays[dk] = true;
      pushDayEvent(dk, { kind: 'urge', ts: u.ts });
      if (inMonth(u.ts)) urgeN++;
    });
    if ($('calSum')) {
      var sum = '';
      window.ZFRecords.typeOrder.forEach(function (id) {
        if (!typeCounts[id]) return;
        sum += '<span><i class="dot" data-type="' + esc(id) + '"></i>' + typeCounts[id] + '</span>';
      });
      sum += '<span><i class="ring"></i>' + urgeN + '</span>';
      $('calSum').innerHTML = sum;
    }
    var html = '';
    for (var i = 0; i < first; i++) html += '<div class="cell"></div>';
    for (var d = 1; d <= count; d++) {
      var k = y + '-' + pad(mo + 1) + '-' + pad(d);
      var isToday = k === todayK;
      var future = k > todayK;
      var ordered = [];
      (eventsByDay[k] || []).slice().sort(function (a, b) { return a.ts - b.ts; }).forEach(function (ev) {
        if (ev.kind !== 'relapse') return;
        (ev.types || []).forEach(function (id) { if (ordered.indexOf(id) < 0) ordered.push(id); });
      });
      var marks = window.ZFRecords.dayMarkers(ordered, !!urgeDays[k]);
      var markHtml = '<span class="marks">' + marks.map(function (m) {
        return m.kind === 'ring' ? '<i class="ring"></i>' : '<i class="dot" data-type="' + esc(m.type) + '"></i>';
      }).join('') + '</span>';
      var st = window.ZFRecords.dayNumberState({
        future: future,
        today: isToday,
        selected: k === selectedDay,
        mood: !!state.checkins[k]
      });
      var cls = 'cell' + (st === 'nomood' ? ' nomood' : '') + (st === 'selected' ? ' sel' : '') + (st === 'today' ? ' today' : '') + (st === 'future' ? ' future' : '');
      var cellLabel = window.ZFStrings.calendarCellLabel(new Date(y, mo, d), eventsByDay[k] || [], ui);
      if (future) {
        html += '<div class="' + cls + '" aria-disabled="true"><span class="num">' + d + '</span>' + markHtml + '</div>';
      } else {
        html += '<button type="button" class="' + cls + '" data-date="' + k + '" aria-label="' + esc(cellLabel) + '" title="' + esc(cellLabel) + '"' +
          (isToday ? ' aria-current="date"' : '') + '><span class="num">' + d + '</span>' + markHtml + '</button>';
      }
    }
    $('calGrid').innerHTML = html;
    renderDayPanel();
  }
  function listSep() { return (window.ZFStrings && window.ZFStrings.locale) === 'en' ? ', ' : '、'; }
  function rowClock(ts) {
    var ui = (window.ZFStrings && window.ZFStrings.locale) === 'en' ? 'en' : 'zh-CN';
    return new Intl.DateTimeFormat(ui, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts));
  }
  function renderDayPanelNow() {
    if (!$('dayHead') || !$('dayList') || !window.ZFRecords) return;
    var k = selectedDay;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
    var p = k.split('-');
    var date = new Date(+p[0], +p[1] - 1, +p[2]);
    $('dayHead').textContent = window.ZFRecords.dayTitle(date, (window.ZFStrings && window.ZFStrings.locale) || 'zh');
    var events = dayEvents(k);
    if (!events.length) {
      $('dayList').innerHTML = '<p class="rec-empty">' + esc(t('cal.empty')) + '</p>';
      enterRowId = null;
      return;
    }
    $('dayList').innerHTML = '<div class="list">' + events.map(function (ev) {
      var icon = 'circle', color = '', name = t('record.behavior'), meta = '', kind = ev.kind, id = '';
      if (ev.kind === 'checkin') {
        var m = moodByValue(ev.mood) || D.moods[2];
        icon = m.icon;
        color = ' data-mood="' + m.v + '"';
        name = t('record.moodRow', { name: moodLabel(m) });
        id = k;
      } else if (ev.kind === 'urge') {
        icon = 'shield-check';
        name = t('home.urges');
        id = ev.u.id;
      } else {
        var types = normalizeTypes(ev.r.types);
        var primary = types[0] || '';
        var tp = primary && typeById(primary);
        icon = tp ? tp.icon : 'circle';
        if (primary) color = ' style="color:var(--type-' + primary + ')"';
        name = types.length ? types.map(typeName).join(listSep()) : t('record.behavior');
        var metas = (ev.r.triggers || []).map(function (tg) {
          return tg === '其他' && ev.r.other ? ev.r.other : triggerLabel(tg);
        }).filter(Boolean);
        meta = metas.join(listSep());
        id = ev.r.id;
      }
      var nameStyle = (ev.kind === 'relapse' && color) ? color : '';
      var action = ev.kind === 'checkin' ? ariaAttr('a11y.mood.edit') : ariaAttr('a11y.entry.edit');
      var actionKey = (/data-i18n-aria="([^"]+)"/.exec(action) || [])[1] || '';
      var rowLabel = rowClock(ev.ts) + ' ' + name + (meta ? ' ' + meta : '') + (actionKey ? ' ' + t(actionKey) : '');
      var enter = enterRowId && enterRowId === id ? ' is-in' : '';
      return '<button type="button" class="row' + enter + '" data-kind="' + kind + '" data-id="' + esc(id) + '" data-i18n-aria="' + esc(actionKey) + '" aria-label="' + esc(rowLabel) + '">' +
        '<span class="t">' + esc(rowClock(ev.ts)) + '</span>' +
        '<span class="rowic"' + color + '>' + ic(icon) + '</span>' +
        '<span class="name"' + nameStyle + '>' + esc(name) + '</span>' +
        (meta ? '<span class="meta">' + esc(meta) + '</span>' : '') +
        ic('chevron-right', 'chev') + '</button>';
    }).join('') + '</div>';
    enterRowId = null;
  }
  function translateY(el) {
    var tr = getComputedStyle(el).transform;
    if (!tr || tr === 'none') return 0;
    try { return new DOMMatrix(tr).m42 || 0; } catch (e) { return 0; }
  }
  function renderDayPanel() {
    if (!dayAnimateNext || !motionReady()) {
      dayAnimateNext = false;
      renderDayPanelNow();
      return;
    }
    dayAnimateNext = false;
    var slot = $('daySlot');
    if (!slot) { renderDayPanelNow(); return; }
    document.querySelectorAll('.day-ghost').forEach(function (g) { g.remove(); });
    var btn = $('btnOpenActLog');
    slot.style.transition = 'none';
    if (btn) btn.style.transition = 'none';
    var h0 = slot.getBoundingClientRect().height;
    var ty = btn ? translateY(btn) : 0;
    var ghost = slot.cloneNode(true);
    ghost.querySelectorAll('[id]').forEach(function (n) { n.removeAttribute('id'); });
    ghost.classList.add('day-ghost');
    ghost.setAttribute('aria-hidden', 'true');
    slot.parentNode.insertBefore(ghost, slot);
    renderDayPanelNow();
    var h1 = slot.scrollHeight;
    var reduced = motionReduced();
    var hms = reduced ? motionMs('--motion-reduced', 150) : motionMs('--motion-height', 250);
    var oms = reduced ? motionMs('--motion-reduced', 150) : motionMs('--motion-list', 200);
    slot.style.overflow = 'hidden';
    slot.style.height = h1 + 'px';
    slot.style.opacity = '0';
    var gen = ++dayFlipGen;
    if (btn && !reduced) btn.style.transform = 'translateY(' + (ty - (h1 - h0)) + 'px)';
    slot.offsetHeight;
    ghost.style.transition = 'opacity ' + oms + 'ms var(--ease)';
    slot.style.transition = 'opacity ' + oms + 'ms var(--ease)';
    ghost.style.opacity = '0';
    slot.style.opacity = '1';
    if (btn && !reduced) {
      btn.style.transition = 'transform ' + hms + 'ms var(--ease)';
      btn.style.transform = 'translateY(0)';
    }
    setTimeout(function () {
      if (ghost.parentNode) ghost.remove();
      if (gen !== dayFlipGen) return;
      slot.style.transition = 'none';
      slot.style.height = '';
      slot.style.overflow = '';
      slot.style.opacity = '';
      if (btn) { btn.style.transition = 'none'; btn.style.transform = ''; }
    }, Math.max(hms, oms) + 70);
  }
  if ($('calPrev')) $('calPrev').addEventListener('click', function () { shiftMonth(-1); });
  if ($('calNext')) $('calNext').addEventListener('click', function () {
    if (calOffset >= 0) return;
    shiftMonth(1);
  });
  if ($('calToday')) $('calToday').addEventListener('click', function () {
    var dir = calOffset > 0 ? -1 : (calOffset < 0 ? 1 : 0);
    calOffset = 0;
    selectedDay = dateKey(Date.now());
    if (dir && motionReady()) playMonth(dir);
    else renderRecords();
  });
  if ($('calGrid')) $('calGrid').addEventListener('click', function (e) {
    var cell = e.target.closest('[data-date]');
    if (!cell) return;
    selectDay(cell.dataset.date);
  });
  (function () {
    var swipe = null;
    var el = $('recCal');
    if (!el) return;
    function gridEl() { return $('calGrid'); }
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      monthGen++;
      var clip = gridEl() && gridEl().parentNode;
      if (clip) clip.querySelectorAll('.grid-leave').forEach(function (n) { n.remove(); });
      settleMonthChrome();
      var grid = gridEl();
      if (grid) {
        grid.style.transition = 'none';
        grid.style.opacity = '1';
        grid.style.transform = 'none';
      }
      swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, drag: false };
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (!swipe || e.touches.length !== 1) return;
      var dx = e.touches[0].clientX - swipe.x;
      var dy = e.touches[0].clientY - swipe.y;
      if (!swipe.drag) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) { swipe = null; return; }
        swipe.drag = true;
      }
      var grid = gridEl();
      if (!grid) return;
      var x = dx;
      if (!motionReduced() && calOffset >= 0 && dx < 0) x = Math.max(dx / 3, -24);
      if (motionReduced()) x = 0;
      grid.style.transition = 'none';
      grid.style.transform = x ? ('translateX(' + x + 'px)') : 'none';
      swipe.dx = dx;
    }, { passive: true });
    function endSwipe(dx) {
      var grid = gridEl();
      var towardFuture = calOffset >= 0 && dx < 0;
      var commit = !towardFuture && Math.abs(dx) >= 48;
      if (!commit) {
        if (grid && !motionReduced()) {
          var ms = towardFuture ? motionMs('--motion-state', 200) : motionMs('--motion-month', 250);
          grid.style.transition = 'transform ' + ms + 'ms var(--ease)';
          grid.style.transform = 'none';
        }
        return;
      }
      shiftMonth(dx < 0 ? 1 : -1);
    }
    el.addEventListener('touchend', function (e) {
      if (!swipe || !e.changedTouches.length) return;
      var dx = e.changedTouches[0].clientX - swipe.x;
      var dy = e.changedTouches[0].clientY - swipe.y;
      var dragged = swipe.drag;
      swipe = null;
      if (!dragged) return;
      if (Math.abs(dx) < Math.abs(dy)) return;
      endSwipe(dx);
    }, { passive: true });
    el.addEventListener('touchcancel', function () {
      if (!swipe) return;
      var dx = swipe.dx || 0;
      swipe = null;
      endSwipe(dx);
    }, { passive: true });
  })();

  var badgesExpanded = false;
  var BADGE_SEEN_KEY = 'zenflow_badges_seen';
  function readSeenBadges() {
    try { var a = JSON.parse(localStorage.getItem(BADGE_SEEN_KEY) || 'null'); return Array.isArray(a) ? a : null; } catch (e) { return null; }
  }
  function writeSeenBadges(days) {
    try { localStorage.setItem(BADGE_SEEN_KEY, JSON.stringify(days)); } catch (e) {}
  }
  function badgeHtml(m, cls, sub) {
    return '<div class="' + cls + '"><div class="b-ico"><span class="b-fill" aria-hidden="true"></span>' + ic(m.icon) + '</div><span class="b-d">' + m.days + ' 天</span><span class="b-n">' + sub + '</span></div>';
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
    var seen = readSeenBadges();
    var seenSet = {};
    (seen || []).forEach(function (d) { seenSet[d] = true; });
    var fresh = {};
    var present = motionReady() && !ceremonyHeld;
    if (seen === null) {
      writeSeenBadges(unlocked.map(function (x) { return x.m.days; }));
      unlocked.forEach(function (item) { seenSet[item.m.days] = true; });
    } else if (present) {
      var newly = [];
      unlocked.forEach(function (item) { if (!seenSet[item.m.days]) newly.push(item.m.days); });
      if (newly.length) {
        newly.forEach(function (d) { fresh[d] = true; seenSet[d] = true; });
        writeSeenBadges((seen || []).concat(newly));
      }
    }
    var shownSource = items.filter(function (item) { return seenSet[item.m.days] || fresh[item.m.days]; });
    var shown = items;
    if (!badgesExpanded) {
      var visNext = next;
      shown = visNext ? shownSource.slice(-3).concat([visNext]) : shownSource.slice(-4);
      if (!shown.length) shown = items.slice(0, 1);
    }
    $('badges').classList.toggle('expanded', badgesExpanded);
    $('badges').innerHTML = shown.map(function (item) {
      var m = item.m, cls = 'badge', sub = m.name;
      if (seenSet[m.days] || fresh[m.days]) cls += ' on';
      if (fresh[m.days]) cls += ' pop';
      else if (!(seenSet[m.days]) && next && next.m === m) { cls += ' next'; sub = '下一个'; }
      else if (!item.on && bd >= m.days) sub = '曾达成';
      return badgeHtml(m, cls, sub);
    }).join('');
    var presented = unlocked.filter(function (item) { return seenSet[item.m.days]; }).length;
    $('badgeCount').textContent = '已解锁 ' + presented + '/' + D.milestones.length;
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
    var reducedBreath = motionReduced();
    var breathMs = 1000;
    var cssBreath = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion-breath'));
    if (isFinite(cssBreath) && cssBreath > 0) breathMs = cssBreath / BREATH_IN * 1000;
    circle.style.transitionTimingFunction = 'ease-in-out';
    circle.style.transitionDuration = '0s';
    if (reducedBreath) {
      circle.style.transform = 'none';
      circle.style.opacity = '0.55';
      circle.style.transitionProperty = 'opacity';
    } else {
      circle.style.opacity = '';
      circle.style.transform = 'scale(.6)';
      circle.style.transitionProperty = 'transform';
    }
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
        circle.style.transitionDuration = ((inhale ? BREATH_IN : BREATH_OUT) * breathMs / 1000) + 's';
        circle.style.transitionTimingFunction = 'ease-in-out';
        if (reducedBreath) circle.style.opacity = inhale ? '1' : '0.55';
        else circle.style.transform = inhale ? 'scale(1)' : 'scale(.6)';
      }
      elapsed++;
      breathTimer = setTimeout(frame, breathMs);
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
  var actEdit = null;
  var actDraft = { mood: null, types: {}, triggers: {} };

  function selectedTypes(map) { return lapseTypes().filter(function (tp) { return map[tp.id]; }).map(function (tp) { return tp.id; }); }
  function renderLog() { renderRecords(); }
  function renderHistory() { if ($('calGrid')) renderRecords(); }

  function refreshChrome() {
    if (window.ZFCloud && window.ZFCloud.refreshChrome) window.ZFCloud.refreshChrome();
  }
  function readTagMap(root, attr) {
    var map = {};
    if (!root) return map;
    root.querySelectorAll('[' + attr + '].sel').forEach(function (b) { map[b.getAttribute(attr)] = true; });
    return map;
  }
  function findRelapse(id) {
    for (var i = 0; i < state.relapses.length; i++) if (state.relapses[i].id === id) return state.relapses[i];
    return null;
  }
  function findUrge(id) {
    for (var i = 0; i < state.urges.length; i++) if (state.urges[i].id === id) return state.urges[i];
    return null;
  }
  function atLocal(k, hh, mm) {
    var p = k.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], hh || 0, mm || 0, 0, 0).getTime();
  }
  function timeValue(ts) {
    var d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function combineDateTime(dateStr, timeStr) {
    if (!dateStr || !timeStr || dateStr.indexOf('-') < 0 || timeStr.indexOf(':') < 0) return NaN;
    var dp = dateStr.split('-'), tp = timeStr.split(':');
    return new Date(+dp[0], +dp[1] - 1, +dp[2], +tp[0] || 0, +tp[1] || 0, 0, 0).getTime();
  }
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
      if (u && dateKey(u.ts) === k) events.push({ kind: 'urge', ts: u.ts, u: u });
    });
    events.sort(function (a, b) { return a.ts - b.ts; });
    return events;
  }
  function closeDay() {
    if (!$('dayMask') || $('dayMask').classList.contains('hidden')) return;
    $('dayMask').classList.add('hidden');
    dayKey = null;
    unlockScroll();
  }
  function paintActLabels() {
    var today = dateKey(Date.now());
    var k = ($('actDate') && $('actDate').value) || actDay || today;
    if ($('actDateLabel')) {
      if (k === today) $('actDateLabel').textContent = t('record.today');
      else if (/^\d{4}-\d{2}-\d{2}$/.test(k) && window.ZFRecords) {
        var p = k.split('-');
        $('actDateLabel').textContent = window.ZFRecords.monthDay(new Date(+p[0], +p[1] - 1, +p[2]), (window.ZFStrings && window.ZFStrings.locale) || 'zh');
      }
    }
    if ($('actTimeLabel') && $('actTime')) $('actTimeLabel').textContent = $('actTime').value || '';
    if ($('actTitle')) {
      var key = actEdit ? 'record.edit' : 'record.form';
      $('actTitle').setAttribute('data-i18n', key);
      $('actTitle').textContent = t(key);
    }
    if ($('btnDeleteAct')) {
      $('btnDeleteAct').classList.toggle('hidden', !actEdit);
      var delAria = actEdit && actEdit.kind === 'checkin' ? ariaAttr('a11y.mood.delete') : ariaAttr('a11y.entry.delete');
      var delKey = (/data-i18n-aria="([^"]+)"/.exec(delAria) || [])[1];
      if (delKey) {
        $('btnDeleteAct').setAttribute('data-i18n-aria', delKey);
        $('btnDeleteAct').setAttribute('aria-label', t(delKey));
      }
    }
  }
  function renderActForm() {
    if (!$('actMoods')) return;
    $('actMoods').innerHTML = D.moods.map(function (m) {
      return '<button type="button" class="mood' + (actDraft.mood === m.v ? ' sel' : '') + '" data-act-mood="' + m.v + '" data-mood="' + m.v + '"><span class="e">' + ic(m.icon) + '</span>' + esc(moodLabel(m)) + '</button>';
    }).join('');
    if ($('actTypes')) $('actTypes').innerHTML = typeButtons(actDraft.types, 'data-act-type');
    if ($('actTriggers')) {
      $('actTriggers').innerHTML = D.triggers.map(function (name) {
        return '<button type="button" class="tag' + (actDraft.triggers[name] ? ' sel' : '') + '" data-act-trigger="' + esc(name) + '">' + esc(triggerLabel(name)) + '</button>';
      }).join('');
    }
    if ($('actOther')) $('actOther').classList.toggle('hidden', !actDraft.triggers['其他']);
    if ($('btnSaveAct')) {
      $('btnSaveAct').disabled = false;
      $('btnSaveAct').textContent = t('record.save');
    }
    paintActLabels();
  }
  function paintActChoices() {
    document.querySelectorAll('#actMoods [data-act-mood]').forEach(function (b) {
      b.classList.toggle('sel', actDraft.mood === +b.dataset.actMood);
    });
    document.querySelectorAll('#actTypes [data-act-type]').forEach(function (b) {
      b.classList.toggle('sel', !!actDraft.types[b.dataset.actType]);
    });
    document.querySelectorAll('#actTriggers [data-act-trigger]').forEach(function (b) {
      b.classList.toggle('sel', !!actDraft.triggers[b.getAttribute('data-act-trigger')]);
    });
    if ($('actOther')) $('actOther').classList.toggle('hidden', !actDraft.triggers['其他']);
  }
  function openAct(k, edit) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k > dateKey(Date.now())) { toast('还不能记录未来的日期'); return; }
    actEdit = edit || null;
    actDay = k;
    actDraft = { mood: null, types: {}, triggers: {} };
    var ts = k === dateKey(Date.now()) ? Date.now() : atLocal(k, new Date().getHours(), new Date().getMinutes());
    var note = '';
    if (actEdit && actEdit.kind === 'checkin') {
      var c = state.checkins[actEdit.id];
      if (c) {
        actDraft.mood = c.mood;
        note = c.note || '';
        if (c.ts) ts = c.ts;
      }
    } else if (actEdit && actEdit.kind === 'relapse') {
      var r = findRelapse(actEdit.id);
      if (r) {
        normalizeTypes(r.types).forEach(function (id) { actDraft.types[id] = true; });
        (r.triggers || []).forEach(function (name) { actDraft.triggers[name] = true; });
        note = r.note || '';
        ts = r.ts;
        if ($('actOther')) $('actOther').value = r.other || '';
      }
    } else if (actEdit && actEdit.kind === 'urge') {
      var u = findUrge(actEdit.id);
      if (u) ts = u.ts;
    }
    if (!actEdit || actEdit.kind !== 'relapse') { if ($('actOther')) $('actOther').value = ''; }
    if ($('actDate')) {
      $('actDate').value = k;
      $('actDate').max = dateKey(Date.now());
    }
    if ($('actTime')) $('actTime').value = timeValue(ts);
    if ($('actNote')) $('actNote').value = note;
    var mask = $('actMask');
    mask.classList.remove('hidden');
    lockScroll();
    renderActForm();
    var gen = ++actGen;
    if (!motionReady()) { mask.classList.add('is-open'); return; }
    requestAnimationFrame(function () {
      if (gen !== actGen) return;
      mask.classList.add('is-open');
    });
  }
  var actGen = 0;
  function closeAct(snapScrim) {
    var mask = $('actMask');
    if (!mask || mask.classList.contains('hidden')) return;
    var gen = ++actGen;
    if (snapScrim) mask.classList.add('scrim-snap');
    mask.classList.remove('is-open');
    actDay = null;
    actEdit = null;
    function finish() {
      if (gen !== actGen) return;
      mask.classList.remove('scrim-snap');
      mask.classList.add('hidden');
      unlockScroll();
      if (ringDeferred) { ringDeferred = false; updateTimer(); }
    }
    if (!motionReady()) { finish(); return; }
    var sheet = mask.querySelector('.sheet');
    var ms = motionMs(motionReduced() ? '--motion-reduced' : '--motion-sheet-out', 250);
    var done = false;
    function end(e) {
      if (e && e.target !== sheet) return;
      if (done) return;
      done = true;
      finish();
    }
    if (sheet) sheet.addEventListener('transitionend', end);
    setTimeout(end, ms + 80);
  }
  function focusSavedDay(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
    selectedDay = k;
    var p = k.split('-');
    calOffset = monthOffsetOf(new Date(+p[0], +p[1] - 1, +p[2]));
  }
  function refreshAfterAct() {
    if (current === 'home') renderHome();
    if ($('calGrid')) renderRecords();
    if (current === 'stats') renderStats();
  }
  function writeMood(k, mood, ts, note, fromKey) {
    if (fromKey && fromKey !== k && state.checkins[fromKey]) {
      delete state.checkins[fromKey];
      state.removed.checkins[fromKey] = Date.now();
    }
    var row = { mood: mood, ts: ts, editedAt: Date.now() };
    if (note) row.note = note;
    state.checkins[k] = row;
    if (state.removed.checkins[k] > 0) state.removed.checkins[k] = -Date.now();
  }
  function dropCheckin(key) {
    if (!key || !state.checkins[key]) return;
    delete state.checkins[key];
    state.removed.checkins[key] = Date.now();
  }
  function saveAct() {
    if (!actDay && !($('actDate') && $('actDate').value)) return;
    var k = $('actDate').value;
    var today = dateKey(Date.now());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || k > today) { toast('还不能记录未来的日期'); return; }
    var ts = combineDateTime(k, $('actTime').value);
    if (!isFinite(ts)) { toast('请选择时间'); return; }
    if (ts > Date.now() + 60000) { toast('时间不能晚于现在'); return; }
    var types = selectedTypes(actDraft.types);
    var note = ($('actNote').value || '').trim();
    var triggers = D.triggers.filter(function (name) { return actDraft.triggers[name]; });
    var other = actDraft.triggers['其他'] && $('actOther') ? $('actOther').value.trim() : '';
    var mood = actDraft.mood;
    var editing = actEdit;
    if (!editing && !mood && !types.length) { toast('先选择心情，或选择行为类型'); return; }
    if (editing && editing.kind === 'relapse' && !types.length) { toast('请至少选择一个类型'); return; }
    if (editing && editing.kind === 'checkin' && !mood && !types.length) { toast('先选择心情，或选择行为类型'); return; }
    var createsRelapse = types.length && !(editing && editing.kind === 'relapse');
    function write() {
      var changed = false;
      if (editing && editing.kind === 'relapse') {
        var r = findRelapse(editing.id);
        if (!r) return;
        r.ts = ts;
        r.types = types;
        r.triggers = triggers;
        r.other = other;
        r.note = note;
        r.streakMs = endedStreakMs(ts, types, r.id);
        r.editedAt = Date.now();
        changed = applyStreak(true);
        if (mood) writeMood(k, mood, ts, note, null);
        save();
      } else if (editing && editing.kind === 'urge' && !types.length) {
        var u = findUrge(editing.id);
        if (u) u.ts = ts;
        if (mood) writeMood(k, mood, ts, note, null);
        save();
      } else if (editing && editing.kind === 'urge' && types.length) {
        var gone = findUrge(editing.id);
        if (gone) {
          var ui = state.urges.findIndex(function (x) { return x.id === gone.id; });
          if (ui >= 0) state.urges.splice(ui, 1);
          state.removed.ids[gone.id] = Date.now();
        }
        if (mood) writeMood(k, mood, ts, note, null);
        var urged = commitRelapse({ ts: ts, types: types, triggers: triggers, other: other, note: note });
        changed = !!(urged && urged.changed);
      } else if (editing && editing.kind === 'checkin') {
        if (mood) writeMood(k, mood, ts, note, editing.id);
        else dropCheckin(editing.id);
        if (types.length) {
          var added = commitRelapse({ ts: ts, types: types, triggers: triggers, other: other, note: note });
          changed = !!(added && added.changed);
        } else save();
      } else {
        if (mood) writeMood(k, mood, ts, note, null);
        if (types.length) {
          var made = commitRelapse({ ts: ts, types: types, triggers: triggers, other: other, note: note });
          changed = !!(made && made.changed);
        } else save();
      }
      focusSavedDay(k);
      if (!editing) enterRowId = (made && made.id) || (urged && urged.id) || (added && added.id) || (mood ? k : null);
      dayAnimateNext = true;
      closeAct(!!changed);
      refreshAfterAct();
    }
    if (createsRelapse && relapseResets(types) && previewStart(ts, types) !== state.streakStart) {
      openModal({
        title: '这次会重置戒色天数',
        html: '<p>保存后连续天数从这次重算。历史和最长连续保留。</p>',
        ok: '保存并重新计算',
        warm: true,
        onOk: write
      });
      return;
    }
    write();
  }
  function exitRow(row, done) {
    if (!row || !motionReady()) { done(); return; }
    var gen = ++exitRow._g;
    row.style.pointerEvents = 'none';
    var reduced = motionReduced();
    var oms = reduced ? motionMs('--motion-reduced', 150) : motionMs('--motion-list', 200);
    var hms = reduced ? 0 : motionMs('--motion-height', 250);
    row.style.transition = 'opacity ' + oms + 'ms var(--ease)';
    row.style.opacity = '0';
    setTimeout(function () {
      if (gen !== exitRow._g) return;
      if (!hms) { done(); return; }
      var list = row.closest('.list') || row;
      var h = list.getBoundingClientRect().height;
      var btn = $('btnOpenActLog');
      var nodes = [];
      if (list !== row) nodes.push(list);
      if (btn) nodes.push(btn);
      nodes.forEach(function (el) {
        el.style.transition = 'none';
        el.style.transform = 'none';
      });
      if (list !== row) list.style.transformOrigin = 'top';
      row.offsetHeight;
      nodes.forEach(function (el) {
        el.style.transition = 'transform ' + hms + 'ms var(--ease)';
        el.style.transform = el === list ? 'scaleY(0)' : ('translateY(' + (-h) + 'px)');
      });
      setTimeout(function () {
        if (gen !== exitRow._g) return;
        nodes.forEach(function (el) {
          el.style.transition = 'none';
          el.style.transform = '';
        });
        done();
      }, hms + 40);
    }, oms + 30);
  }
  exitRow._g = 0;
  function performDelete(kind, id) {
    if (kind === 'checkin') {
      dropCheckin(id);
      save();
      return;
    }
    var arr = kind === 'relapse' ? state.relapses : state.urges;
    var i = arr.findIndex(function (x) { return x.id === id; });
    if (i >= 0) arr.splice(i, 1);
    if (id) state.removed.ids[id] = Date.now();
    if (kind === 'relapse') applyStreak(true);
    save();
  }
  function askDelete(kind, id) {
    if (!kind || !id) return;
    var html = '<p>' + esc(t('confirm.entryBody')) + '</p>';
    if (kind === 'relapse') html += '<p>' + esc(t('confirm.entryStreak')) + '</p>';
    if (kind === 'checkin') html = '<p>' + esc(t('confirm.moodBody', { date: id })) + '</p>';
    openModal({
      title: t('confirm.entryTitle'),
      html: html,
      ok: t('confirm.delete'),
      danger: true,
      onOk: function () {
        var row = document.querySelector('#dayList .row[data-kind="' + kind + '"][data-id="' + id + '"]');
        var closing = !!(actEdit && actEdit.kind === kind && actEdit.id === id);
        if (closing) closeAct();
        pendingDelete = { kind: kind, id: id };
        function run() {
          if (!pendingDelete || pendingDelete.id !== id || pendingDelete.kind !== kind) return;
          var live = document.querySelector('#dayList .row[data-kind="' + kind + '"][data-id="' + id + '"]') || row;
          exitRow(live, function () {
            if (!pendingDelete || pendingDelete.id !== id || pendingDelete.kind !== kind) return;
            pendingDelete = null;
            performDelete(kind, id);
            refreshAfterAct();
          });
        }
        if (!(closing && motionReady())) { run(); return; }
        var sheet = $('actMask') && $('actMask').querySelector('.sheet');
        var started = false;
        function go(e) {
          if (e && e.target && sheet && e.target !== sheet) return;
          if (started) return;
          started = true;
          if (sheet) sheet.removeEventListener('transitionend', go);
          run();
        }
        if (sheet) sheet.addEventListener('transitionend', go);
        setTimeout(go, motionMs(motionReduced() ? '--motion-reduced' : '--motion-sheet-out', 250) + 90);
      }
    });
  }
  function openRecord(kind, id) {
    if (kind === 'checkin') {
      if (!state.checkins[id]) return;
      openAct(id, { kind: 'checkin', id: id });
      return;
    }
    if (kind === 'urge') {
      var u = findUrge(id);
      if (!u) return;
      openAct(dateKey(u.ts), { kind: 'urge', id: id });
      return;
    }
    var r = findRelapse(id);
    if (!r) return;
    openAct(dateKey(r.ts), { kind: 'relapse', id: id });
  }
  if ($('btnOpenActLog')) $('btnOpenActLog').addEventListener('click', function () { openAct(selectedDay); });
  $('actClose').addEventListener('click', closeAct);
  $('actMask').addEventListener('click', function (e) { if (e.target === this) closeAct(); });
  $('actBody').addEventListener('click', function (e) {
    var moodBtn = e.target.closest('[data-act-mood]');
    if (moodBtn) {
      var v = +moodBtn.dataset.actMood;
      actDraft.mood = actDraft.mood === v ? null : v;
      paintActChoices();
      return;
    }
    var tp = e.target.closest('[data-act-type]');
    if (tp) { actDraft.types[tp.dataset.actType] = !actDraft.types[tp.dataset.actType]; paintActChoices(); return; }
    var tr = e.target.closest('[data-act-trigger]');
    if (tr) {
      var name = tr.getAttribute('data-act-trigger');
      actDraft.triggers[name] = !actDraft.triggers[name];
      paintActChoices();
    }
  });
  if ($('actDate')) $('actDate').addEventListener('change', function () {
    var v = this.value;
    var today = dateKey(Date.now());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v > today) {
      toast('还不能记录未来的日期');
      this.value = actDay || today;
      paintActLabels();
      return;
    }
    actDay = v;
    paintActLabels();
  });
  if ($('actTime')) $('actTime').addEventListener('change', function () {
    var ts = combineDateTime(($('actDate') && $('actDate').value) || actDay, this.value);
    if (isFinite(ts) && ts > Date.now() + 60000) {
      toast('时间不能晚于现在');
      this.value = timeValue(Date.now());
    }
    paintActLabels();
  });
  $('btnSaveAct').addEventListener('click', saveAct);
  if ($('btnDeleteAct')) $('btnDeleteAct').addEventListener('click', function () {
    if (actEdit) askDelete(actEdit.kind, actEdit.id);
  });
  if ($('dayClose')) $('dayClose').addEventListener('click', closeDay);
  if ($('dayMask')) $('dayMask').addEventListener('click', function (e) { if (e.target === this) closeDay(); });
  if ($('dayList')) {
    var rowSwipe = null;
    var swallowClick = false;
    $('dayList').addEventListener('touchstart', function (e) {
      var row = e.target.closest('.row');
      if (!row || e.touches.length !== 1) { rowSwipe = null; return; }
      rowSwipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, row: row };
    }, { passive: true });
    $('dayList').addEventListener('touchend', function (e) {
      if (!rowSwipe || !e.changedTouches.length) return;
      var dx = e.changedTouches[0].clientX - rowSwipe.x;
      var dy = e.changedTouches[0].clientY - rowSwipe.y;
      var row = rowSwipe.row;
      rowSwipe = null;
      if (dx > -56 || Math.abs(dx) < Math.abs(dy)) return;
      swallowClick = true;
      setTimeout(function () { swallowClick = false; }, 350);
      askDelete(row.dataset.kind, row.dataset.id);
    }, { passive: true });
    $('dayList').addEventListener('click', function (e) {
      if (swallowClick) return;
      var row = e.target.closest('.row');
      if (!row) return;
      openRecord(row.dataset.kind, row.dataset.id);
    });
  }


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
    var trows = Object.keys(tc).map(function (k) { return [triggerLabel(k), tc[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
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
    var mrows = D.moods.map(function (m) { return ['<span class="mood-tint" data-mood="' + m.v + '">' + ic(m.icon) + '</span>' + esc(moodLabel(m)), mc[m.v] || 0]; });
    $('moodChart').innerHTML = Object.keys(mc).length ? hbars(mrows, 'mint', true) : emptyState('smile', '还没有心情');

    // 建议
    var ins = [];
    if (r) {
      var peak = rb.indexOf(Math.max.apply(null, rb));
      ins.push(['clock', '高风险时段：<b>' + BUCKETS[peak][0] + ' ' + BUCKETS[peak][1] + '–' + (BUCKETS[peak][1] + 4) + ' 点</b>']);
    }
    if (trows.length) ins.push(['target', '最常见触发：<b>' + esc(trows[0][0]) + '</b>']);
    if (u) ins.push(['shield-check', '抵御冲动 <b>' + u + '</b> 次']);
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
    lock: '应用锁',
    about: '关于'
  };
  var settingsView = 'root';
  var settingsMotionGen = 0;
  var settingsMotionTimer = 0;
  var settingsMotionLive = false;
  var settingsMotionDone = null;
  var settingsIgnorePop = false;
  var edgeSwipe = null;
  function settingsViewFromHash() {
    var m = (location.hash || '').match(/^#settings(?:\/([a-z]+))?$/);
    if (!m) return null;
    if (!m[1]) return 'root';
    if (m[1] === 'privacy') return 'data';
    return SETTINGS_PAGES[m[1]] ? m[1] : 'root';
  }
  function paintSettingsChrome() {
    var isRoot = settingsView === 'root';
    if ($('settingsBack')) $('settingsBack').classList.toggle('hidden', isRoot);
    if ($('settingsMe')) $('settingsMe').classList.toggle('hidden', !isRoot);
    var settingsScreen = $('screen-settings');
    if (settingsScreen) settingsScreen.classList.toggle('settings-root', isRoot);
    if ($('settingsTitle')) $('settingsTitle').textContent = isRoot ? '设置' : (SETTINGS_PAGES[settingsView] || '设置');
  }
  function applySettingsDom() {
    if (settingsMotionLive) return;
    var isRoot = settingsView === 'root';
    var wrap = document.querySelector('.settings-wrap');
    if (wrap) {
      wrap.classList.remove('is-stack');
      wrap.style.minHeight = '';
    }
    var root = $('settingsRoot');
    if (root) {
      root.classList.toggle('hidden', !isRoot);
      root.style.transition = '';
      root.style.transform = '';
      root.style.opacity = '';
    }
    document.querySelectorAll('.settings-page').forEach(function (p) {
      var on = !isRoot && p.dataset.settingsPage === settingsView;
      p.classList.toggle('hidden', !on);
      p.style.transition = '';
      p.style.transform = '';
      p.style.opacity = '';
    });
    paintSettingsChrome();
  }
  function settingsShiftPx() {
    return Math.max(1, Math.round(window.innerWidth * 0.3));
  }
  function readSettingsProgress(layer) {
    if (!layer || !layer.page) return 0;
    if (motionReduced()) {
      var op = parseFloat(window.getComputedStyle(layer.page).opacity);
      return isFinite(op) ? Math.max(0, Math.min(1, 1 - op)) : 0;
    }
    var tr = window.getComputedStyle(layer.page).transform;
    var shift = settingsShiftPx();
    if (tr && tr !== 'none') {
      var m = tr.match(/matrix(?:3d)?\(([^)]+)\)/);
      if (m) {
        var parts = m[1].split(',').map(function (n) { return parseFloat(n); });
        var tx = parts.length === 16 ? parts[12] : parts[4];
        if (isFinite(tx)) return Math.max(0, Math.min(1, tx / shift));
      }
    }
    var op2 = parseFloat(window.getComputedStyle(layer.page).opacity);
    return isFinite(op2) ? Math.max(0, Math.min(1, 1 - op2)) : 0;
  }
  function poseSettings(layer, p, anim) {
    if (!layer) return;
    anim = anim || {};
    var reduced = motionReduced();
    var shift = settingsShiftPx();
    p = Math.max(0, Math.min(1, p));
    var dur = anim.duration || 0;
    var ease = anim.ease || 'linear';
    var trans = 'none';
    if (dur > 0) {
      trans = reduced
        ? ('opacity ' + dur + 'ms ' + ease)
        : ('transform ' + dur + 'ms ' + ease + ', opacity ' + dur + 'ms ' + ease);
    }
    layer.root.style.transition = trans;
    layer.page.style.transition = trans;
    if (reduced) {
      layer.root.style.transition = 'none';
      layer.root.style.transform = 'none';
      layer.root.style.opacity = '1';
      layer.page.style.transition = dur > 0 ? ('opacity ' + dur + 'ms ' + ease) : 'none';
      layer.page.style.transform = 'none';
      layer.page.style.opacity = String(1 - p);
    } else {
      layer.page.style.transform = 'translate3d(' + (shift * p) + 'px,0,0)';
      layer.page.style.opacity = String(1 - p);
      layer.root.style.transform = 'translate3d(' + (-shift * (1 - p)) + 'px,0,0)';
      layer.root.style.opacity = String(0.4 + 0.6 * p);
    }
  }
  function captureSettingsProgress(pageName) {
    var wrap = document.querySelector('.settings-wrap');
    var root = $('settingsRoot');
    var page = document.querySelector('.settings-page[data-settings-page="' + pageName + '"]');
    if (!wrap || !root || !page) return null;
    var layer = { wrap: wrap, root: root, page: page };
    var p;
    if (settingsMotionLive) p = readSettingsProgress(layer);
    else if (page.classList.contains('hidden')) p = 1;
    else if (root.classList.contains('hidden')) p = 0;
    else p = readSettingsProgress(layer);
    root.classList.remove('hidden');
    page.classList.remove('hidden');
    document.querySelectorAll('.settings-page').forEach(function (el) {
      if (el === page) return;
      el.classList.add('hidden');
      el.style.transition = '';
      el.style.transform = '';
      el.style.opacity = '';
    });
    var rh = root.offsetHeight;
    var ph = page.offsetHeight;
    wrap.classList.add('is-stack');
    wrap.style.minHeight = Math.max(rh, ph) + 'px';
    return { layer: layer, p: p };
  }
  function settleSettingsMotion(gen, target, pageName) {
    if (gen !== settingsMotionGen) return;
    settingsMotionLive = false;
    if (target >= 0.999) settingsView = 'root';
    else if (pageName) settingsView = pageName;
    applySettingsDom();
    updateSettingsChrome();
    var done = settingsMotionDone;
    settingsMotionDone = null;
    if (done) done();
  }
  function runSettingsProgress(pageName, target, opts) {
    opts = opts || {};
    var wasLive = settingsMotionLive;
    var gen = ++settingsMotionGen;
    clearTimeout(settingsMotionTimer);
    var captured = captureSettingsProgress(pageName);
    if (!captured) {
      settingsMotionLive = false;
      applySettingsDom();
      if (opts.onDone) opts.onDone();
      return;
    }
    var from = (wasLive || opts.from == null) ? captured.p : opts.from;
    settingsMotionLive = true;
    settingsMotionDone = opts.onDone || null;
    poseSettings(captured.layer, from, { duration: 0 });
    var dur = opts.duration || 0;
    if (dur <= 0 || Math.abs(from - target) < 0.002) {
      poseSettings(captured.layer, target, { duration: 0 });
      settleSettingsMotion(gen, target, pageName);
      return;
    }
    void captured.layer.page.offsetWidth;
    poseSettings(captured.layer, target, { duration: dur, ease: opts.ease || 'var(--ease)' });
    settingsMotionTimer = setTimeout(function () {
      settleSettingsMotion(gen, target, pageName);
    }, dur + 50);
  }
  function syncSettingsHash(view, opts) {
    if (opts.silent) return;
    var hash = view === 'root' ? '#settings' : ('#settings/' + view);
    var url = location.pathname + location.search + hash;
    try {
      if (opts.replace) history.replaceState({ zfSettings: view, zfEntry: !!opts.entry }, '', url);
      else history.pushState({ zfSettings: view }, '', url);
    } catch (e) {}
  }
  function commitSettingsHistory() {
    if (history.state && history.state.zfSettings && history.state.zfSettings !== 'root' && !history.state.zfEntry) {
      settingsIgnorePop = true;
      history.back();
    } else {
      try { history.replaceState({ zfSettings: 'root' }, '', location.pathname + location.search + '#settings'); } catch (e) {}
    }
  }
  function showSettings(view, opts) {
    opts = opts || {};
    if (view !== 'root' && !SETTINGS_PAGES[view]) view = 'root';
    var prev = settingsView;
    if (prev === view) {
      syncSettingsHash(view, opts);
      return;
    }
    settingsView = view;
    if (view === 'resets') renderResetToggles();
    if (view === 'goal') renderGoalControl();
    if (view === 'lock') paintLockGrace();
    updateSettingsChrome();
    syncSettingsHash(view, opts);
    var animate = !opts.instant && motionReady() && ((prev === 'root' && view !== 'root') || (view === 'root' && prev !== 'root'));
    if (animate && view !== 'root') paintSettingsChrome();
    if (!animate) {
      settingsMotionLive = false;
      settingsMotionGen++;
      clearTimeout(settingsMotionTimer);
      applySettingsDom();
      window.scrollTo(0, 0);
      return;
    }
    var pageName = view === 'root' ? prev : view;
    var entering = view !== 'root';
    var reduced = motionReduced();
    runSettingsProgress(pageName, entering ? 0 : 1, {
      from: entering ? 1 : 0,
      duration: motionMs(entering ? '--motion-settings-in' : '--motion-settings-out', entering ? 300 : 250),
      ease: reduced ? 'linear' : (entering ? 'var(--ease-sheet)' : 'var(--ease-exit)')
    });
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
    box.innerHTML = lapseTypes().map(function (tp) {
      var on = !!state.resetTypes[tp.id];
      var locked = tp.id === 'masturbation';
      var name = typeName(tp.id);
      return '<div class="reset-row" data-type="' + tp.id + '"><span class="type-ico">' + ic(tp.icon) + '</span><div class="reset-copy"><b>' + esc(name) + '</b><p>' +
        (locked ? '不能关闭' : (on ? '重置天数' : '不重置天数')) +
        '</p></div><button type="button" class="switch' + (on ? ' on' : '') + (locked ? ' locked' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"' + ariaAttr('a11y.reset', { type: name }) + ' data-reset-type="' + tp.id + '"' + (locked ? ' disabled' : '') + '><span class="switch-knob"></span></button></div>';
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
    paintLockRow();
  }
  function renderSettings() {
    applySettingsDom();
    renderGoalControl();
    renderResetToggles();
    renderThemeControl();
    $('reasonsEdit').innerHTML = state.reasons.length
      ? state.reasons.map(function (r, i) { return '<li><span>' + esc(r) + '</span><button data-i="' + i + '"' + ariaAttr('a11y.reason.delete') + '>' + ic('x') + '</button></li>'; }).join('')
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
    if (settingsIgnorePop) { settingsIgnorePop = false; return; }
    var v = settingsViewFromHash();
    if (v) {
      if (current !== 'settings') {
        settingsMotionLive = false;
        settingsView = v;
        go('settings');
        return;
      }
      if (v !== settingsView) {
        showSettings(v, { silent: true });
        return;
      }
      applySettingsDom();
      if (v === 'resets') renderResetToggles();
      updateSettingsChrome();
      return;
    }
    if (current === 'settings' && settingsView !== 'root') showSettings('root', { silent: true });
  });
  (function bindSettingsEdge() {
    function endEdge(e) {
      if (!edgeSwipe || e.pointerId !== edgeSwipe.id) return;
      var s = edgeSwipe;
      edgeSwipe = null;
      if (!s.active) return;
      var dx = e.clientX - s.x0;
      var now = performance.now();
      var dt = now - s.lastT;
      var vx = (dt > 0 && dt < 80) ? ((e.clientX - s.lastX) / dt) : s.vx;
      var p = s.p != null ? s.p : (s.p0 || 0);
      var commit = p > 0.35 || (vx > 0.45 && dx > 20);
      var reduced = motionReduced();
      if (commit) {
        runSettingsProgress(s.page, 1, {
          duration: motionMs('--motion-settings-out', 250),
          ease: reduced ? 'linear' : 'var(--ease-exit)',
          onDone: commitSettingsHistory
        });
      } else {
        runSettingsProgress(s.page, 0, {
          duration: motionMs('--motion-state', 200),
          ease: reduced ? 'linear' : 'var(--ease)'
        });
      }
      function stopClick(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        window.removeEventListener('click', stopClick, true);
      }
      window.addEventListener('click', stopClick, true);
      setTimeout(function () { window.removeEventListener('click', stopClick, true); }, 400);
    }
    document.addEventListener('pointerdown', function (e) {
      if (motionReduced()) return;
      if (current !== 'settings' || settingsView === 'root') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.clientX > 28) return;
      var blocked = e.target && e.target.closest && e.target.closest('#tabbar, #modalMask, #actMask, #authMask, #lockShell');
      if (blocked && !blocked.classList.contains('hidden')) return;
      edgeSwipe = {
        id: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        lastX: e.clientX,
        lastT: performance.now(),
        vx: 0,
        active: false,
        page: settingsView
      };
    });
    document.addEventListener('pointermove', function (e) {
      if (!edgeSwipe || e.pointerId !== edgeSwipe.id) return;
      var dx = e.clientX - edgeSwipe.x0;
      var dy = e.clientY - edgeSwipe.y0;
      if (!edgeSwipe.active) {
        if (dx > 8 && Math.abs(dx) > Math.abs(dy)) {
          edgeSwipe.active = true;
          var cap = captureSettingsProgress(edgeSwipe.page);
          edgeSwipe.layer = cap && cap.layer;
          edgeSwipe.p0 = cap ? cap.p : 0;
          edgeSwipe.trackX = e.clientX;
          settingsMotionGen++;
          clearTimeout(settingsMotionTimer);
          settingsMotionLive = true;
          settingsMotionDone = null;
          if (edgeSwipe.layer) poseSettings(edgeSwipe.layer, edgeSwipe.p0, { duration: 0 });
        } else if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          edgeSwipe = null;
        }
        return;
      }
      if (e.cancelable) e.preventDefault();
      var now = performance.now();
      var dt = now - edgeSwipe.lastT;
      if (dt > 0) edgeSwipe.vx = (e.clientX - edgeSwipe.lastX) / dt;
      edgeSwipe.lastX = e.clientX;
      edgeSwipe.lastT = now;
      if (!edgeSwipe.layer) return;
      var shift = settingsShiftPx();
      var p = edgeSwipe.p0 + ((e.clientX - edgeSwipe.trackX) / shift);
      if (p < 0) p = 0;
      if (p > 1) p = 1;
      poseSettings(edgeSwipe.layer, p, { duration: 0 });
      edgeSwipe.p = p;
    }, { passive: false });
    document.addEventListener('pointerup', endEdge);
    document.addEventListener('pointercancel', endEdge);
  })();
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
    var i = +b.dataset.i;
    if (!(i >= 0 && i < state.reasons.length)) return;
    openModal({
      title: t('confirm.reasonTitle'),
      html: '<p>' + esc(t('confirm.reasonBody')) + '</p>',
      ok: t('confirm.delete'),
      danger: true,
      onOk: function () {
        var gone = state.reasons.splice(i, 1)[0];
        if (gone != null && state.reasons.indexOf(gone) < 0) state.removed.reasons[gone] = Date.now();
        save();
        renderSettings();
      }
    });
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
        html: '<p>' + Object.keys(parsed.checkins).length + ' 条心情，' + parsed.urges.length + ' 次抵御冲动，' + parsed.relapses.length + ' 条破戒。会覆盖当前记录。</p>',
        ok: '覆盖导入',
        onOk: function () { state = parsed; state.streakStartSetAt = Date.now(); save({ replaceAll: true }); if (importedTheme) setTheme(importedTheme, true); renderSettings(); toast('导入成功'); }
      });
    };
    reader.readAsText(f);
  });
  $('btnReset').addEventListener('click', function () {
    openModal({
      title: '重置本机数据？',
      html: '<p>会清空心情、记录和理由。登录时会覆盖云端。输入「重置」确认。</p><input type="text" id="resetConfirm" placeholder="重置" />',
      ok: '确认重置', danger: true,
      onOk: function () {
        if ($('resetConfirm').value.trim() !== '重置') { toast('请输入「重置」'); return false; }
        state = defaultState(); save({ replaceAll: true });
        calOffset = 0;
        selectedDay = dateKey(Date.now());
        if (actDay) closeAct();
        if (dayKey) closeDay();
        renderSettings(); toast('已重置');
      }
    });
  });

  /* ---------------- 应用锁 ---------------- */
  var lockFlow = null;
  var lockBusy = false;
  var sessionUnlocked = !(window.ZFLock && window.ZFLock.enabled());
  var lockHiddenAt = 0;
  var lockProvisional = false;
  var lockWaitTimer = null;

  function paintLockRow() {
    if (!$('appLockSwitch') || !window.ZFLock) return;
    var on = window.ZFLock.enabled();
    $('appLockSwitch').classList.toggle('on', on);
    $('appLockSwitch').setAttribute('aria-checked', on ? 'true' : 'false');
    if ($('btnChangePass')) $('btnChangePass').classList.toggle('hidden', !on);
    if ($('appLockSub')) {
      if (!on) $('appLockSub').textContent = t('lock.off');
      else {
        var g = window.ZFLock.grace();
        $('appLockSub').textContent = g === 'now' ? t('lock.graceNow') : g === '5m' ? t('lock.grace5') : t('lock.grace1');
      }
    }
    paintLockGrace();
  }
  function paintLockGrace() {
    if (!$('lockGraceSeg') || !window.ZFLock) return;
    var g = window.ZFLock.enabled() ? window.ZFLock.grace() : '';
    $('lockGraceSeg').querySelectorAll('[data-grace]').forEach(function (b) {
      var on = b.getAttribute('data-grace') === g;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  function showLockShell() {
    document.documentElement.classList.add('lock-on');
    $('lockScreen').classList.remove('hidden');
    document.documentElement.classList.remove('lock-pending');
  }
  function hideLockShell() {
    if ($('lockScreen')) $('lockScreen').classList.add('hidden');
    if ($('lockForgotMask')) $('lockForgotMask').classList.add('hidden');
    document.documentElement.classList.remove('lock-on');
    document.documentElement.classList.remove('lock-pending');
    lockFlow = null;
  }
  function lockTitle() {
    if (!lockFlow) return '';
    if (lockFlow.mode === 'unlock') return t('lock.enterTitle');
    if (lockFlow.mode === 'disable') return t('lock.currentTitle');
    if (lockFlow.mode === 'change' && lockFlow.step === 'current') return t('lock.currentTitle');
    if (lockFlow.step === 'confirm') return t('lock.confirmTitle');
    if (lockFlow.mode === 'change') return t('lock.newTitle');
    return t('lock.setTitle');
  }
  function paintDots() {
    var n = lockFlow ? lockFlow.buf.length : 0;
    var dots = $('lockDots');
    if (!dots) return;
    for (var i = 0; i < dots.children.length; i++) dots.children[i].classList.toggle('on', i < n);
  }
  function paintLockWait() {
    var left = window.ZFLock ? window.ZFLock.waitRemaining() : 0;
    var waiting = left > 0;
    document.querySelectorAll('#lockPad [data-key]').forEach(function (b) {
      if (b.getAttribute('data-key') === 'del') return;
      b.disabled = waiting || lockBusy;
    });
    if (waiting && $('lockMsg')) $('lockMsg').textContent = t('lock.wait', { n: Math.ceil(left / 1000) });
    if (lockWaitTimer) { clearTimeout(lockWaitTimer); lockWaitTimer = null; }
    if (waiting) lockWaitTimer = setTimeout(paintLockWait, 250);
  }
  function renderLockChrome() {
    if (!$('lockTitle') || !lockFlow) return;
    $('lockTitle').textContent = lockTitle();
    var cancellable = lockFlow.mode !== 'unlock';
    $('lockCancel').classList.toggle('hidden', !cancellable);
    var showForgot = lockFlow.mode === 'unlock' || lockFlow.mode === 'disable' || (lockFlow.mode === 'change' && lockFlow.step === 'current');
    $('lockForgot').classList.toggle('hidden', !showForgot);
    paintDots();
    paintLockWait();
  }
  function presentLock(mode) {
    lockFlow = { mode: mode, step: (mode === 'set' || mode === 'change') ? (mode === 'change' ? 'current' : 'neu') : 'enter', first: '', buf: '' };
    if (mode === 'set') lockFlow.step = 'neu';
    if ($('lockMsg')) $('lockMsg').textContent = '';
    var dots = $('lockDots');
    if (dots) dots.classList.remove('shake');
    showLockShell();
    renderLockChrome();
  }
  function shakeLock(msg, after) {
    var dots = $('lockDots');
    if (dots) {
      dots.classList.remove('shake');
      void dots.offsetWidth;
      dots.classList.add('shake');
    }
    if ($('lockMsg')) $('lockMsg').textContent = msg;
    setTimeout(function () {
      if (lockFlow) lockFlow.buf = '';
      if (after) after();
      paintDots();
      renderLockChrome();
    }, 900);
  }
  function finishLockOk(message) {
    sessionUnlocked = true;
    lockProvisional = false;
    hideLockShell();
    paintLockRow();
    if (message) toast(message);
  }
  function onLockFour(code) {
    if (!lockFlow || lockBusy) return;
    if (window.ZFLock.waitRemaining() > 0) { paintLockWait(); return; }
    if (lockFlow.step === 'neu') {
      lockFlow.first = code;
      lockFlow.step = 'confirm';
      lockFlow.buf = '';
      if ($('lockMsg')) $('lockMsg').textContent = '';
      renderLockChrome();
      return;
    }
    if (lockFlow.step === 'confirm') {
      if (code !== lockFlow.first) {
        var back = lockFlow.mode;
        shakeLock(t('lock.mismatch'), function () {
          if (!lockFlow) return;
          lockFlow.step = 'neu';
          lockFlow.first = '';
          lockFlow.mode = back;
        });
        return;
      }
      lockBusy = true;
      var mode = lockFlow.mode;
      var keep = mode === 'change' ? window.ZFLock.grace() : '1m';
      window.ZFLock.setPasscode(code, keep).then(function () {
        lockBusy = false;
        finishLockOk(mode === 'change' ? t('lock.changed') : t('lock.onToast'));
      }, function () {
        lockBusy = false;
        shakeLock(t('lock.wrong'));
      });
      return;
    }
    lockBusy = true;
    window.ZFLock.verify(code).then(function (ok) {
      lockBusy = false;
      if (!lockFlow) return;
      if (!ok) {
        var r = window.ZFLock.noteFail();
        shakeLock(r.locked ? t('lock.wait', { n: Math.ceil(r.wait / 1000) }) : t('lock.wrong'));
        return;
      }
      window.ZFLock.clearFails();
      if (lockFlow.mode === 'unlock') { finishLockOk(''); return; }
      if (lockFlow.mode === 'disable') {
        window.ZFLock.clear();
        finishLockOk(t('lock.offToast'));
        return;
      }
      if (lockFlow.mode === 'change') {
        lockFlow.step = 'neu';
        lockFlow.first = '';
        lockFlow.buf = '';
        if ($('lockMsg')) $('lockMsg').textContent = '';
        renderLockChrome();
      }
    }, function () {
      lockBusy = false;
      shakeLock(t('lock.wrong'));
    });
  }
  function pushLockDigit(d) {
    if (!lockFlow || lockBusy) return;
    if (window.ZFLock.waitRemaining() > 0) return;
    if (lockFlow.buf.length >= 4) return;
    lockFlow.buf += d;
    if ($('lockMsg') && window.ZFLock.waitRemaining() <= 0) $('lockMsg').textContent = '';
    paintDots();
    if (lockFlow.buf.length === 4) {
      var code = lockFlow.buf;
      setTimeout(function () { onLockFour(code); }, 60);
    }
  }
  function popLockDigit() {
    if (!lockFlow || lockBusy || !lockFlow.buf) return;
    lockFlow.buf = lockFlow.buf.slice(0, -1);
    paintDots();
  }
  function lockAfterWipe() {
    sessionUnlocked = true;
    lockProvisional = false;
    hideLockShell();
    paintLockRow();
  }
  function markLockHidden() {
    if (!window.ZFLock || !window.ZFLock.enabled() || !sessionUnlocked) return;
    lockHiddenAt = Date.now();
    if ($('lockScreen').classList.contains('hidden')) {
      lockProvisional = true;
      presentLock('unlock');
    }
  }
  function markLockShown() {
    if (!lockHiddenAt) return;
    var elapsed = Date.now() - lockHiddenAt;
    lockHiddenAt = 0;
    if (!window.ZFLock || !window.ZFLock.enabled()) return;
    if (elapsed >= window.ZFLock.graceMs()) {
      if (sessionUnlocked || lockProvisional) {
        lockProvisional = false;
        sessionUnlocked = false;
        presentLock('unlock');
      }
    } else if (lockProvisional) {
      lockProvisional = false;
      hideLockShell();
    }
  }
  if ($('appLockSwitch')) $('appLockSwitch').addEventListener('click', function (e) {
    e.stopPropagation();
    if (!window.ZFLock) return;
    if (window.ZFLock.enabled()) presentLock('disable');
    else presentLock('set');
  });
  if ($('btnAppLockPage')) $('btnAppLockPage').addEventListener('click', function () {
    if (window.ZFLock && window.ZFLock.enabled()) showSettings('lock');
  });
  if ($('btnChangePass')) $('btnChangePass').addEventListener('click', function () { presentLock('change'); });
  if ($('lockGraceSeg')) $('lockGraceSeg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-grace]');
    if (!b || !window.ZFLock || !window.ZFLock.enabled()) return;
    window.ZFLock.setGrace(b.getAttribute('data-grace'));
    paintLockRow();
  });
  if ($('lockPad')) $('lockPad').addEventListener('click', function (e) {
    var b = e.target.closest('[data-key]');
    if (!b) return;
    var key = b.getAttribute('data-key');
    if (key === 'del') popLockDigit();
    else pushLockDigit(key);
  });
  if ($('lockCancel')) $('lockCancel').addEventListener('click', function () {
    if (!lockFlow || lockFlow.mode === 'unlock') return;
    sessionUnlocked = true;
    hideLockShell();
    paintLockRow();
  });
  if ($('lockForgot')) $('lockForgot').addEventListener('click', function () {
    if ($('lockForgotMask')) $('lockForgotMask').classList.remove('hidden');
  });
  if ($('lockForgotCancel')) $('lockForgotCancel').addEventListener('click', function () {
    $('lockForgotMask').classList.add('hidden');
  });
  if ($('lockForgotMask')) $('lockForgotMask').addEventListener('click', function (e) {
    if (e.target === this) this.classList.add('hidden');
  });
  if ($('lockForgotOk')) $('lockForgotOk').addEventListener('click', function () {
    var btn = $('lockForgotOk');
    btn.disabled = true;
    var done = function () { btn.disabled = false; };
    if (window.ZFCloud && window.ZFCloud.logout) {
      Promise.resolve(window.ZFCloud.logout({ toast: '已退出' })).then(done, function () {
        if (window.ZFLock) window.ZFLock.clear();
        lockAfterWipe();
        done();
      });
    } else {
      if (window.ZFLock) window.ZFLock.clear();
      if (window.ZenFlowCore && window.ZenFlowCore.wipeLocal) window.ZenFlowCore.wipeLocal();
      lockAfterWipe();
      done();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (!$('lockScreen') || $('lockScreen').classList.contains('hidden')) return;
    if ($('lockForgotMask') && !$('lockForgotMask').classList.contains('hidden')) return;
    if (e.key >= '0' && e.key <= '9') { pushLockDigit(e.key); e.preventDefault(); }
    else if (e.key === 'Backspace') { popLockDigit(); e.preventDefault(); }
    else if (e.key === 'Escape' && lockFlow && lockFlow.mode !== 'unlock') {
      sessionUnlocked = true;
      hideLockShell();
      paintLockRow();
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') markLockHidden();
    else markLockShown();
  });
  window.addEventListener('pagehide', markLockHidden);
  window.addEventListener('pageshow', markLockShown);
  window.ZFLockUI = { afterWipe: lockAfterWipe, present: presentLock };

  /* ---------------- 启动 ---------------- */
  load();
  applyTheme(getTheme(), false);
  applyNewCopy();
  renderHome();
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.documentElement.classList.add('motion-ready');
      if (!ceremonyHeld) { updateTimer(); renderBadges(); }
    });
  });
  var lastDay = dateKey(Date.now());
  setInterval(function () {
    if (current === 'home') {
      updateTimer();
      var k = dateKey(Date.now());
      if (k !== lastDay) { lastDay = k; renderHome(); }
    }
  }, 1000);
  paintLockRow();
  if (window.ZFLock && window.ZFLock.enabled()) presentLock('unlock');
  else document.documentElement.classList.remove('lock-pending');
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
  var APP_VERSION = '46';
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
  window.ZenFlow = {
    version: APP_VERSION, go: go, state: function () { return state; }, setTheme: setTheme, getTheme: getTheme,
    setMotionScale: function (n) {
      if (n && n !== 1) document.documentElement.setAttribute('data-motion-scale', String(n));
      else document.documentElement.removeAttribute('data-motion-scale');
    },
    playCeremony: function () {
      ceremonyHeld = false;
      try { sessionStorage.removeItem('zf-hold-ceremony'); } catch (e) {}
      updateTimer();
      renderBadges();
    }
  };

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
      selectedDay = dateKey(Date.now());
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
