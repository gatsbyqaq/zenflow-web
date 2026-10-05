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
      // 云同步用：开始时间最后一次被设置的时间；已删除条目的墓碑（避免同步时被另一台设备"复活"）
      streakStartSetAt: now,
      removed: { ids: {}, reasons: {} }   // ids: { id: 删除时间 }；reasons: { 文本: 删除时间（负数 = 之后又重新添加） }
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
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && c && c.mood >= 1 && c.mood <= 5) s.checkins[k] = { mood: Math.round(c.mood), ts: +c.ts || 0 };
      });
    }
    if (Array.isArray(o.relapses)) {
      s.relapses = o.relapses.filter(function (r) { return r && typeof r.ts === 'number'; }).map(function (r) {
        return {
          id: String(r.id || uid()), ts: r.ts,
          triggers: Array.isArray(r.triggers) ? r.triggers.map(String).slice(0, 10) : [],
          other: r.other ? String(r.other).slice(0, 40) : '',
          note: r.note ? String(r.note).slice(0, 1000) : '',
          streakMs: +r.streakMs || 0
        };
      });
    }
    if (Array.isArray(o.urges)) {
      s.urges = o.urges.filter(function (u) { return u && typeof u.ts === 'number'; }).map(function (u) { return { id: String(u.id || uid()), ts: u.ts }; });
    }
    if (Array.isArray(o.reasons)) s.reasons = o.reasons.map(String).filter(Boolean).slice(0, 50);
    s.streakStartSetAt = typeof o.streakStartSetAt === 'number' && isFinite(o.streakStartSetAt) ? o.streakStartSetAt : 0;
    var rm = o.removed && typeof o.removed === 'object' ? o.removed : {};
    ['ids', 'reasons'].forEach(function (k) {
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
  function unlockScroll() {
    if (lockedY === null) return;
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
  $('modalOk').addEventListener('click', function () {
    if (modalOk && modalOk() === false) return;
    closeModal();
  });

  /* ---------------- 导航 ---------------- */
  var current = 'home';
  function go(tab) {
    if (current === 'sos' && tab !== 'sos') resetSos();
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
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-goto]');
    if (g) go(g.dataset.goto);
  });

  // 键盘：Esc 关闭弹窗；1–4 切换页面、S 打开急救（输入框内或按住修饰键时不触发）
  document.addEventListener('keydown', function (e) {
    var modalOpen = !$('modalMask').classList.contains('hidden');
    if (e.key === 'Escape') { if (modalOpen) { e.preventDefault(); closeModal(); } return; }
    if (modalOpen || (window.ZFAdmin && window.ZFAdmin.isOpen && window.ZFAdmin.isOpen()) || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return;
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
    var w = milestoneWindow(dFloat);
    var p = Math.min(1, Math.max(0, (dFloat - w.prev) / (w.next - w.prev)));
    $('ringFg').style.strokeDashoffset = (RING_LEN * (1 - p)).toFixed(2);
    $('msBar').style.width = (p * 100).toFixed(1) + '%';
    var left = w.next * DAY - ms;
    var lh = Math.ceil(left / 3600000);
    var leftTxt = left >= DAY ? (Math.floor(left / DAY) + ' 天 ' + Math.floor(left % DAY / 3600000) + ' 小时') : (lh + ' 小时');
    var beyond = dFloat >= 90 ? '（已完成全部里程碑，继续前行）' : '';
    $('nextMs').textContent = '距离 ' + w.next + ' 天里程碑还有 ' + leftTxt + ' · ' + Math.floor(p * 100) + '%' + beyond;
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

  function renderCheckin() {
    var today = state.checkins[dateKey(Date.now())];
    $('checkinArea').classList.toggle('hidden', !!today);
    $('checkinDone').classList.toggle('hidden', !today);
    if (today) {
      var m = D.moods.filter(function (x) { return x.v === today.mood; })[0] || D.moods[2];
      var msg = today.mood >= 4 ? '状态不错，继续保持！' : today.mood === 3 ? '平稳也是一种力量。' : '辛苦了，照顾好自己，今天能打卡已经很棒了。';
      $('checkinDone').setAttribute('data-mood', m.v);
      $('checkinDone').innerHTML = '<span class="e">' + ic(m.icon) + '</span><div><b>今日已打卡 · ' + m.t + '</b><p class="small muted" style="margin:2px 0 0">' + msg + '</p></div>';
      return;
    }
    var html = D.moods.map(function (m) {
      return '<button class="mood' + (selMood === m.v ? ' sel' : '') + '" data-mood="' + m.v + '"><span class="e">' + ic(m.icon) + '</span>' + m.t + '</button>';
    }).join('');
    $('moodPicker').innerHTML = html;
    $('btnCheckin').disabled = !selMood;
    $('btnCheckin').innerHTML = selMood ? ic('check') + '完成今日打卡' : '选择心情后打卡';
  }
  $('moodPicker').addEventListener('click', function (e) {
    var b = e.target.closest('.mood'); if (!b) return;
    selMood = +b.dataset.mood; renderCheckin();
  });
  $('btnCheckin').addEventListener('click', function () {
    var k = dateKey(Date.now());
    if (state.checkins[k]) { toast('今天已经打过卡啦'); return; }
    if (!selMood) return;
    state.checkins[k] = { mood: selMood, ts: Date.now() };
    selMood = null; save();
    toast('打卡成功，又是认真生活的一天');
    renderHome();
  });

  var calOffset = 0;
  function renderCalendar() {
    var base = new Date(); base.setDate(1); base.setMonth(base.getMonth() + calOffset);
    var y = base.getFullYear(), mo = base.getMonth();
    $('calTitle').textContent = y + '年' + (mo + 1) + '月';
    $('calNext').disabled = calOffset >= 0; $('calNext').style.opacity = calOffset >= 0 ? .35 : 1;
    var first = (new Date(y, mo, 1).getDay() + 6) % 7; // 周一为第一天
    var count = new Date(y, mo + 1, 0).getDate();
    var todayK = dateKey(Date.now());
    var relapseDays = {};
    state.relapses.forEach(function (r) { relapseDays[dateKey(r.ts)] = true; });
    var html = '';
    for (var i = 0; i < first; i++) html += '<div class="cal-cell empty"></div>';
    for (var d = 1; d <= count; d++) {
      var k = y + '-' + pad(mo + 1) + '-' + pad(d);
      var cls = 'cal-cell';
      var c = state.checkins[k];
      if (c) cls += ' m' + c.mood;
      if (relapseDays[k]) cls += ' relapse';
      if (k === todayK) cls += ' today';
      else if (k > todayK) cls += ' future';
      var title = k + (c ? ' 已打卡' : '') + (relapseDays[k] ? ' · 有破戒记录' : '');
      html += '<div class="' + cls + '" title="' + title + '">' + d + '</div>';
    }
    $('calGrid').innerHTML = html;
  }
  $('calPrev').addEventListener('click', function () { calOffset--; renderCalendar(); });
  $('calNext').addEventListener('click', function () { if (calOffset < 0) { calOffset++; renderCalendar(); } });

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

  $('btnAdjustStart').addEventListener('click', function () {
    openModal({
      title: '调整开始时间',
      html: '<p>如果你是之前就开始坚持的，可以在这里设置真实的开始时间。</p><input type="datetime-local" id="startInput" value="' + toLocalInput(state.streakStart) + '" max="' + toLocalInput(Date.now()) + '" />',
      ok: '保存',
      onOk: function () {
        var t = parseLocalInput($('startInput').value);
        if (!isFinite(t)) { toast('请选择有效的时间'); return false; }
        if (t > Date.now()) { toast('开始时间不能晚于现在'); return false; }
        state.streakStart = t; state.streakStartSetAt = Date.now(); save(); renderHome(); toast('开始时间已更新');
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
  function renderLog() {
    $('relapseTime').value = toLocalInput(Date.now());
    $('relapseTime').max = toLocalInput(Date.now() + 60000);
    renderTriggerTags();
    renderHistory();
  }
  function renderTriggerTags() {
    $('triggerTags').innerHTML = D.triggers.map(function (t) {
      return '<button class="tag' + (selTriggers[t] ? ' sel' : '') + '" data-t="' + t + '">' + t + '</button>';
    }).join('');
    $('otherTrigger').classList.toggle('hidden', !selTriggers['其他']);
  }
  $('triggerTags').addEventListener('click', function (e) {
    var b = e.target.closest('.tag'); if (!b) return;
    var t = b.dataset.t; selTriggers[t] = !selTriggers[t];
    renderTriggerTags();
  });

  $('btnLogRelapse').addEventListener('click', function () {
    var ts = parseLocalInput($('relapseTime').value);
    if (!isFinite(ts)) { toast('请选择发生时间'); return; }
    if (ts > Date.now() + 60000) { toast('时间不能晚于现在'); return; }
    var triggers = D.triggers.filter(function (t) { return selTriggers[t]; });
    var other = selTriggers['其他'] ? $('otherTrigger').value.trim() : '';
    var note = $('relapseNote').value.trim();
    var resets = ts > state.streakStart;
    openModal({
      title: '确认记录？',
      html: resets
        ? '<p>记录后，当前的连续天数（' + fmtDays(ts - state.streakStart) + ' 天）将从这一刻重新计算，历史记录和最佳纪录都会保留。</p><p>一次失误不会抹去你之前的努力。休息一下，然后重新出发。</p>'
        : '<p>这个时间早于当前连续记录的开始时间，将只添加到历史记录中，不会影响当前连续天数。</p>',
      ok: resets ? '记录并重新开始' : '添加记录',
      warm: true,
      onOk: function () {
        var streak = resets ? ts - state.streakStart : 0;
        state.relapses.push({ id: uid(), ts: ts, triggers: triggers, other: other, note: note, streakMs: streak });
        if (resets) {
          state.bestStreakMs = Math.max(state.bestStreakMs, streak);
          state.streakStart = ts; state.streakStartSetAt = Date.now();
        }
        save();
        selTriggers = {}; $('otherTrigger').value = ''; $('relapseNote').value = '';
        renderLog();
        toast(resets ? '已记录。新的开始，从现在起' : '已添加到历史记录');
      }
    });
  });

  function renderHistory() {
    var items = state.relapses.map(function (r) { return { type: 'relapse', ts: r.ts, r: r }; })
      .concat(state.urges.map(function (u) { return { type: 'urge', ts: u.ts, r: u }; }))
      .sort(function (a, b) { return b.ts - a.ts; });
    $('historyCount').textContent = '共 ' + items.length + ' 条';
    if (!items.length) { $('historyList').innerHTML = '<div class="empty-state">还没有记录。每一次坚持和复盘都会出现在这里。</div>'; return; }
    $('historyList').innerHTML = items.slice(0, 60).map(function (it) {
      var r = it.r;
      if (it.type === 'urge') {
        return '<div class="h-item urge"><div class="h-ico">' + ic('shield-check') + '</div><div class="h-main"><b>成功抵御一次冲动</b><div class="small muted">' + fmtDT(r.ts) + '</div></div>' +
          '<button class="h-del" data-del="urge" data-id="' + esc(r.id) + '" aria-label="删除">' + ic('x') + '</button></div>';
      }
      var tags = r.triggers.map(function (t) { return '<span>' + esc(t === '其他' && r.other ? '其他：' + r.other : t) + '</span>'; }).join('');
      return '<div class="h-item relapse"><div class="h-ico">' + ic('cloud-rain') + '</div><div class="h-main"><b>破戒记录</b>' +
        (r.streakMs ? '<span class="small muted"> · 本次坚持 ' + fmtDays(r.streakMs) + ' 天</span>' : '') +
        '<div class="small muted">' + fmtDT(r.ts) + '</div>' +
        (tags ? '<div class="h-tags">' + tags + '</div>' : '') +
        (r.note ? '<div class="small" style="margin-top:4px">' + esc(r.note) + '</div>' : '') +
        '</div><button class="h-del" data-del="relapse" data-id="' + esc(r.id) + '" aria-label="删除">' + ic('x') + '</button></div>';
    }).join('');
  }
  $('historyList').addEventListener('click', function (e) {
    var b = e.target.closest('.h-del'); if (!b) return;
    var type = b.dataset.del, id = b.dataset.id;
    openModal({
      title: '删除这条记录？',
      html: '<p>删除后无法恢复。' + (type === 'relapse' ? '（不会改变当前连续天数）' : '') + '</p>',
      ok: '删除', danger: true,
      onOk: function () {
        var arr = type === 'relapse' ? state.relapses : state.urges;
        var i = arr.findIndex(function (x) { return x.id === id; });
        if (i >= 0) arr.splice(i, 1);
        state.removed.ids[id] = Date.now();
        save(); renderHistory(); toast('已删除');
      }
    });
  });

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
    $('triggerChart').innerHTML = trows.length ? hbars(trows) : '<div class="empty-state">暂无数据。记录破戒时选择触发因素，这里会帮你找到规律。</div>';

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
      [[rb[i], '#ee8a7d', cx - bw - 2], [ub[i], '#4fbf9f', cx + 2]].forEach(function (bar) {
        var h = bar[0] / max * chartH, y = top + chartH - h;
        svg += '<rect x="' + bar[2] + '" y="' + (bar[0] ? y : top + chartH - 2) + '" width="' + bw + '" height="' + (bar[0] ? h : 2) + '" rx="4" fill="' + bar[1] + '" opacity="' + (bar[0] ? 1 : .25) + '"/>';
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
    $('moodChart').innerHTML = Object.keys(mc).length ? hbars(mrows, 'mint', true) : '<div class="empty-state">每天打卡并选择心情后，这里会显示你的心情分布。</div>';

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
  var THEME_COLOR = { light: '#f0f2f7', dark: '#0c111d' };
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
  }
  function setTheme(t, animate) {
    if (t !== 'light' && t !== 'dark') t = 'system';
    try { if (t === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch (e) {}
    applyTheme(t, animate);
  }
  function renderThemeControl() {
    var t = getTheme();
    document.querySelectorAll('#themeSeg .seg-btn, #themeSegSide .seg-btn').forEach(function (b) {
      var on = b.dataset.themeOpt === t;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    var isDark = t === 'dark' || (t === 'system' && sysDark && sysDark.matches);
    $('themeHint').textContent = t === 'system' ? ('当前系统：' + (isDark ? '深色' : '浅色')) : '';
  }
  ['themeSeg', 'themeSegSide'].forEach(function (id) {
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

  /* ---------------- 设置 ---------------- */
  function renderSettings() {
    $('reasonsEdit').innerHTML = state.reasons.length
      ? state.reasons.map(function (r, i) { return '<li><span>' + esc(r) + '</span><button data-i="' + i + '" aria-label="删除">' + ic('x') + '</button></li>'; }).join('')
      : '<li class="muted"><span>还没有理由，写下第一条吧。</span></li>';
  }
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
        state = defaultState(); save({ replaceAll: true }); selTriggers = {}; selMood = null; calOffset = 0;
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
  var APP_VERSION = '12';
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
    replaceState: function (s) { state = sanitize(s); save({ fromCloud: true }); if (current !== 'sos') render(current); },
    toast: toast, openModal: openModal, closeModal: closeModal, lockScroll: lockScroll, unlockScroll: unlockScroll,
    esc: esc, ic: ic, fmtDT: fmtDT, current: function () { return current; }
  };
})();
