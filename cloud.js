/* ZenFlow · 账号（Supabase Auth，邀请制注册）+ 云同步
 * - 未配置 Supabase（config.js 留空）时：只渲染"本机模式"说明，不加载任何云端代码，行为与以前完全一致。
 * - 已配置时：按需加载 vendor/supabase.js，提供登录 / 邀请码注册 / 找回密码 / 退出、个人资料、
 *   管理员生成邀请码，以及登录后的自动同步（拉取 → 合并 → 上传，最后写入者不会覆盖另一台设备的新增记录）。
 */
(function () {
  
  'use strict';
  /* icons: ic('cloud-check') ic('cloud-off') ic('circle-alert') ic('refresh-cw') ic('loader-circle') ic('copy') ic('log-out') ic('plug') ic('circle-check') ic('ticket') ic('user-plus') ic('log-in') ic('pen-line') ic('shield') ic('layout-dashboard') */
  var Z = window.ZenFlowCore;
  if (!Z) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = Z.esc, ic = Z.ic;
  var OVERRIDE_KEY = 'zenflow_supabase_override';   // 本机连接设置（可选，优先于 config.js）
  var LAST_UID_KEY = 'zenflow_cloud_uid';            // 本机数据最近一次同步到的账号
  var LAST_SYNC_KEY = 'zenflow_cloud_last_sync';

  /* ---------------- 配置 ---------------- */
  function readConfig() {
    var c = window.ZENFLOW_CONFIG || {}, src = 'config';
    var url = (c.supabaseUrl || '').trim(), key = (c.supabaseAnonKey || '').trim();
    try {
      var o = JSON.parse(localStorage.getItem(OVERRIDE_KEY) || 'null');
      if (o && o.url && o.key) { url = o.url; key = o.key; src = 'local'; }
    } catch (e) {}
    return { url: url.replace(/\/+$/, ''), key: key, source: src };
  }
  // 只接受可公开的 anon / publishable key，拒绝 service_role / secret key
  function keyProblem(key) {
    if (!key) return '缺少 anon key';
    if (/^sb_secret_/i.test(key)) return '这是 secret key（不能放在网页里），请改用 anon / publishable key';
    if (/^eyJ/.test(key)) {
      try {
        var p = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (p.role === 'service_role') return '这是 service_role key（可以绕过所有安全策略），绝对不能放在网页里，请改用 anon key';
        if (p.role && p.role !== 'anon') return 'key 的角色是 ' + p.role + '，应为 anon';
      } catch (e) { return 'anon key 格式不正确'; }
      return '';
    }
    if (/^sb_publishable_/i.test(key)) return '';
    return 'anon key 格式不正确（应以 eyJ 或 sb_publishable_ 开头）';
  }
  function urlProblem(url) {
    if (!url) return '缺少 Project URL';
    if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) return 'Project URL 格式不正确，例如 https://xxxx.supabase.co';
    return '';
  }
  var cfg = readConfig();
  var cfgError = cfg.url || cfg.key ? (urlProblem(cfg.url) || keyProblem(cfg.key)) : '';
  var configured = !!(cfg.url && cfg.key && !cfgError);

  /* ---------------- 状态 ---------------- */
  var sb = null, session = null, profile = null, invites = null;
  var gateMode = 'none'; // none | boot | login | invite
  var authReady = false; // getSession 已确认
  var profileReady = false; // 有 session 时 profile/invite_ok 已解析
  var sync = { status: 'off', at: +localStorage.getItem(LAST_SYNC_KEY) || 0, error: '' };
  var syncing = false, pending = false, pushTimer = null, replaceAllPending = false;
  var loadError = '';
  function appUrl() { return location.origin + location.pathname; }
  function user() { return session && session.user; }
  function inviteOk() { return !!(profile && profile.invite_ok); }
  function needsInvite() { return !!(user() && profile && profile.invite_ok === false); }
  function isGated() { return configured && (!user() || needsInvite()); }

  /* ---------------- 合并（纯函数，导出供测试） ---------------- */
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return JSON.stringify(v);
  }
  function mergeTomb(a, b) {
    var out = {};
    [a || {}, b || {}].forEach(function (m) { Object.keys(m).forEach(function (k) { if (!(k in out) || Math.abs(m[k]) > Math.abs(out[k])) out[k] = m[k]; }); });
    return out;
  }
  function ckScore(c) { return Math.max(+c.ts || 0, +c.editedAt || 0); }
  function merge(a, b) {
    a = Z.sanitize(a); b = Z.sanitize(b);
    var removed = {
      ids: mergeTomb(a.removed.ids, b.removed.ids),
      reasons: mergeTomb(a.removed.reasons, b.removed.reasons),
      checkins: mergeTomb(a.removed.checkins, b.removed.checkins)
    };
    var checkins = {};
    [a.checkins, b.checkins].forEach(function (m) {
      Object.keys(m).forEach(function (k) {
        if ((removed.checkins[k] || 0) > 0 && removed.checkins[k] >= ckScore(m[k])) return;
        if (!checkins[k] || ckScore(m[k]) > ckScore(checkins[k])) checkins[k] = m[k];
      });
    });
    Object.keys(checkins).forEach(function (k) {
      if ((removed.checkins[k] || 0) > 0 && removed.checkins[k] >= ckScore(checkins[k])) delete checkins[k];
    });
    function byId(x, y) {
      var map = {}, order = [];
      x.concat(y).forEach(function (r) {
        if (!(r.id in map)) { order.push(r.id); map[r.id] = r; return; }
        var prev = map[r.id];
        if ((+r.editedAt || 0) > (+prev.editedAt || 0)) map[r.id] = r;
      });
      return order.filter(function (id) { return !(removed.ids[id] > 0); }).map(function (id) { return map[id]; }).sort(function (p, q) { return p.ts - q.ts; });
    }
    var reasons = [];
    a.reasons.concat(b.reasons).forEach(function (r) { if (reasons.indexOf(r) < 0 && !(removed.reasons[r] > 0)) reasons.push(r); });
    var takeA = a.streakStartSetAt > b.streakStartSetAt || (a.streakStartSetAt === b.streakStartSetAt && a.streakStart >= b.streakStart);
    var goalA = (a.goalSetAt || 0) >= (b.goalSetAt || 0);
    var nameA = (a.displayNameSetAt || 0) >= (b.displayNameSetAt || 0);
    var avatarA = (a.avatarSetAt || 0) >= (b.avatarSetAt || 0);
    var resetA = (a.resetTypesSetAt || 0) >= (b.resetTypesSetAt || 0);
    var manualA = (a.manualStreakStartSetAt || 0) >= (b.manualStreakStartSetAt || 0);
    var merged = {
      version: 1,
      createdAt: Math.min(a.createdAt, b.createdAt),
      streakStart: takeA ? a.streakStart : b.streakStart,
      streakStartSetAt: Math.max(a.streakStartSetAt, b.streakStartSetAt),
      bestStreakMs: Math.max(a.bestStreakMs, b.bestStreakMs),
      goalDays: goalA ? a.goalDays : b.goalDays,
      goalSetAt: Math.max(a.goalSetAt || 0, b.goalSetAt || 0),
      displayName: nameA ? a.displayName : b.displayName,
      displayNameSetAt: Math.max(a.displayNameSetAt || 0, b.displayNameSetAt || 0),
      avatarDataUrl: avatarA ? (a.avatarDataUrl || '') : (b.avatarDataUrl || ''),
      avatarSetAt: Math.max(a.avatarSetAt || 0, b.avatarSetAt || 0),
      resetTypes: resetA ? a.resetTypes : b.resetTypes,
      resetTypesSetAt: Math.max(a.resetTypesSetAt || 0, b.resetTypesSetAt || 0),
      manualStreakStart: manualA ? (a.manualStreakStart || 0) : (b.manualStreakStart || 0),
      manualStreakStartSetAt: Math.max(a.manualStreakStartSetAt || 0, b.manualStreakStartSetAt || 0),
      checkins: checkins,
      relapses: byId(a.relapses, b.relapses),
      urges: byId(a.urges, b.urges),
      reasons: reasons,
      removed: removed
    };
    if (window.ZFStreak) {
      var computed = window.ZFStreak.computeStreakStart(merged);
      if (computed !== merged.streakStart) {
        merged.streakStart = computed;
        merged.streakStartSetAt = Math.max(merged.streakStartSetAt || 0, Date.now());
      }
      merged.bestStreakMs = window.ZFStreak.historicalBest(merged);
    }
    return merged;
  }

  /* ---------------- 加载 Supabase ---------------- */
  function loadLib() {
    return new Promise(function (res, rej) {
      if (window.supabase && window.supabase.createClient) return res();
      var s = document.createElement('script');
      s.src = 'vendor/supabase.js?v=20'; s.async = true;
      s.onload = function () { window.supabase && window.supabase.createClient ? res() : rej(new Error('Supabase 库加载异常')); };
      s.onerror = function () { rej(new Error('无法加载 Supabase 库（离线？）')); };
      document.head.appendChild(s);
    });
  }

  /* ---------------- 错误信息（中文） ---------------- */
  function errText(err) {
    if (!err) return '';
    if (typeof err === 'string') return err;
    return [err.message, err.details, err.hint, err.error_description, err.msg, err.code].filter(Boolean).join(' ');
  }
  function cn(err) {
    var m = errText(err);
    var code = err && (err.code || err.error_code) || '';
    if (/HANDLE_TAKEN/.test(m)) return '这个 @ID 已经被占用了，换一个吧';
    if (/HANDLE_INVALID/.test(m)) return '@ID 需要 3–20 位小写字母、数字或下划线';
    if (/Database error saving new user|INVITE_INVALID/i.test(m)) return '邀请码无效、已过期或已被使用';
    if (/Invalid login credentials/i.test(m) || code === 'invalid_credentials') return '邮箱或密码不正确';
    if (/Email not confirmed/i.test(m)) return '邮箱尚未确认，请先点击确认邮件中的链接';
    if (/already registered|already been registered|user_already_exists/i.test(m + code)) return '这个邮箱已经注册过了，请直接登录';
    if (/Password should be|weak_password|password.*(short|characters)/i.test(m + code)) return '密码太弱：至少 8 位，建议包含字母和数字';
    if (/rate limit|too many|over_email_send_rate_limit|429/i.test(m + code)) return '操作太频繁，请稍后再试';
    if (/invalid.*email|email.*invalid|validation_failed/i.test(m + code)) return '邮箱格式不正确';
    if (/signups? not allowed|signup_disabled/i.test(m + code)) return '服务器已关闭注册';
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return '网络连接失败，请检查网络后重试';
    if (/NOT_ADMIN/.test(m)) return '只有管理员可以执行此操作';
    if (/NOT_AUTHENTICATED/.test(m)) return '请先登录';
    if (/payload too large|exceeded the maximum|file size|entity too large/i.test(m)) return '图片超过 2MB，请换一张小一点的';
    if (/mime type|invalid_mime|content type.*not allowed/i.test(m)) return '只支持 PNG、JPG、WebP 或 GIF';
    if (/INVITE_INVALID/.test(m)) return '邀请码无效、已过期或已被使用';
    if (/provider is not enabled/i.test(m)) return 'Google 登录尚未启用，请在 Supabase Authentication → Providers 中配置';
    if (/CANNOT_DEMOTE_SELF/.test(m)) return '不能取消自己的管理员身份';
    if (/CANNOT_BAN_SELF/.test(m)) return '不能禁用自己的账号';
    if (/REVOKE_FAILED/.test(m)) return '邀请码不存在或已被使用，无法作废';
    if (/JWT|session|refresh_token/i.test(m)) return '登录已过期，请重新登录';
    return m || '出现未知错误';
  }

  /* ---------------- 同步 ---------------- */
  function setSync(status, error) {
    sync.status = status; sync.error = error || '';
    if (status === 'ok') { sync.at = Date.now(); try { localStorage.setItem(LAST_SYNC_KEY, String(sync.at)); } catch (e) {} }
    renderChrome(); renderAccount(true);
  }
  async function syncNow(opts) {
    opts = opts || {};
    if (!sb || !user() || needsInvite()) return;
    if (syncing) { pending = true; if (opts.replaceAll) replaceAllPending = true; return; }
    syncing = true; setSync('syncing');
    var replaceAll = opts.replaceAll || replaceAllPending; replaceAllPending = false;
    try {
      var uid = user().id;
      var r = await sb.from('user_data').select('data,updated_at').eq('user_id', uid).maybeSingle();
      if (r.error) throw r.error;
      var remote = r.data && r.data.data ? Z.sanitize(r.data.data) : null;
      var local = Z.sanitize(Z.getState());
      var lastUid = localStorage.getItem(LAST_UID_KEY);
      var merged;
      if (lastUid && lastUid !== uid && !replaceAll) {
        // 这台设备上的数据属于另一个账号：不混入当前账号，改用当前账号的云端数据
        merged = remote || Z.defaultState();
        Z.toast('已切换账号，载入该账号的云端数据');
      } else if (!remote || replaceAll) merged = local;
      else merged = merge(local, remote);
      if (stable(merged) !== stable(local)) Z.replaceState(merged);
      if (!remote || stable(Z.sanitize(merged)) !== stable(remote)) {
        var w = await sb.from('user_data').upsert({ user_id: uid, data: Z.sanitize(merged) }, { onConflict: 'user_id' });
        if (w.error) throw w.error;
      }
      localStorage.setItem(LAST_UID_KEY, uid);
      setSync('ok');
    } catch (e) {
      console.warn('同步失败', e);
      setSync(navigator.onLine === false ? 'offline' : 'error', cn(e));
    } finally {
      syncing = false;
      if (pending) { pending = false; schedulePush(400); }
    }
  }
  function schedulePush(ms) {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { syncNow(); }, ms == null ? 1500 : ms);
  }

  /* ---------------- 顶部/侧边栏状态 ---------------- */
  function syncLabel() {
    if (!configured || !user()) return { icon: 'cloud-off', text: '本机模式', cls: '' };
    if (sync.status === 'syncing') return { icon: 'refresh-cw', text: '同步中', cls: 'busy' };
    if (sync.status === 'error') return { icon: 'circle-alert', text: '同步失败', cls: 'err' };
    if (sync.status === 'offline') return { icon: 'cloud-off', text: '离线', cls: 'err' };
    return { icon: 'cloud-check', text: '已同步', cls: 'ok' };
  }
  function localDisplayName() {
    try { return ((Z.getState().displayName) || '').trim(); } catch (e) { return ''; }
  }
  function localAvatarUrl() {
    try { return Z.getState().avatarDataUrl || ''; } catch (e) { return ''; }
  }
  function googleAvatar() {
    var meta = (user() && user().user_metadata) || {};
    return meta.avatar_url || meta.picture || '';
  }
  function shownName() {
    var u = user();
    var meta = (u && u.user_metadata) || {};
    var cloudName = (profile && profile.display_name) || '';
    var emailName = u && u.email ? u.email.split('@')[0] : '';
    if (u) return (cloudName || meta.full_name || meta.name || localDisplayName() || emailName || '').trim();
    return localDisplayName();
  }
  function shownHandle() {
    return (profile && profile.handle) ? ('@' + profile.handle) : '';
  }
  function shownAvatar() {
    if (user() && profile && profile.avatar_url) return profile.avatar_url;
    if (user()) {
      var g = googleAvatar();
      if (g) return g;
    }
    if (!user()) return localAvatarUrl();
    return '';
  }
  function paintAvatar(el, letterEl, url, letter) {
    if (!el) return;
    if (letterEl) letterEl.textContent = (letter || '?').slice(0, 1).toUpperCase();
    var img = el.querySelector('img');
    if (url) {
      if (!img) {
        img = document.createElement('img');
        img.alt = '';
        img.className = 'avatar-img';
        el.insertBefore(img, letterEl || el.firstChild);
      }
      if (img.getAttribute('src') !== url) img.src = url;
      img.onerror = function () { el.classList.remove('has-photo'); img.remove(); };
      el.classList.add('has-photo');
    } else {
      if (img) img.remove();
      el.classList.remove('has-photo');
    }
  }
  function avatarHtml(url, letter, extra) {
    var cls = 'avatar' + (extra ? ' ' + extra : '') + (url ? ' has-photo' : '');
    var img = url ? '<img class="avatar-img" alt="" src="' + esc(url) + '" />' : '';
    return '<span class="' + cls + '">' + img + '<span>' + esc((letter || '?').slice(0, 1).toUpperCase()) + '</span></span>';
  }
  function renderSideUser() {
    var nameEl = $('sideName'), subEl = $('sideUserSub'), letterEl = $('sideAvatarLetter'), avatarEl = $('sideAvatar');
    if (!nameEl || !avatarEl) return;
    var u = user();
    var name = shownName();
    var handle = shownHandle();
    nameEl.textContent = name || (u ? '已登录' : '未登录');
    if (handle) subEl.textContent = handle;
    else if (!u) subEl.textContent = configured ? '前往设置' : '本机模式';
    else subEl.textContent = syncLabel().text;
    paintAvatar(avatarEl, letterEl, shownAvatar(), name || (u && u.email) || '?');
    var meName = $('settingsMeName'), meSub = $('settingsMeSub');
    if (meName) meName.textContent = name || (u ? '已登录' : '未登录');
    if (meSub) meSub.textContent = handle || (!u ? (configured ? '前往设置' : '本机模式') : (u.email || syncLabel().text));
    paintAvatar($('settingsMeAvatar'), $('settingsMeLetter'), shownAvatar(), name || '?');
    fillProfileForm();
  }
  function renderChrome() {
    var L = syncLabel();
    var pill = $('syncPill');
    if (pill) { pill.className = 'sync-pill ' + L.cls; pill.innerHTML = ic(L.icon) + esc(L.text); }
    var logged = configured && user();
    var pp = document.querySelector('#screen-home .privacy-pill');
    if (pp) { pp.innerHTML = ic(logged ? 'cloud-check' : 'lock') + (logged ? '云同步' : '仅本机'); pp.title = logged ? '已登录，数据会同步到你的账号' : '所有数据只保存在本机浏览器中'; pp.classList.toggle('synced', !!logged); }
    renderSideUser();
    if (window.ZenFlowCore && window.ZenFlowCore.updateSettingsChrome) window.ZenFlowCore.updateSettingsChrome();
  }

  /* ---------------- 设置 → 账号与同步 ---------------- */
  function fmtTime(t) {
    if (!t) return '尚未同步';
    var d = new Date(t), now = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var hm = p(d.getHours()) + ':' + p(d.getMinutes());
    return d.toDateString() === now.toDateString() ? '今天 ' + hm : (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }
  function renderAccount(statusOnly) {
    var body = $('accountBody'); if (!body) return;
    if (statusOnly && user()) { var st = $('acctSync'); if (st) { st.innerHTML = syncLine(); return; } }
    if (!configured) {
      body.innerHTML =
        '<p class="small">当前为<b>本机模式</b>：所有功能都可以正常使用，数据只保存在这台设备上。</p>' +
        '<p class="muted small">' + (cfgError ? '<span class="danger-text">连接配置有误：' + esc(cfgError) + '</span>' : '登录与云同步尚未启用：需要先在 <code>config.js</code> 中填写 Supabase 项目地址和 anon key（见仓库 supabase/README.md）。') + '</p>' +
        '<div class="acct-actions"><button class="btn btn-ghost" id="btnCloudSetup">' + ic('plug') + '填写连接信息</button></div>';
      return;
    }
    if (loadError) {
      body.innerHTML = '<p class="small danger-text">' + esc(loadError) + '</p><div class="acct-actions"><button class="btn btn-ghost" id="btnCloudRetry">' + ic('refresh-cw') + '重试</button></div>';
      return;
    }
    if (!sb) { body.innerHTML = '<p class="muted small">正在连接…</p>'; return; }
    var u = user();
    if (!u) {
      body.innerHTML =
        '<p class="small">登录后即可使用 ZenFlow，打卡 / 记录 / 理由会自动同步。当前站点已启用云端，<b>需要登录</b>（邮箱或 Google；新用户需邀请码）。</p>' +
        '<div class="acct-actions"><button class="btn btn-primary" id="btnOpenLogin">' + ic('log-in') + '登录</button>' +
        '<button class="btn btn-ghost" id="btnOpenRegister">' + ic('ticket') + '邀请码注册</button></div>' +
        (cfg.source === 'local' ? '<p class="muted small acct-src">使用本机连接设置 · <button class="btn-link" id="btnCloudSetup">修改</button></p>' : '');
      return;
    }
    var name = shownName() || (u.email || '').split('@')[0];
    var handle = shownHandle();
    var h = '<div class="acct-head">' + avatarHtml(shownAvatar(), name, 'story-avatar acct-avatar') + '<div class="acct-id"><b id="acctName">' + esc(name) + '</b>' +
      (handle ? '<span class="acct-handle">' + esc(handle) + '</span>' : '') +
      (profile && profile.is_admin ? '<span class="admin-tag">管理员</span>' : '') + '<span class="muted small" id="acctEmail">' + esc(u.email || '') + '</span></div></div>' +
      '<div class="acct-sync" id="acctSync">' + syncLine() + '</div>' +
      '<div class="acct-actions"><button class="btn btn-ghost" id="btnSyncNow">' + ic('refresh-cw') + '立即同步</button></div>' +
      '<p class="muted small">退出登录在设置列表最下方。管理员入口也在设置列表里。</p>';
    body.innerHTML = h;
  }
  function syncLine() {
    var s = sync.status;
    var t = s === 'syncing' ? '正在同步…' : s === 'error' ? '同步失败：' + esc(sync.error) + '（会自动重试）' : s === 'offline' ? '当前离线，联网后自动同步' : '上次同步：' + fmtTime(sync.at);
    return ic(s === 'error' || s === 'offline' ? 'cloud-off' : s === 'syncing' ? 'refresh-cw' : 'cloud-check') + '<span>' + t + '</span>';
  }
  function inviteListHtml() {
    if (!invites) return '<p class="muted small">加载中…</p>';
    if (!invites.length) return '<p class="muted small">还没有你生成的邀请码。</p>';
    var now = Date.now();
    return '<ul class="invite-list">' + invites.map(function (v) {
      var used = !!v.used_at, expired = !used && v.expires_at && Date.parse(v.expires_at) < now;
      var st = used ? '<span class="inv-st used">已使用</span>' : expired ? '<span class="inv-st exp">已过期</span>' : '<span class="inv-st ok">可用</span>';
      return '<li><code>' + esc(v.code) + '</code>' + st + (!used && !expired ? '<button class="icon-btn" data-copy="' + esc(v.code) + '" aria-label="复制 ' + esc(v.code) + '" title="复制">' + ic('copy') + '</button>' : '<span class="inv-sp"></span>') + '</li>';
    }).join('') + '</ul>';
  }
  async function loadProfile() {
    profile = null; invites = null; profileReady = false;
    if (!user()) { profileReady = true; updateGate(); return; }
    var r = await sb.from('profiles').select('display_name,handle,avatar_url,is_admin,created_at,invite_ok').eq('id', user().id).maybeSingle();
    if (!r.error) profile = r.data;
    if (!profile) profile = { display_name: null, handle: null, avatar_url: null, is_admin: false, invite_ok: false };
    profileReady = true;
    renderAccount();
    renderChrome();
    updateGate();
    if (inviteOk() && profile.is_admin) loadInvites();
    if (inviteOk() && window.ZFAdmin && window.ZFAdmin.onProfile) window.ZFAdmin.onProfile();
  }
  async function loadInvites() {
    var r = await sb.from('invites').select('code,used_at,expires_at,note,created_at').order('created_at', { ascending: false }).limit(30);
    invites = r.error ? [] : r.data;
    var el = $('inviteList'); if (el) el.innerHTML = inviteListHtml();
  }

  /* ---------------- 登录 / 注册面板 / 门禁 ---------------- */
  var authMode = 'login';
  function openAuth(mode) {
    if (!configured) { openSetup(); return; }
    setAuthMode(mode || 'login');
    $('loginMsg').textContent = ''; $('regMsg').textContent = '';
    $('authMask').classList.remove('hidden');
    if (!isGated()) Z.lockScroll();
    setTimeout(function () {
      var focusEl = (authMode === 'register' ? $('regName') : $('loginEmail'));
      if (focusEl) focusEl.focus();
    }, 60);
  }
  function closeAuth() {
    if (isGated()) return;
    if ($('authMask').classList.contains('hidden')) return;
    $('authMask').classList.add('hidden');
    Z.unlockScroll();
  }
  function setAuthMode(m) {
    authMode = m === 'register' ? 'register' : 'login';
    document.querySelectorAll('#authSeg .seg-btn').forEach(function (b) {
      var on = b.dataset.auth === authMode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $('formLogin').classList.toggle('hidden', authMode !== 'login');
    $('formRegister').classList.toggle('hidden', authMode !== 'register');
    $('authTitle').textContent = authMode === 'login' ? '登录 ZenFlow' : '用邀请码注册';
    $('authSub').textContent = authMode === 'login'
      ? '登录后即可使用全部功能，数据会安全同步到你的账号。'
      : '注册需要全站唯一的 @ID 和有效邀请码。昵称可以重复。';
  }
  function peekPersistedSession() {
    try {
      var raw = localStorage.getItem('zenflow_auth');
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o) return null;
      // supabase-js v2：整段 session，或 { currentSession }
      var s = o.access_token ? o : (o.currentSession || o.session || null);
      if (s && s.access_token && s.user) return s;
      return null;
    } catch (e) { return null; }
  }
  function setBootText(t) {
    var el = $('authBootText');
    if (el) el.textContent = t || '正在恢复登录…';
  }
  var bootFinished = false; // 已经进入主界面后，切回标签页不得再盖启动闪屏
  function showBootSplash(text) {
    if (bootFinished) return;
    gateMode = 'boot';
    document.body.classList.add('auth-booting');
    document.body.classList.remove('auth-gated');
    document.body.classList.remove('auth-ready');
    setBootText(text || (peekPersistedSession() ? '正在恢复登录…' : '正在加载…'));
    if ($('authMask') && !$('authMask').classList.contains('hidden')) {
      // 启动闪屏期间不要露出登录表单
      $('authMask').classList.add('hidden');
    }
  }
  function showInviteGate() {
    gateMode = 'invite';
    document.body.classList.remove('auth-booting');
    document.body.classList.add('auth-gated');
    document.body.classList.add('auth-ready');
    $('authMask').classList.remove('hidden');
    $('authSeg').classList.add('hidden');
    if ($('authMainPane')) $('authMainPane').classList.add('hidden');
    $('formInviteGate').classList.remove('hidden');
    if ($('gateInviteField')) $('gateInviteField').classList.remove('hidden');
    if ($('gateHandleField')) $('gateHandleField').classList.remove('hidden');
    $('authTitle').textContent = '输入邀请码完成注册';
    var email = (user() && user().email) || '';
    $('authSub').textContent = email ? ('已登录为 ' + email) : '还差一步即可进入 ZenFlow';
    $('inviteGateHint').textContent = 'Google / 第三方登录成功。请填写邀请码，并设置一个全站唯一的 @ID。';
    var btn = $('btnCompleteInvite');
    if (btn) btn.innerHTML = ic('ticket') + '完成注册';
    prefillGateProfile();
    $('gateMsg').textContent = '';
    setTimeout(function () { var el = $('gateInvite'); if (el) el.focus(); }, 60);
  }
  function showHandleOnlyGate() {
    gateMode = 'handle';
    document.body.classList.remove('auth-booting');
    document.body.classList.add('auth-gated');
    document.body.classList.add('auth-ready');
    $('authMask').classList.remove('hidden');
    $('authSeg').classList.add('hidden');
    if ($('authMainPane')) $('authMainPane').classList.add('hidden');
    $('formInviteGate').classList.remove('hidden');
    if ($('gateInviteField')) $('gateInviteField').classList.add('hidden');
    if ($('gateHandleField')) $('gateHandleField').classList.remove('hidden');
    $('authTitle').textContent = '设置你的 @ID';
    var email = (user() && user().email) || '';
    $('authSub').textContent = email ? ('已登录为 ' + email) : '还差一步即可进入 ZenFlow';
    $('inviteGateHint').textContent = '这个账号还没有 @ID。请设置一个全站唯一的 ID，昵称可以之后再改。';
    var btn = $('btnCompleteInvite');
    if (btn) btn.innerHTML = ic('circle-check') + '保存并进入';
    prefillGateProfile();
    $('gateMsg').textContent = '';
    setTimeout(function () { var el = $('gateHandle'); if (el) el.focus(); }, 60);
  }
  function prefillGateProfile() {
    var nameEl = $('gateName');
    var handleEl = $('gateHandle');
    if (nameEl && document.activeElement !== nameEl && !nameEl.value) nameEl.value = (profile && profile.display_name) || '';
    if (handleEl && document.activeElement !== handleEl && profile && profile.handle && !handleEl.value) handleEl.value = profile.handle;
  }
  function showLoginGate() {
    gateMode = 'login';
    document.body.classList.remove('auth-booting');
    document.body.classList.add('auth-gated');
    document.body.classList.add('auth-ready');
    $('authMask').classList.remove('hidden');
    $('authSeg').classList.remove('hidden');
    if ($('authMainPane')) $('authMainPane').classList.remove('hidden');
    $('formInviteGate').classList.add('hidden');
    setAuthMode(authMode === 'register' ? 'register' : 'login');
  }
  function clearGate() {
    gateMode = 'none';
    bootFinished = true;
    document.body.classList.remove('auth-booting');
    document.body.classList.remove('auth-gated');
    document.body.classList.add('auth-ready');
    $('formInviteGate').classList.add('hidden');
    $('authSeg').classList.remove('hidden');
    if ($('authMainPane')) $('authMainPane').classList.remove('hidden');
    if ($('authMask') && !$('authMask').classList.contains('hidden') && !isGated()) {
      $('authMask').classList.add('hidden');
      Z.unlockScroll();
    }
  }
  function updateGate() {
    if (!configured) {
      authReady = true; profileReady = true;
      clearGate();
      return;
    }
    // 会话尚未确认：只显示启动闪屏，绝不露出登录表单
    if (!authReady) {
      showBootSplash();
      return;
    }
    if (!user()) {
      profileReady = true;
      showLoginGate();
      return;
    }
    // 已登录但 invite_ok 未解析：继续闪屏，避免先闪登录再进主界面
    if (!profileReady || !profile) {
      showBootSplash('正在进入…');
      return;
    }
    if (profile.invite_ok && profile.handle) { clearGate(); return; }
    if (profile.invite_ok && !profile.handle) { showHandleOnlyGate(); return; }
    showInviteGate();
  }
  function msg(id, text, ok) { var el = $(id); el.textContent = text || ''; el.classList.toggle('ok', !!ok); }
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = ic('loader-circle', 'spin') + label; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var HANDLE_RE = /^[a-z0-9_]{3,20}$/;
  function normInvite(v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); }
  function normalizeHandleInput(raw) {
    return String(raw || '').replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
  }
  function handleProblem(h) {
    if (!h) return '请设置一个 @ID';
    if (h.length < 3) return '@ID 至少 3 位';
    if (!HANDLE_RE.test(h)) return '@ID 只能使用小写字母、数字或下划线';
    return '';
  }
  function bindHandleInput(input, stateEl) {
    if (!input || !stateEl) return { check: function () { return Promise.resolve(null); } };
    var timer = null, seq = 0;
    function paint(cls, html) {
      stateEl.className = 'invite-state' + (cls ? ' ' + cls : '');
      stateEl.innerHTML = html || '';
    }
    function applyValue() {
      var h = normalizeHandleInput(input.value);
      if (input.value !== h) input.value = h;
      return h;
    }
    async function check() {
      var h = applyValue();
      if (!h) { paint('', ''); return null; }
      var problem = handleProblem(h);
      if (problem) { paint('bad', ic('circle-alert') + (h.length < 3 ? '至少 3 位' : '格式不对')); return 'invalid'; }
      if (!sb) { paint('', ''); return null; }
      var my = ++seq;
      paint('', ic('loader-circle', 'spin'));
      var r = await sb.rpc('is_handle_available', { p_handle: h });
      if (my !== seq) return null;
      if (r.error) { paint('', ''); return null; }
      paint(r.data ? 'good' : 'bad', r.data ? (ic('circle-check') + '可用') : (ic('circle-alert') + '已被占用'));
      return !!r.data;
    }
    function schedule() {
      applyValue();
      paint('', '');
      clearTimeout(timer);
      timer = setTimeout(check, 350);
    }
    input.addEventListener('compositionstart', function () { input.dataset.composing = '1'; });
    input.addEventListener('compositionend', function () { delete input.dataset.composing; schedule(); });
    input.addEventListener('input', function () { if (input.dataset.composing) return; schedule(); });
    input.addEventListener('blur', function () { clearTimeout(timer); check(); });
    return { check: check, paint: paint };
  }

  var inviteCheckSeq = 0;
  async function checkInvite() {
    var code = normInvite($('regInvite').value), el = $('inviteState');
    el.className = 'invite-state'; el.innerHTML = '';
    if (!code || !sb) return null;
    if (!/^[A-Z0-9-]{6,32}$/.test(code)) { el.className = 'invite-state bad'; el.innerHTML = ic('circle-alert') + '格式不对'; return false; }
    var seq = ++inviteCheckSeq;
    el.className = 'invite-state'; el.innerHTML = ic('loader-circle', 'spin');
    var r = await sb.rpc('validate_invite', { p_code: code });
    if (seq !== inviteCheckSeq) return null;
    if (r.error) { el.innerHTML = ''; return null; }
    el.className = 'invite-state ' + (r.data ? 'good' : 'bad');
    el.innerHTML = r.data ? ic('circle-check') + '可用' : ic('circle-alert') + '无效或已使用';
    return !!r.data;
  }

  async function checkGateInvite() {
    var code = normInvite($('gateInvite').value), el = $('gateInviteState');
    el.className = 'invite-state'; el.innerHTML = '';
    if (!code || !sb) return null;
    if (!/^[A-Z0-9-]{6,32}$/.test(code)) { el.className = 'invite-state bad'; el.innerHTML = ic('circle-alert') + '格式不对'; return false; }
    el.innerHTML = ic('loader-circle', 'spin');
    var r = await sb.rpc('validate_invite', { p_code: code });
    if (r.error) { el.innerHTML = ''; return null; }
    el.className = 'invite-state ' + (r.data ? 'good' : 'bad');
    el.innerHTML = r.data ? ic('circle-check') + '可用' : ic('circle-alert') + '无效或已使用';
    return !!r.data;
  }

  async function doGoogle() {
    if (!sb) return;
    var btn = $('btnGoogle'); busy(btn, true, '正在跳转…'); msg('loginMsg', ''); msg('regMsg', '');
    try {
      var r = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: appUrl(), queryParams: { access_type: 'online', prompt: 'select_account' } }
      });
      if (r.error) throw r.error;
    } catch (err) {
      var msgText = cn(err);
      if (/provider is not enabled|Unsupported provider|validation_failed/i.test(String(err && err.message))) {
        msgText = 'Google 登录尚未在 Supabase 中启用。请到 Authentication → Providers → Google 填入 Client ID/Secret（见 supabase/README.md）。';
      }
      msg(authMode === 'register' ? 'regMsg' : 'loginMsg', msgText);
      busy(btn, false);
    }
  }

  async function doCompleteInvite(e) {
    e.preventDefault();
    var needInvite = gateMode !== 'handle';
    var code = needInvite ? normInvite($('gateInvite').value) : '';
    var name = $('gateName').value.trim();
    var handle = normalizeHandleInput($('gateHandle').value);
    var needHandle = !(profile && profile.handle) || handle !== (profile && profile.handle);
    if (needInvite && !code) return msg('gateMsg', '请输入邀请码');
    if (needHandle || !profile || !profile.handle) {
      var problem = handleProblem(handle);
      if (problem) return msg('gateMsg', problem);
    }
    var btn = $('btnCompleteInvite'); busy(btn, true, '验证中…'); msg('gateMsg', '');
    try {
      if (needInvite) {
        var valid = await checkGateInvite();
        if (valid === false) throw new Error('INVITE_INVALID');
      }
      if (needHandle || !profile || !profile.handle) {
        var avail = gateHandleCheck ? await gateHandleCheck.check() : null;
        if (avail === 'invalid') throw new Error('HANDLE_INVALID');
        if (avail === false) throw new Error('HANDLE_TAKEN');
      }
      var r = needInvite
        ? await sb.rpc('complete_invite_registration', { p_code: code, p_display_name: name || null, p_handle: handle || null })
        : await sb.rpc('update_my_profile', { p_display_name: name || null, p_handle: handle, p_avatar_url: null });
      if (r.error) throw r.error;
      profile = r.data || profile;
      Z.toast(needInvite ? '注册完成，欢迎加入' : '已设置 @ID');
      updateGate();
      renderAccount();
      renderChrome();
      if (profile && profile.invite_ok) syncNow();
      if (profile && profile.is_admin && window.ZFAdmin && window.ZFAdmin.onProfile) window.ZFAdmin.onProfile();
    } catch (err) { msg('gateMsg', cn(err)); }
    finally { busy(btn, false); }
  }

  async function doLogin(e) {
    e.preventDefault();
    var email = $('loginEmail').value.trim(), pw = $('loginPassword').value;
    if (!EMAIL_RE.test(email)) return msg('loginMsg', '请输入有效的邮箱');
    if (!pw) return msg('loginMsg', '请输入密码');
    var btn = $('btnLogin'); busy(btn, true, '登录中…'); msg('loginMsg', '');
    try {
      var r = await sb.auth.signInWithPassword({ email: email, password: pw });
      if (r.error) throw r.error;
      $('loginPassword').value = '';
      Z.toast('登录成功');
    } catch (err) { msg('loginMsg', cn(err)); }
    finally { busy(btn, false); }
  }
  async function doRegister(e) {
    e.preventDefault();
    var code = normInvite($('regInvite').value), name = $('regName').value.trim(), email = $('regEmail').value.trim();
    var handle = normalizeHandleInput($('regHandle').value);
    var pw = $('regPassword').value, pw2 = $('regPassword2').value;
    var problem = handleProblem(handle);
    if (problem) return msg('regMsg', problem);
    if (!EMAIL_RE.test(email)) return msg('regMsg', '请输入有效的邮箱');
    if (pw.length < 8) return msg('regMsg', '密码至少 8 位');
    if (pw !== pw2) return msg('regMsg', '两次输入的密码不一致');
    if (!code) return msg('regMsg', '请输入邀请码');
    var btn = $('btnRegister'); busy(btn, true, '注册中…'); msg('regMsg', '');
    try {
      var avail = regHandleCheck ? await regHandleCheck.check() : null;
      if (avail === 'invalid') throw new Error('HANDLE_INVALID');
      if (avail === false) throw new Error('HANDLE_TAKEN');
      var valid = await checkInvite();
      if (valid === false) throw new Error('INVITE_INVALID');
      var r = await sb.auth.signUp({ email: email, password: pw, options: { data: { invite_code: code, display_name: name || null, handle: handle }, emailRedirectTo: appUrl() } });
      if (r.error) throw r.error;
      $('regPassword').value = ''; $('regPassword2').value = '';
      if (r.data && r.data.session) { Z.toast('注册成功，欢迎加入'); }
      else if (r.data && r.data.user && r.data.user.identities && r.data.user.identities.length === 0) msg('regMsg', '这个邮箱已经注册过了，请直接登录');
      else msg('regMsg', '注册成功！确认邮件已发送到 ' + email + '，点击邮件中的链接后即可登录。', true);
    } catch (err) { msg('regMsg', cn(err)); }
    finally { busy(btn, false); }
  }
  async function doForgot() {
    var email = $('loginEmail').value.trim();
    if (!EMAIL_RE.test(email)) { msg('loginMsg', '请先在上方输入你的注册邮箱'); $('loginEmail').focus(); return; }
    var btn = $('btnForgot'); btn.disabled = true;
    try {
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: appUrl() });
      if (r.error) throw r.error;
      msg('loginMsg', '如果该邮箱已注册，重置密码的邮件已发送，请查收。', true);
    } catch (err) { msg('loginMsg', cn(err)); }
    finally { btn.disabled = false; }
  }
  function promptNewPassword() {
    Z.openModal({
      title: '设置新密码', ok: '保存',
      html: '<p>请输入新的登录密码（至少 8 位）。</p><input type="password" id="newPw" autocomplete="new-password" placeholder="新密码" />',
      onOk: function () {
        var pw = $('newPw').value;
        if (pw.length < 8) { Z.toast('密码至少 8 位'); return false; }
        sb.auth.updateUser({ password: pw }).then(function (r) { Z.toast(r.error ? cn(r.error) : '密码已更新'); });
      }
    });
  }

  /* ---------------- 连接设置（本机，可选） ---------------- */
  function openSetup() {
    var o = readConfig();
    Z.openModal({
      title: '连接 Supabase', ok: '保存并连接',
      html: '<p>填写你的 Supabase 项目信息（Project Settings → API）。只保存在这台设备上；要让所有设备都能登录，请把它们写进仓库里的 <code>config.js</code>。</p>' +
        '<input type="url" id="cfgUrl" placeholder="https://xxxx.supabase.co" value="' + esc(o.source === 'local' ? o.url : '') + '" />' +
        '<input type="text" id="cfgKey" placeholder="anon public key（eyJ… 或 sb_publishable_…）" value="' + esc(o.source === 'local' ? o.key : '') + '" />' +
        '<p class="muted small">⚠️ 不要填写 service_role 或 secret key。</p>' +
        (o.source === 'local' ? '<button class="btn-link" type="button" id="cfgClear">清除本机连接设置</button>' : ''),
      onOk: function () {
        var url = $('cfgUrl').value.trim().replace(/\/+$/, ''), key = $('cfgKey').value.trim();
        var p = urlProblem(url) || keyProblem(key);
        if (p) { Z.toast(p); return false; }
        localStorage.setItem(OVERRIDE_KEY, JSON.stringify({ url: url, key: key }));
        location.reload();
      }
    });
    var c = $('cfgClear');
    if (c) c.addEventListener('click', function () { localStorage.removeItem(OVERRIDE_KEY); location.reload(); });
  }

  /* ---------------- 资料：昵称 / @ID / 头像 ---------------- */
  function loggedProfile() { return !!(configured && user() && profile); }
  function fillProfileForm() {
    var nameInput = $('profileNameInput');
    var handleInput = $('profileHandleInput');
    var block = $('profileHandleBlock');
    var hint = $('profileModeHint');
    var removeBtn = $('btnAvatarRemove');
    var logged = loggedProfile();
    if (block) block.classList.toggle('hidden', !logged);
    if (hint) hint.textContent = logged
      ? '昵称、@ID 和头像保存在你的账号里。留空昵称再保存可以清除昵称。'
      : '当前是本机模式：昵称和头像只保存在这台设备，不需要 @ID。';
    if (nameInput && document.activeElement !== nameInput && nameInput.dataset.useredit !== '1') {
      var nextName = logged ? ((profile && profile.display_name) || '') : localDisplayName();
      if (nameInput.value !== nextName) nameInput.value = nextName;
    }
    if (handleInput && logged && document.activeElement !== handleInput && handleInput.dataset.useredit !== '1') {
      var nextHandle = (profile && profile.handle) || '';
      if (handleInput.value !== nextHandle) handleInput.value = nextHandle;
    }
    var letter = shownName() || '?';
    paintAvatar($('profileAvatar'), $('profileAvatarLetter'), shownAvatar(), letter);
    if (removeBtn) {
      var canRemove = logged ? !!(profile && profile.avatar_url) : !!localAvatarUrl();
      removeBtn.classList.toggle('hidden', !canRemove);
    }
  }
  function fileToSquareBlob(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error('没有选择图片'));
      if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error('请选择 PNG、JPG、WebP 或 GIF'));
      if (file.size > 12 * 1024 * 1024) return reject(new Error('原图太大，请换一张小一点的'));
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var s = 256;
        var canvas = document.createElement('canvas');
        canvas.width = s; canvas.height = s;
        var ctx = canvas.getContext('2d');
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var side = Math.min(w, h);
        ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, s, s);
        URL.revokeObjectURL(url);
        var finish = function (blob) { blob ? resolve(blob) : reject(new Error('无法处理这张图片')); };
        if (!canvas.toBlob) return reject(new Error('浏览器不支持图片处理'));
        canvas.toBlob(function (blob) {
          if (blob) return finish(blob);
          canvas.toBlob(finish, 'image/jpeg', 0.86);
        }, 'image/webp', 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('无法读取图片')); };
      img.src = url;
    });
  }
  function blobToDataUrl(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || '')); };
      reader.onerror = function () { reject(new Error('无法读取图片')); };
      reader.readAsDataURL(blob);
    });
  }
  function avatarStoragePath(url) {
    if (!url || !user()) return '';
    var marker = '/avatars/';
    var i = String(url).indexOf(marker);
    if (i < 0) return '';
    var path = String(url).slice(i + marker.length).split('?')[0];
    try { path = decodeURIComponent(path); } catch (e) {}
    if (path.indexOf(user().id + '/') !== 0) return '';
    return path;
  }
  function deleteStoredAvatar(url) {
    var path = avatarStoragePath(url);
    if (!path || !sb) return Promise.resolve();
    return sb.storage.from('avatars').remove([path]).then(function () {}, function () {});
  }
  async function applyAvatarFile(file) {
    var blob = await fileToSquareBlob(file);
    if (!loggedProfile()) {
      var dataUrl = await blobToDataUrl(blob);
      if (dataUrl.length > 180000) throw new Error('处理后的图片仍然太大，请换一张');
      if (Z.setLocalProfile && Z.setLocalProfile({ avatarDataUrl: dataUrl }) === false) throw new Error('无法保存头像');
      Z.toast('头像已更新');
      renderChrome();
      return;
    }
    var ext = blob.type === 'image/jpeg' ? 'jpg' : (blob.type === 'image/png' ? 'png' : 'webp');
    var path = user().id + '/avatar-' + Date.now() + '.' + ext;
    var up = await sb.storage.from('avatars').upload(path, blob, { contentType: blob.type || 'image/webp', cacheControl: '3600', upsert: false });
    if (up.error) throw up.error;
    var pub = sb.storage.from('avatars').getPublicUrl(path);
    var url = pub && pub.data && pub.data.publicUrl;
    if (!url) {
      await sb.storage.from('avatars').remove([path]);
      throw new Error('无法取得头像地址');
    }
    var prev = profile && profile.avatar_url;
    var r = await sb.rpc('update_my_profile', { p_display_name: null, p_handle: null, p_avatar_url: url });
    if (r.error) {
      await sb.storage.from('avatars').remove([path]);
      throw r.error;
    }
    profile = r.data || Object.assign({}, profile, { avatar_url: url });
    if (prev && prev !== url) deleteStoredAvatar(prev);
    Z.toast('头像已更新');
    renderAccount();
    renderChrome();
  }
  async function removeAvatar() {
    if (!loggedProfile()) {
      if (Z.setLocalProfile) Z.setLocalProfile({ avatarDataUrl: '' });
      Z.toast('已移除头像');
      renderChrome();
      return;
    }
    var prev = profile && profile.avatar_url;
    var r = await sb.rpc('update_my_profile', { p_display_name: null, p_handle: null, p_avatar_url: '' });
    if (r.error) return Z.toast(cn(r.error));
    profile = r.data || Object.assign({}, profile, { avatar_url: null });
    if (prev) deleteStoredAvatar(prev);
    Z.toast('已移除头像');
    renderAccount();
    renderChrome();
  }
  async function saveProfile() {
    var nameInput = $('profileNameInput');
    if (!nameInput) return;
    var name = nameInput.value.trim().slice(0, 20);
    if (!loggedProfile()) {
      if (nameInput) delete nameInput.dataset.useredit;
      if (Z.setLocalProfile) Z.setLocalProfile({ displayName: name });
      Z.toast(name ? '昵称已保存' : '已清除昵称');
      renderChrome();
      return;
    }
    var handleInput = $('profileHandleInput');
    var handle = normalizeHandleInput(handleInput ? handleInput.value : '');
    var current = (profile && profile.handle) || '';
    var handleChanged = handle !== current;
    if (handleChanged) {
      var problem = handleProblem(handle);
      if (problem) { Z.toast(problem); return; }
      var avail = profileHandleCheck ? await profileHandleCheck.check() : null;
      if (avail === 'invalid') { Z.toast(cn(new Error('HANDLE_INVALID'))); return; }
      if (avail === false) { Z.toast(cn(new Error('HANDLE_TAKEN'))); return; }
    }
    var btn = $('btnSaveProfile');
    if (btn) busy(btn, true, '保存中…');
    try {
      var r = await sb.rpc('update_my_profile', {
        p_display_name: name || null,
        p_handle: handleChanged ? handle : null,
        p_avatar_url: null
      });
      if (r.error) throw r.error;
      profile = r.data || profile;
      if (!name && profile && profile.display_name) {
        var cleared = await sb.from('profiles').update({ display_name: null }).eq('id', user().id).select('display_name,handle,avatar_url,is_admin,invite_ok').maybeSingle();
        if (cleared.error) throw cleared.error;
        if (cleared.data) profile = Object.assign({}, profile, cleared.data);
      }
      if (nameInput) delete nameInput.dataset.useredit;
      if (handleInput) delete handleInput.dataset.useredit;
      Z.toast('资料已更新');
      renderAccount();
      renderChrome();
    } catch (err) { Z.toast(cn(err)); }
    finally { if (btn) busy(btn, false); }
  }

  /* ---------------- 事件 ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t) return;
    switch (t.id) {
      case 'btnOpenAdmin': if (window.ZFAdmin) window.ZFAdmin.open(); break;
      case 'btnOpenLogin': openAuth('login'); break;
      case 'btnOpenRegister': openAuth('register'); break;
      case 'btnCloudSetup': openSetup(); break;
      case 'btnCloudRetry': location.reload(); break;
      case 'btnSyncNow': syncNow(); break;
      case 'btnLogout':
        Z.openModal({
          title: '退出登录？', ok: '退出登录', danger: true,
          html: '<p>退出后，这台设备上的数据<b>仍会保留</b>，可以继续离线使用；再次登录时会自动合并同步。</p>',
          onOk: function () { clearTimeout(pushTimer); sb.auth.signOut().then(function (r) { if (r.error) Z.toast(cn(r.error)); }); }
        });
        break;
      case 'btnNewInvites':
        t.disabled = true;
        sb.rpc('create_invites', { p_count: 3, p_days: 30, p_note: null }).then(function (r) {
          t.disabled = false;
          if (r.error) return Z.toast(cn(r.error));
          Z.toast('已生成 ' + r.data.length + ' 个邀请码'); loadInvites();
        });
        break;
    }
    if (t.dataset.copy) {
      var code = t.dataset.copy;
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () {
  Z.toast('已复制 ' + code); }, function () { Z.toast('邀请码：' + code); });
    }
  });
  $('authClose').addEventListener('click', closeAuth);
  $('authMask').addEventListener('click', function (e) { if (e.target === this && !isGated()) closeAuth(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('authMask').classList.contains('hidden') && $('modalMask').classList.contains('hidden') && !isGated()) closeAuth();
  });
  $('authSeg').addEventListener('click', function (e) { var b = e.target.closest('.seg-btn'); if (b) { setAuthMode(b.dataset.auth); msg('loginMsg', ''); msg('regMsg', ''); } });
  $('formLogin').addEventListener('submit', doLogin);
  $('formRegister').addEventListener('submit', doRegister);
  $('formInviteGate').addEventListener('submit', doCompleteInvite);
  $('btnForgot').addEventListener('click', doForgot);
  $('btnGoogle').addEventListener('click', doGoogle);
  $('btnGateLogout').addEventListener('click', function () {
    clearTimeout(pushTimer);
    sb.auth.signOut().then(function (r) { if (r.error) Z.toast(cn(r.error)); });
  });
  $('regInvite').addEventListener('blur', checkInvite);
  $('regInvite').addEventListener('input', function () { this.value = this.value.toUpperCase(); $('inviteState').innerHTML = ''; $('inviteState').className = 'invite-state'; });
  $('gateInvite').addEventListener('blur', checkGateInvite);
  $('gateInvite').addEventListener('input', function () { this.value = this.value.toUpperCase(); $('gateInviteState').innerHTML = ''; $('gateInviteState').className = 'invite-state'; });
  var regHandleCheck = bindHandleInput($('regHandle'), $('regHandleState'));
  var gateHandleCheck = bindHandleInput($('gateHandle'), $('gateHandleState'));
  var profileHandleCheck = bindHandleInput($('profileHandleInput'), $('profileHandleState'));
  if ($('btnSaveProfile')) $('btnSaveProfile').addEventListener('click', function () { saveProfile(); });
  ['profileNameInput', 'profileHandleInput'].forEach(function (id) {
    var el = $(id);
    if (el) el.addEventListener('input', function () { this.dataset.useredit = '1'; });
  });
  if ($('btnAvatarChange')) $('btnAvatarChange').addEventListener('click', function () { var f = $('avatarFile'); if (f) f.click(); });
  if ($('avatarFile')) $('avatarFile').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    var btn = $('btnAvatarChange');
    if (btn) busy(btn, true, '处理中…');
    applyAvatarFile(file).catch(function (err) { Z.toast(cn(err)); }).then(function () { if (btn) busy(btn, false); });
  });
  if ($('btnAvatarRemove')) $('btnAvatarRemove').addEventListener('click', function () {
    Z.openModal({
      title: '移除头像？', ok: '移除', danger: true,
      html: '<p>移除后会显示名字首字母。如果这个账号用 Google 登录，没有自定义头像时仍会显示 Google 头像。</p>',
      onOk: function () { removeAvatar(); }
    });
  });

  /* ---------------- 启动 ---------------- */
  window.ZFCloud = {
    merge: merge, stable: stable, keyProblem: keyProblem, cn: cn,
    configured: function () { return configured; },
    userId: function () { return user() && user().id; },
    status: function () { return { configured: configured, loggedIn: !!user(), email: user() && user().email, sync: sync.status, profile: profile, inviteOk: inviteOk(), gated: isGated(), authReady: authReady, profileReady: profileReady, gateMode: gateMode }; },
    onLocalChange: function (replaceAll) { if (!user() || needsInvite()) return; if (replaceAll) { replaceAllPending = true; schedulePush(200); } else schedulePush(); },
    syncNow: syncNow, openAuth: openAuth, client: function () { return sb; },
    refreshChrome: renderChrome
  };
  renderChrome(); renderAccount();
  if (!configured) {
    authReady = true; profileReady = true;
    document.body.classList.remove('auth-booting');
    document.body.classList.add('auth-ready');
    return;
  }
  // 云端已配置：启动闪屏（非登录表单），直到 getSession + invite_ok 解析完成
  showBootSplash();
  // 若 localStorage 已有会话，优先进入「恢复登录」文案；无会话也不提前亮登录门
  var peeked = peekPersistedSession();
  if (peeked) setBootText('正在恢复登录…');

  var sessionResolved = false;
  function markSession(s, from) {
    // getSession 与 INITIAL_SESSION 可能先后到达；只采纳第一次，避免闪屏被登录门打断或重复拉 profile
    if (sessionResolved) return;
    sessionResolved = true;
    authReady = true;
    session = s || null;
    if (!session) {
      profile = null; profileReady = true; invites = null; setSync('off');
      renderAccount(); updateGate();
      return;
    }
    profileReady = false;
    renderAccount();
    updateGate();
    loadProfile().then(function () { if (inviteOk()) syncNow(); });
  }

  loadLib().then(function () {
    sb = window.supabase.createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'zenflow_auth', flowType: 'implicit' }
    });
    function applyAuthEvent(event, s) {
      if (event === 'PASSWORD_RECOVERY') setTimeout(promptNewPassword, 300);
      if (event === 'SIGNED_OUT') {
        session = null; profile = null; invites = null; profileReady = true; authReady = true;
        bootFinished = false;
        setSync('off'); renderAccount(); renderChrome(); updateGate();
        Z.toast && Z.toast('已退出登录');
        return;
      }
      // INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED
      // 标签页重新可见时，supabase-js 的 _recoverAndRefresh 会对同一会话再发一次 SIGNED_IN。
      // 会话已确认且仍是同一用户时，只更新内存中的 session，绝不重新进入「正在恢复登录」。
      if (!sessionResolved && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN')) {
        markSession(s, event);
        return;
      }
      if (sessionResolved && s && s.user) {
        var prevId = user() && user().id;
        session = s;
        if (prevId && prevId === s.user.id) return;
        bootFinished = false;
        profileReady = false;
        renderAccount(); updateGate();
        loadProfile().then(function () { if (inviteOk()) syncNow(); });
      } else if (sessionResolved && !s && event !== 'INITIAL_SESSION') {
        markSession(null, event);
      }
    }
    sb.auth.onAuthStateChange(applyAuthEvent);
    // 与 onAuthStateChange 并行：尽快确认会话（避免只等 INITIAL_SESSION）
    sb.auth.getSession().then(function (r) {
      if (sessionResolved) return;
      markSession(r.data && r.data.session, 'getSession');
    }).catch(function () {
      if (sessionResolved) return;
      markSession(null, 'getSession-error');
    });
    window.addEventListener('online', function () { if (user()) syncNow(); });
    // 切回标签页只补同步，不重走启动闪屏（闪屏只属于冷启动 / 真正的会话恢复）
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible') return;
      if (bootFinished) {
        document.body.classList.remove('auth-booting');
        if (!document.body.classList.contains('auth-gated')) document.body.classList.add('auth-ready');
      }
      if (user() && Date.now() - sync.at > 60000) syncNow();
    });
    window.addEventListener('pageshow', function (e) {
      if (e.persisted && bootFinished) {
        document.body.classList.remove('auth-booting');
        if (!document.body.classList.contains('auth-gated')) document.body.classList.add('auth-ready');
      }
    });
    setInterval(function () { if (user() && sync.status === 'error') syncNow(); }, 60000);
  }).catch(function (e) {
    loadError = e.message; authReady = true; profileReady = true; renderAccount(); updateGate();
  });
})();
