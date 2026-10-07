/* ZenFlow · 账号（Supabase Auth，邀请制）+ 云同步
 * - 未配置 Supabase（config.js 留空）时：只渲染本机模式说明，不加载云端代码。
 * - 已配置时：按需加载 vendor/supabase.js。登录默认手机号验证码，邮箱密码为第二页。
 *   人机验证按 config.js 的 CAPTCHA_PROVIDER / CAPTCHA_SITE_KEY 加载（仅登录页）。
 *   退出登录会登出并清除本机数据，不删除云端。登录后自动同步。
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
  var PULL_REMOTE_KEY = 'zenflow_pull_remote';       // 退出清本机后，下次登录只拉云端

  function appDataKey(k, projectRef) {
    if (!k || k === 'zenflow_supabase_override' || k === 'zenflow_pull_remote') return false;
    if (k.indexOf('zenflow_') === 0) return true;
    if (projectRef && k.indexOf('sb-' + projectRef + '-auth-token') === 0) return true;
    return false;
  }
  function localLooksEmpty(s) {
    if (!s) return true;
    if (s.checkins && Object.keys(s.checkins).length) return false;
    if (s.relapses && s.relapses.length) return false;
    if (s.urges && s.urges.length) return false;
    if (s.reasons && s.reasons.length) return false;
    if (s.displayName || s.avatarDataUrl) return false;
    if (s.goalSetAt > 0 || s.resetTypesSetAt > 0 || s.manualStreakStartSetAt > 0 || s.bestStreakMs > 0) return false;
    var rm = s.removed || {};
    if ((rm.ids && Object.keys(rm.ids).length) || (rm.reasons && Object.keys(rm.reasons).length) || (rm.checkins && Object.keys(rm.checkins).length)) return false;
    return true;
  }
  function chooseSync(local, remote, lastUid, uid, pullRemote, replaceAll) {
    if (replaceAll) return 'local';
    if (lastUid && lastUid !== uid) return remote ? 'remote' : 'local';
    if (!remote) return 'local';
    if (pullRemote || (!lastUid && localLooksEmpty(local))) return 'remote';
    return 'merge';
  }
  function normalizePhone(country, national) {
    var cc = String(country || '86').replace(/\D/g, '') || '86';
    var raw = String(national || '').trim();
    if (!raw) return { ok: false, error: '请输入手机号' };
    if (!/^[1-9]\d{0,3}$/.test(cc)) return { ok: false, error: '手机号不正确' };
    var compact = raw.replace(/[\s\-().]/g, '');
    var d;
    if (compact.charAt(0) === '+') {
      d = compact.slice(1).replace(/\D/g, '');
      if (!/^[1-9]\d{7,14}$/.test(d)) return { ok: false, error: '手机号不正确' };
      return { ok: true, e164: '+' + d };
    }
    d = compact.replace(/\D/g, '').replace(/^0+/, '');
    if (cc === '86' && d.indexOf('86') === 0 && d.length === 13) d = d.slice(2);
    if (cc === '86') {
      if (!/^1\d{10}$/.test(d)) return { ok: false, error: '手机号不正确' };
    } else if (d.length < 4 || d.length > 14) {
      return { ok: false, error: '手机号不正确' };
    }
    var all = cc + d;
    if (!/^[1-9]\d{7,14}$/.test(all)) return { ok: false, error: '手机号不正确' };
    return { ok: true, e164: '+' + all };
  }

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
  var syncing = false, pending = false, pushTimer = null, replaceAllPending = false, wipeLock = false, suppressSignedOut = false;
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
      s.src = 'vendor/supabase.js?v=32'; s.async = true;
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
    if (/HANDLE_TAKEN/.test(m)) return '@ID 已被占用';
    if (/HANDLE_INVALID/.test(m)) return '@ID 需为 3–20 位小写字母、数字或下划线';
    if (/Database error saving new user|INVITE_INVALID/i.test(m)) return '邀请码无效、已过期或已使用';
    if (/Invalid login credentials/i.test(m) || code === 'invalid_credentials') return '邮箱或密码不正确';
    if (/Email not confirmed/i.test(m)) return '邮箱还没确认';
    if (/already registered|already been registered|user_already_exists/i.test(m + code)) return '邮箱已注册，请登录';
    if (/Password should be|weak_password|password.*(short|characters)/i.test(m + code)) return '密码至少 8 位';
    if (/invalid phone|phone number.*(invalid|format)|E\.164|21211/i.test(m + code)) return '手机号不正确';
    if (code === 'otp_expired' || /otp_expired|token has expired or is invalid|invalid otp|otp.*invalid/i.test(m + code)) return '验证码错误或已过期';
    if (/rate limit|too many|over_(email|sms)_send_rate_limit|only request this after|429/i.test(m + code)) return '操作太频繁';
    if (/captcha/i.test(m + code)) return '请完成验证';
    if (/sms_send_failed|error sending (confirmation )?(sms|otp)|sms provider|phone provider|phone login is disabled|otp_disabled/i.test(m + code)) return '短信服务未配置';
    if (/invalid.*email|email.*invalid|validation_failed/i.test(m + code)) return '邮箱格式不正确';
    if (/signups? not allowed|signup_disabled/i.test(m + code)) return '服务器已关闭注册';
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return '网络失败';
    if (/NOT_ADMIN/.test(m)) return '需要管理员';
    if (/ADMIN_CANNOT_DELETE/.test(m)) return '管理员账号不能注销';
    if (/NOT_AUTHENTICATED/.test(m)) return '请先登录';
    if (/payload too large|exceeded the maximum|file size|entity too large/i.test(m)) return '图片超过 2MB';
    if (/mime type|invalid_mime|content type.*not allowed/i.test(m)) return '只支持 PNG、JPG、WebP 或 GIF';
    if (/INVITE_INVALID/.test(m)) return '邀请码无效、已过期或已被使用';
    if (/CANNOT_DEMOTE_SELF/.test(m)) return '不能取消自己的管理员身份';
    if (/CANNOT_BAN_SELF/.test(m)) return '不能禁用自己的账号';
    if (/REVOKE_FAILED/.test(m)) return '邀请码不存在或已被使用，无法作废';
    if (/JWT|session|refresh_token/i.test(m)) return '登录已过期';
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
    if (!sb || !user() || needsInvite() || wipeLock) return;
    if (syncing) { pending = true; if (opts.replaceAll) replaceAllPending = true; return; }
    syncing = true; setSync('syncing');
    var replaceAll = opts.replaceAll || replaceAllPending; replaceAllPending = false;
    try {
      var uid = user().id;
      var r = await sb.from('user_data').select('data,updated_at').eq('user_id', uid).maybeSingle();
      if (r.error) throw r.error;
      var remote = r.data && r.data.data ? Z.sanitize(r.data.data) : null;
      var local = Z.sanitize(Z.getState());
      if (wipeLock) return;
      var lastUid = null, pullRemote = false;
      try { lastUid = localStorage.getItem(LAST_UID_KEY); pullRemote = localStorage.getItem(PULL_REMOTE_KEY) === '1'; } catch (e) {}
      var choice = chooseSync(local, remote, lastUid, uid, pullRemote, replaceAll);
      var merged = choice === 'remote' ? (remote || Z.defaultState()) : choice === 'local' ? local : merge(local, remote);
      if (lastUid && lastUid !== uid && !replaceAll) Z.toast('已切换账号');
      if (wipeLock) return;
      if (stable(merged) !== stable(local)) Z.replaceState(merged);
      if (wipeLock) return;
      if (!remote || stable(Z.sanitize(merged)) !== stable(remote)) {
        var w = await sb.from('user_data').upsert({ user_id: uid, data: Z.sanitize(merged) }, { onConflict: 'user_id' });
        if (w.error) throw w.error;
      }
      localStorage.setItem(LAST_UID_KEY, uid);
      try { localStorage.removeItem(PULL_REMOTE_KEY); } catch (e) {}
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
  function metaAvatar() {
    var meta = (user() && user().user_metadata) || {};
    return meta.avatar_url || meta.picture || '';
  }
  function userContact() {
    var u = user();
    if (!u) return '';
    if (u.email) return u.email;
    if (u.phone) return String(u.phone).charAt(0) === '+' ? String(u.phone) : ('+' + u.phone);
    return '';
  }
  function shownName() {
    var u = user();
    var meta = (u && u.user_metadata) || {};
    var cloudName = (profile && profile.display_name) || '';
    var emailName = u && u.email ? u.email.split('@')[0] : '';
    if (u) return (cloudName || meta.full_name || meta.name || localDisplayName() || emailName || userContact() || '').trim();
    return localDisplayName();
  }
  function shownHandle() {
    return (profile && profile.handle) ? ('@' + profile.handle) : '';
  }
  function shownAvatar() {
    if (user() && profile && profile.avatar_url) return profile.avatar_url;
    if (user()) {
      var g = metaAvatar();
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
    paintAvatar(avatarEl, letterEl, shownAvatar(), name || userContact() || '?');
    var meName = $('settingsMeName'), meSub = $('settingsMeSub');
    if (meName) meName.textContent = name || (u ? '已登录' : '未登录');
    if (meSub) meSub.textContent = handle || (!u ? (configured ? '前往设置' : '本机模式') : (userContact() || syncLabel().text));
    paintAvatar($('settingsMeAvatar'), $('settingsMeLetter'), shownAvatar(), name || '?');
    fillProfileForm();
  }
  function renderChrome() {
    var L = syncLabel();
    var pill = $('syncPill');
    if (pill) { pill.className = 'sync-pill ' + L.cls; pill.innerHTML = ic(L.icon) + esc(L.text); }
    var logged = configured && user();
    var pp = document.querySelector('#screen-home .privacy-pill');
    if (pp) { pp.innerHTML = ic(logged ? 'cloud-check' : 'lock') + (logged ? '云同步' : '仅本机'); pp.title = logged ? '已登录，数据会同步' : '数据只在这台设备'; pp.classList.toggle('synced', !!logged); }
    renderSideUser();
    if (window.ZenFlowCore && window.ZenFlowCore.updateSettingsChrome) window.ZenFlowCore.updateSettingsChrome();
    renderDataSync();
  }

  /* ---------------- 设置 → 账号与同步 ---------------- */
  function fmtTime(t) {
    if (!t) return '尚未同步';
    var d = new Date(t), now = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    var hm = p(d.getHours()) + ':' + p(d.getMinutes());
    return d.toDateString() === now.toDateString() ? '今天 ' + hm : (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }
  function renderAccount(statusOnly) {
    try { renderAccountBody(statusOnly); } finally { renderDataSync(); }
  }
  function renderAccountBody(statusOnly) {
    var body = $('accountBody'); if (!body) return;
    if (statusOnly && user()) { var st = $('acctSync'); if (st) { st.innerHTML = syncLine(); return; } }
    if (!configured) {
      body.innerHTML =
        '<p class="small">本机模式。数据只在这台设备。</p>' +
        '<p class="muted small">' + (cfgError ? '<span class="danger-text">连接配置有误：' + esc(cfgError) + '</span>' : '云同步未开启。在 <code>config.js</code> 填写 Supabase 地址和 anon key。') + '</p>' +
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
        '<p class="small">需要登录。新用户要邀请码。</p>' +
        '<div class="acct-actions"><button class="btn btn-primary" id="btnOpenLogin">' + ic('log-in') + '登录</button>' +
        '<button class="btn btn-ghost" id="btnOpenRegister">' + ic('ticket') + '邀请码注册</button></div>' +
        (cfg.source === 'local' ? '<p class="muted small acct-src">使用本机连接设置 · <button class="btn-link" id="btnCloudSetup">修改</button></p>' : '');
      return;
    }
    var name = shownName() || (u.email || '').split('@')[0];
    var handle = shownHandle();
    var h = '<div class="acct-head">' + avatarHtml(shownAvatar(), name, 'story-avatar acct-avatar') + '<div class="acct-id"><b id="acctName">' + esc(name) + '</b>' +
      (handle ? '<span class="acct-handle">' + esc(handle) + '</span>' : '') +
      (profile && profile.is_admin ? '<span class="admin-tag">管理员</span>' : '') + '<span class="muted small" id="acctEmail">' + esc(userContact()) + '</span></div></div>';
    body.innerHTML = h;
  }
  function renderDataSync() {
    var sub = $('dataSyncSub');
    var btn = $('btnSyncNow');
    if (!sub) return;
    if (!configured) {
      sub.textContent = '未开启';
      if (btn) btn.classList.add('hidden');
      return;
    }
    if (!user()) {
      sub.textContent = '未登录';
      if (btn) btn.classList.add('hidden');
      return;
    }
    if (btn) btn.classList.remove('hidden');
    var s = sync.status;
    if (s === 'syncing') sub.textContent = '正在同步';
    else if (s === 'error') sub.textContent = '失败' + (sync.error ? '：' + sync.error : '');
    else if (s === 'offline') sub.textContent = '离线';
    else sub.textContent = '上次 ' + fmtTime(sync.at);
  }
  function syncLine() {
    var s = sync.status;
    var t = s === 'syncing' ? '正在同步…' : s === 'error' ? '同步失败：' + esc(sync.error) : s === 'offline' ? '离线，联网后会同步' : '上次同步：' + fmtTime(sync.at);
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
  var authChannel = 'phone';
  function phoneLoginEnabled() {
    var c = window.ZENFLOW_CONFIG || {};
    return c.PHONE_LOGIN_ENABLED !== false;
  }
  var emailMode = 'login';
  var phoneMode = 'login'; // login | register | code
  var phoneIntent = 'login';
  var phoneE164 = '';
  var phoneRegData = null;
  var smsUntil = 0;
  var smsTimer = null;
  var captchaToken = '';
  var captchaWidget = null;
  var captchaLoading = null;

  function captchaSettings() {
    var c = window.ZENFLOW_CONFIG || {};
    var provider = String(c.CAPTCHA_PROVIDER || 'turnstile').toLowerCase();
    if (provider !== 'hcaptcha') provider = 'turnstile';
    var siteKey = String(c.CAPTCHA_SITE_KEY || '').trim();
    return { provider: provider, siteKey: siteKey, enabled: !!siteKey };
  }
  function captchaApi() {
    var p = captchaSettings().provider;
    if (p === 'hcaptcha') {
      return {
        src: 'https://js.hcaptcha.com/1/api.js?render=explicit&hl=zh-CN',
        onloadName: '',
        render: function (el, siteKey) {
          /* hCaptcha 没有 flexible，用 normal（其支持的最大可见尺寸） */
          return window.hcaptcha.render(el, {
            sitekey: siteKey,
            theme: captchaTheme(),
            size: 'normal',
            callback: function (token) { setCaptchaToken(token); },
            'expired-callback': function () { setCaptchaToken(''); },
            'error-callback': function () { setCaptchaToken(''); }
          });
        },
        reset: function (id) { if (window.hcaptcha && id != null) window.hcaptcha.reset(id); },
        remove: function (id) { if (window.hcaptcha && id != null) window.hcaptcha.remove(id); }
      };
    }
    return {
      /* 不用 turnstile.ready()：动态插入的 script 默认 async，ready() 会报错 */
      src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=zfTurnstileOnload',
      onloadName: 'zfTurnstileOnload',
      render: function (el, siteKey) {
        return window.turnstile.render(el, {
          sitekey: siteKey,
          size: 'flexible',
          theme: captchaTheme(),
          language: 'zh-cn',
          callback: function (token) { setCaptchaToken(token); },
          'expired-callback': function () { setCaptchaToken(''); },
          'error-callback': function () { setCaptchaToken(''); }
        });
      },
      reset: function (id) { if (window.turnstile && id != null) window.turnstile.reset(id); },
      remove: function (id) { if (window.turnstile && id != null) window.turnstile.remove(id); }
    };
  }
  function placeCaptcha(form) {
    var host = $('captchaHost');
    if (!host || !form) return;
    var anchor = form.querySelector('.auth-msg');
    if (host.parentElement === form && (!anchor || host.nextElementSibling === anchor)) return;
    if (anchor) form.insertBefore(host, anchor);
    else form.appendChild(host);
    /* 容器换表单后旧 iframe 会失效，拆掉再挂一次 */
    if (captchaWidget != null) {
      var api = captchaApi();
      try { api.remove(captchaWidget); } catch (e) {}
      captchaWidget = null;
      captchaToken = '';
      host.innerHTML = '';
      paintCaptchaButtons();
      ensureCaptcha();
    }
  }
  function captchaTheme() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr === 'dark' || attr === 'light') return attr;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch (e) {}
    return 'light';
  }
  var captchaRenderedTheme = '';
  function refreshCaptchaTheme() {
    if (!captchaSettings().enabled || captchaWidget == null) return;
    if (captchaTheme() === captchaRenderedTheme) return;
    var host = $('captchaHost');
    try { captchaApi().remove(captchaWidget); } catch (e) {}
    captchaWidget = null;
    captchaToken = '';
    if (host) host.innerHTML = '';
    paintCaptchaButtons();
    ensureCaptcha();
  }
  function watchCaptchaTheme() {
    if (window.MutationObserver) {
      new MutationObserver(refreshCaptchaTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    }
    try {
      var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
      if (mq) {
        var onMq = function () { if (!document.documentElement.getAttribute('data-theme')) refreshCaptchaTheme(); };
        if (mq.addEventListener) mq.addEventListener('change', onMq);
        else if (mq.addListener) mq.addListener(onMq);
      }
    } catch (e2) {}
  }
  function captchaWait() {
    return captchaSettings().enabled && !captchaToken;
  }
  function setCaptchaToken(token) {
    captchaToken = token || '';
    paintCaptchaButtons();
  }
  function paintCaptchaButtons() {
    var wait = captchaWait();
    ['btnLogin', 'btnRegister', 'btnForgot', 'btnVerifySms'].forEach(function (id) {
      var el = $(id);
      if (el) el.disabled = wait;
    });
    paintSmsButtons();
  }
  function resetCaptcha() {
    captchaToken = '';
    paintCaptchaButtons();
    var api = captchaApi();
    if (captchaWidget != null) {
      try { api.reset(captchaWidget); } catch (e) { captchaWidget = null; }
    }
  }
  function ensureCaptcha() {
    var host = $('captchaHost');
    var cfgCap = captchaSettings();
    if (!host) return;
    if (!cfgCap.enabled) {
      host.classList.add('captcha-off');
      host.innerHTML = '';
      captchaToken = '';
      captchaWidget = null;
      paintCaptchaButtons();
      return;
    }
    host.classList.remove('captcha-off');
    paintCaptchaButtons();
    if (captchaWidget != null) return;
    if (captchaLoading) return;
    var api = captchaApi();
    var globalName = cfgCap.provider === 'hcaptcha' ? 'hcaptcha' : 'turnstile';
    function renderNow() {
      if (captchaWidget != null || !$('captchaHost') || !window[globalName]) return;
      try {
        captchaRenderedTheme = captchaTheme();
        captchaWidget = api.render($('captchaHost'), cfgCap.siteKey);
      } catch (e) { captchaWidget = null; }
    }
    if (window[globalName]) { renderNow(); return; }
    captchaLoading = true;
    if (api.onloadName) window[api.onloadName] = function () { captchaLoading = null; renderNow(); };
    var s = document.createElement('script');
    s.src = api.src;
    s.async = true;
    s.onload = function () { if (!api.onloadName) { captchaLoading = null; renderNow(); } };
    s.onerror = function () { captchaLoading = null; };
    document.head.appendChild(s);
  }
  function takeCaptcha() {
    if (!captchaSettings().enabled) return '';
    if (!captchaToken) return false;
    return captchaToken;
  }
  function paintAuthCopy() {
    var foot = $('authFootText');
    if (gateMode === 'invite' || gateMode === 'handle') {
      if (foot) foot.textContent = '完成后进入。';
      return;
    }
    if (authChannel === 'email') {
      $('authTitle').textContent = emailMode === 'register' ? '注册' : '登录';
      $('authSub').textContent = emailMode === 'register' ? '需要邀请码。' : '登录后会同步。';
      if (foot) foot.textContent = '密码由 Supabase 处理，这里看不到。';
      return;
    }
    if (phoneMode === 'code') {
      $('authTitle').textContent = '验证码';
      $('authSub').textContent = phoneE164 ? ('已发送到 ' + phoneE164) : '输入短信验证码';
    } else if (phoneMode === 'register') {
      $('authTitle').textContent = '注册';
      $('authSub').textContent = '需要邀请码。';
    } else {
      $('authTitle').textContent = '登录';
      $('authSub').textContent = '登录后会同步。';
    }
    if (foot) foot.textContent = '验证码只用于登录。';
  }
  function setChannel(ch) {
    if (!phoneLoginEnabled()) ch = 'email';
    authChannel = ch === 'email' ? 'email' : 'phone';
    if ($('authSeg')) $('authSeg').classList.toggle('hidden', !phoneLoginEnabled());
    document.querySelectorAll('#authSeg .seg-btn').forEach(function (b) {
      if (!b.dataset.channel) return;
      var on = b.dataset.channel === authChannel;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if ($('panePhone')) $('panePhone').classList.toggle('hidden', authChannel !== 'phone');
    if ($('paneEmail')) $('paneEmail').classList.toggle('hidden', authChannel !== 'email');
    if (authChannel === 'phone') placeCaptcha(phoneMode === 'code' ? $('formPhoneCode') : $('formPhone'));
    else placeCaptcha(emailMode === 'register' ? $('formRegister') : $('formLogin'));
    paintAuthCopy();
    ensureCaptcha();
  }
  function setEmailMode(m) {
    emailMode = m === 'register' ? 'register' : 'login';
    document.querySelectorAll('#emailSeg .seg-btn').forEach(function (b) {
      var on = b.dataset.auth === emailMode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if ($('formLogin')) $('formLogin').classList.toggle('hidden', emailMode !== 'login');
    if ($('formRegister')) $('formRegister').classList.toggle('hidden', emailMode !== 'register');
    if (authChannel === 'email') {
      placeCaptcha(emailMode === 'register' ? $('formRegister') : $('formLogin'));
      paintAuthCopy();
    }
  }
  function paintSmsButtons() {
    var left = Math.max(0, Math.ceil((smsUntil - Date.now()) / 1000));
    var send = $('btnSendSms');
    var resend = $('btnResendSms');
    var wait = captchaWait();
    if (send) {
      send.disabled = left > 0 || wait;
      send.textContent = left > 0 ? (left + ' 秒') : '获取验证码';
    }
    if (resend) {
      resend.disabled = left > 0 || wait;
      resend.textContent = left > 0 ? (left + ' 秒') : '重新发送';
    }
    if (left > 0) {
      clearTimeout(smsTimer);
      smsTimer = setTimeout(paintSmsButtons, 250);
    }
  }
  function setPhoneMode(mode) {
    phoneMode = mode === 'register' || mode === 'code' ? mode : 'login';
    if ($('phoneRegFields')) $('phoneRegFields').classList.toggle('hidden', phoneMode !== 'register');
    if ($('formPhone')) $('formPhone').classList.toggle('hidden', phoneMode === 'code');
    if ($('formPhoneCode')) $('formPhoneCode').classList.toggle('hidden', phoneMode !== 'code');
    var link = $('btnPhoneMode');
    if (link) link.textContent = phoneMode === 'register' ? '已有账号' : '新用户注册';
    var verify = $('btnVerifySms');
    if (verify && phoneMode === 'code') verify.textContent = phoneIntent === 'register' ? '注册' : '登录';
    var hint = $('phoneCodeHint');
    if (hint) hint.textContent = phoneE164 ? ('已发送到 ' + phoneE164) : '验证码已发送';
    if (authChannel === 'phone') placeCaptcha(phoneMode === 'code' ? $('formPhoneCode') : $('formPhone'));
    paintAuthCopy();
  }
  function phoneCountry() {
    var sel = $('phoneCc');
    var v = sel ? sel.value : '86';
    if (v === 'other') return ($('phoneCcOther') && $('phoneCcOther').value) || '';
    return v || '86';
  }
  function openAuth(mode) {
    if (!configured) { openSetup(); return; }
    if (!phoneLoginEnabled()) {
      setChannel('email');
      setEmailMode(mode === 'register' ? 'register' : 'login');
    } else if (mode === 'register') { setChannel('phone'); setPhoneMode('register'); }
    else if (mode === 'email') { setChannel('email'); setEmailMode('login'); }
    else { setChannel('phone'); setPhoneMode(phoneMode === 'code' ? 'code' : 'login'); }
    if ($('loginMsg')) $('loginMsg').textContent = '';
    if ($('regMsg')) $('regMsg').textContent = '';
    if ($('phoneMsg')) $('phoneMsg').textContent = '';
    $('authMask').classList.remove('hidden');
    if (!isGated()) Z.lockScroll();
    ensureCaptcha();
    setTimeout(function () {
      var focusEl = authChannel === 'email'
        ? (emailMode === 'register' ? $('regName') : $('loginEmail'))
        : (phoneMode === 'code' ? $('phoneCode') : phoneMode === 'register' ? $('phoneName') : $('phoneNational'));
      if (focusEl) focusEl.focus();
    }, 60);
  }
  function closeAuth() {
    if (isGated()) return;
    if ($('authMask').classList.contains('hidden')) return;
    $('authMask').classList.add('hidden');
    Z.unlockScroll();
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
    $('authTitle').textContent = '完成注册';
    var who = userContact();
    $('authSub').textContent = who ? ('已登录 ' + who) : '填写邀请码和 @ID';
    $('inviteGateHint').textContent = '填写邀请码和 @ID。';
    var btn = $('btnCompleteInvite');
    if (btn) btn.innerHTML = ic('ticket') + '完成注册';
    prefillGateProfile();
    $('gateMsg').textContent = '';
    setTimeout(function () { var el = $('gateInvite'); if (el) el.focus(); }, 60);
    paintAuthCopy();
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
    $('authTitle').textContent = '设置 @ID';
    var who = userContact();
    $('authSub').textContent = who ? ('已登录 ' + who) : '设置一个唯一的 @ID';
    $('inviteGateHint').textContent = '这个账号还没有 @ID。';
    var btn = $('btnCompleteInvite');
    if (btn) btn.innerHTML = ic('circle-check') + '保存并进入';
    prefillGateProfile();
    $('gateMsg').textContent = '';
    setTimeout(function () { var el = $('gateHandle'); if (el) el.focus(); }, 60);
    paintAuthCopy();
  }
  function prefillGateProfile() {
    var nameEl = $('gateName');
    var handleEl = $('gateHandle');
    if (nameEl && document.activeElement !== nameEl && !nameEl.value) nameEl.value = (profile && profile.display_name) || '';
    if (handleEl && document.activeElement !== handleEl && profile && profile.handle && !handleEl.value) handleEl.value = profile.handle;
  }
  function showLoginGate() {
    var already = gateMode === 'login';
    gateMode = 'login';
    if ($('authMainPane')) $('authMainPane').classList.remove('hidden');
    $('formInviteGate').classList.add('hidden');
    if (!already) {
      setPhoneMode('login');
      setEmailMode('login');
      setChannel(phoneLoginEnabled() ? 'phone' : 'email');
    } else {
      if ($('authSeg')) $('authSeg').classList.toggle('hidden', !phoneLoginEnabled());
      ensureCaptcha();
    }
    document.body.classList.remove('auth-booting');
    document.body.classList.add('auth-gated');
    document.body.classList.add('auth-ready');
    $('authMask').classList.remove('hidden');
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

  async function checkPhoneInvite() {
    var code = normInvite($('phoneInvite').value), el = $('phoneInviteState');
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
      Z.toast(needInvite ? '注册完成' : '已设置 @ID');
      updateGate();
      renderAccount();
      renderChrome();
      if (profile && profile.invite_ok) syncNow();
      if (profile && profile.is_admin && window.ZFAdmin && window.ZFAdmin.onProfile) window.ZFAdmin.onProfile();
    } catch (err) { msg('gateMsg', cn(err)); }
    finally { busy(btn, false); }
  }

  function withCaptcha(options) {
    options = options || {};
    var cap = takeCaptcha();
    if (cap === false) return null;
    if (cap) options.captchaToken = cap;
    return options;
  }
  async function preparePhoneRegister() {
    var name = $('phoneName').value.trim().slice(0, 20);
    var handle = normalizeHandleInput($('phoneHandle').value);
    var code = normInvite($('phoneInvite').value);
    var problem = handleProblem(handle);
    if (problem) return { error: problem };
    if (!code) return { error: '请输入邀请码' };
    var avail = phoneHandleCheck ? await phoneHandleCheck.check() : null;
    if (avail === 'invalid') return { error: cn(new Error('HANDLE_INVALID')) };
    if (avail === false) return { error: cn(new Error('HANDLE_TAKEN')) };
    var valid = await checkPhoneInvite();
    if (valid === false) return { error: '邀请码无效、已过期或已使用' };
    return { data: { invite_code: code, handle: handle, display_name: name || null } };
  }
  async function doSendSms(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (!sb) return;
    var resend = phoneMode === 'code';
    var intent = resend ? phoneIntent : phoneMode;
    var msgId = resend ? 'phoneCodeMsg' : 'phoneMsg';
    if (smsUntil > Date.now()) return;
    var norm = normalizePhone(phoneCountry(), $('phoneNational').value);
    if (!norm.ok) return msg(msgId, norm.error);
    msg(msgId, '');
    var regData = null;
    if (intent === 'register' && !resend) {
      var prepared = await preparePhoneRegister();
      if (prepared.error) return msg('phoneMsg', prepared.error);
      regData = prepared.data;
    } else if (intent === 'register' && phoneRegData) {
      regData = phoneRegData;
    }
    var options = withCaptcha({});
    if (!options) return msg(msgId, '请完成验证');
    if (regData) options.data = regData;
    var btn = resend ? $('btnResendSms') : $('btnSendSms');
    if (btn) busy(btn, true, '发送中…');
    try {
      var r = await sb.auth.signInWithOtp({ phone: norm.e164, options: options });
      if (r.error) throw r.error;
      phoneE164 = norm.e164;
      phoneIntent = intent === 'register' ? 'register' : 'login';
      if (regData) phoneRegData = regData;
      smsUntil = Date.now() + 60000;
      setPhoneMode('code');
      paintSmsButtons();
      msg('phoneCodeMsg', '');
      var codeEl = $('phoneCode');
      if (codeEl) codeEl.focus();
    } catch (err) {
      msg(msgId, cn(err));
      if (/频繁|rate|60/.test(cn(err))) { smsUntil = Date.now() + 60000; paintSmsButtons(); }
    } finally {
      resetCaptcha();
      if (btn) busy(btn, false);
      paintSmsButtons();
    }
  }
  async function doVerifySms(e) {
    e.preventDefault();
    if (!sb || !phoneE164) return;
    var token = String($('phoneCode').value || '').replace(/\s/g, '');
    if (!token) return msg('phoneCodeMsg', '请输入验证码');
    if (!/^\d{4,8}$/.test(token)) return msg('phoneCodeMsg', '验证码不正确');
    var options = withCaptcha({});
    if (!options) return msg('phoneCodeMsg', '请完成验证');
    var btn = $('btnVerifySms'); busy(btn, true, '验证中…'); msg('phoneCodeMsg', '');
    try {
      var payload = { phone: phoneE164, token: token, type: 'sms' };
      if (options.captchaToken) payload.options = { captchaToken: options.captchaToken };
      var r = await sb.auth.verifyOtp(payload);
      if (r.error) throw r.error;
      $('phoneCode').value = '';
      Z.toast(phoneIntent === 'register' ? '注册成功' : '登录成功');
    } catch (err) { msg('phoneCodeMsg', cn(err)); }
    finally { resetCaptcha(); busy(btn, false); paintCaptchaButtons(); }
  }
  async function doLogin(e) {
    e.preventDefault();
    var email = $('loginEmail').value.trim(), pw = $('loginPassword').value;
    if (!EMAIL_RE.test(email)) return msg('loginMsg', '请输入有效的邮箱');
    if (!pw) return msg('loginMsg', '请输入密码');
    var options = withCaptcha({});
    if (!options) return msg('loginMsg', '请完成验证');
    var btn = $('btnLogin'); busy(btn, true, '登录中…'); msg('loginMsg', '');
    try {
      var r = await sb.auth.signInWithPassword({ email: email, password: pw, options: options });
      if (r.error) throw r.error;
      $('loginPassword').value = '';
      Z.toast('登录成功');
    } catch (err) { msg('loginMsg', cn(err)); }
    finally { resetCaptcha(); busy(btn, false); paintCaptchaButtons(); }
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
    var options = withCaptcha({ data: { invite_code: code, display_name: name || null, handle: handle }, emailRedirectTo: appUrl() });
    if (!options) return msg('regMsg', '请完成验证');
    var btn = $('btnRegister'); busy(btn, true, '注册中…'); msg('regMsg', '');
    try {
      var avail = regHandleCheck ? await regHandleCheck.check() : null;
      if (avail === 'invalid') throw new Error('HANDLE_INVALID');
      if (avail === false) throw new Error('HANDLE_TAKEN');
      var valid = await checkInvite();
      if (valid === false) throw new Error('INVITE_INVALID');
      var r = await sb.auth.signUp({ email: email, password: pw, options: options });
      if (r.error) throw r.error;
      $('regPassword').value = ''; $('regPassword2').value = '';
      if (r.data && r.data.session) { Z.toast('注册成功'); }
      else if (r.data && r.data.user && r.data.user.identities && r.data.user.identities.length === 0) msg('regMsg', '邮箱已注册，请登录');
      else msg('regMsg', '确认邮件已发到 ' + email + '。点开链接后再登录。', true);
    } catch (err) { msg('regMsg', cn(err)); }
    finally { resetCaptcha(); busy(btn, false); paintCaptchaButtons(); }
  }
  async function doForgot() {
    var email = $('loginEmail').value.trim();
    if (!EMAIL_RE.test(email)) { msg('loginMsg', '先填写注册邮箱'); $('loginEmail').focus(); return; }
    var options = withCaptcha({ redirectTo: appUrl() });
    if (!options) { msg('loginMsg', '请完成验证'); return; }
    var btn = $('btnForgot'); btn.disabled = true;
    try {
      var r = await sb.auth.resetPasswordForEmail(email, options);
      if (r.error) throw r.error;
      msg('loginMsg', '如果邮箱已注册，重置邮件已发出。', true);
    } catch (err) { msg('loginMsg', cn(err)); }
    finally { resetCaptcha(); paintCaptchaButtons(); }
  }
  function promptNewPassword() {
    Z.openModal({
      title: '设置新密码', ok: '保存',
      html: '<p>至少 8 位。</p><input type="password" id="newPw" autocomplete="new-password" placeholder="新密码" />',
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
      html: '<p>填写 Supabase 地址和 anon key。只存在这台设备；所有设备都要用，请写进 <code>config.js</code>。</p>' +
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
      ? '留空昵称再保存会清除昵称。'
      : '本机模式，不需要 @ID。';
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
  var ORIENT_TEST = 'data:image/jpeg;base64,/9j/4QAiRXhpZgAASUkqAAgAAAABABIBAwABAAAABgAAAAAAAAD/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD4H8Q/8h/Uv+vmX/0M0UUV/ptkP/Ipwn/XuH/pKPAzr/kZ4r/r5P8A9KZ//9k=';
  var autoOrientPromise = null;
  var crop = { source: null, iw: 0, ih: 0, x: 0, y: 0, zoom: 1, stage: 0, pointers: {}, pinch: null };

  function cropOpen() {
    var mask = $('cropMask');
    return !!(mask && !mask.classList.contains('hidden'));
  }
  function clampNum(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function browserAutoOrients() {
    if (!autoOrientPromise) {
      autoOrientPromise = new Promise(function (resolve) {
        var img = new Image();
        img.onload = function () { resolve(img.naturalWidth === 1 && img.naturalHeight === 2); };
        img.onerror = function () { resolve(true); };
        img.src = ORIENT_TEST;
      });
    }
    return autoOrientPromise;
  }
  function readExifOrientation(file) {
    var type = (file && file.type) || '';
    var name = (file && file.name) || '';
    if (!/jpe?g$/i.test(type) && !/\.jpe?g$/i.test(name)) return Promise.resolve(1);
    var slice = file.slice(0, 262144);
    var read = slice.arrayBuffer ? slice.arrayBuffer() : new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('exif')); };
      reader.readAsArrayBuffer(slice);
    });
    return read.then(function (buf) { return parseExifOrientation(new DataView(buf)); }, function () { return 1; });
  }
  function parseExifOrientation(view) {
    if (view.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return 1;
    var offset = 2;
    while (offset + 4 < view.byteLength) {
      if (view.getUint8(offset) !== 0xFF) break;
      var marker = view.getUint8(offset + 1);
      if (marker === 0xD9 || marker === 0xDA) break;
      if (marker === 0x00 || marker === 0x01 || (marker >= 0xD0 && marker <= 0xD7)) { offset += 2; continue; }
      var size = view.getUint16(offset + 2);
      if (size < 2) break;
      if (marker === 0xE1) {
        var start = offset + 4;
        if (start + 8 <= view.byteLength && view.getUint32(start) === 0x45786966 && view.getUint16(start + 4) === 0) {
          return readTiffOrientation(view, start + 6);
        }
      }
      offset += 2 + size;
    }
    return 1;
  }
  function readTiffOrientation(view, tiff) {
    if (tiff + 8 > view.byteLength) return 1;
    var endian = view.getUint16(tiff);
    if (endian !== 0x4949 && endian !== 0x4D4D) return 1;
    var le = endian === 0x4949;
    var u16 = function (o) { return view.getUint16(o, le); };
    var u32 = function (o) { return view.getUint32(o, le); };
    if (u16(tiff + 2) !== 42) return 1;
    var ifd = tiff + u32(tiff + 4);
    if (ifd + 2 > view.byteLength) return 1;
    var count = u16(ifd);
    for (var i = 0; i < count; i++) {
      var entry = ifd + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      if (u16(entry) === 0x0112) {
        var val = u16(entry + 8);
        return val >= 1 && val <= 8 ? val : 1;
      }
    }
    return 1;
  }
  function applyOrientation(ctx, o, cw, ch) {
    switch (o) {
      case 2: ctx.transform(-1, 0, 0, 1, cw, 0); break;
      case 3: ctx.transform(-1, 0, 0, -1, cw, ch); break;
      case 4: ctx.transform(1, 0, 0, -1, 0, ch); break;
      case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
      case 6: ctx.transform(0, 1, -1, 0, cw, 0); break;
      case 7: ctx.transform(0, -1, -1, 0, cw, ch); break;
      case 8: ctx.transform(0, -1, 1, 0, 0, ch); break;
      default: break;
    }
  }
  function loadImageElement(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('无法读取图片')); };
      img.src = url;
    });
  }
  function rasterizeOriented(img, orientation) {
    var sw = img.naturalWidth || img.width;
    var sh = img.naturalHeight || img.height;
    if (!sw || !sh) throw new Error('无法读取图片');
    var swapped = orientation >= 5 && orientation <= 8;
    var ow = swapped ? sh : sw;
    var oh = swapped ? sw : sh;
    var fit = Math.min(1, 1600 / Math.max(ow, oh));
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(ow * fit));
    canvas.height = Math.max(1, Math.round(oh * fit));
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (fit !== 1) ctx.scale(fit, fit);
    applyOrientation(ctx, orientation, ow, oh);
    ctx.drawImage(img, 0, 0);
    return canvas;
  }
  function acceptableAvatarFile(file) {
    if (!file) return '没有选择图片';
    var type = file.type || '';
    var name = file.name || '';
    var ok = /^image\/(png|jpeg|webp|gif)$/.test(type) || (!type && /\.(png|jpe?g|webp|gif)$/i.test(name));
    if (!ok) return '请选择 PNG、JPG、WebP 或 GIF';
    if (file.size > 12 * 1024 * 1024) return '原图太大，请换一张小一点的';
    return '';
  }
  function coverScale() {
    var S = crop.stage || 1;
    return Math.max(S / crop.iw, S / crop.ih);
  }
  function clampCrop() {
    var S = crop.stage;
    var sc = coverScale() * crop.zoom;
    var minX = S - crop.iw * sc;
    var minY = S - crop.ih * sc;
    if (crop.x > 0) crop.x = 0;
    if (crop.y > 0) crop.y = 0;
    if (crop.x < minX) crop.x = minX;
    if (crop.y < minY) crop.y = minY;
  }
  function drawCrop() {
    var canvas = $('cropView');
    var S = crop.stage;
    if (!canvas || !S || !crop.source) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var px = Math.max(1, Math.round(S * dpr));
    if (canvas.width !== px || canvas.height !== px) { canvas.width = px; canvas.height = px; }
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, S, S);
    var sc = coverScale() * crop.zoom;
    ctx.drawImage(crop.source, crop.x, crop.y, crop.iw * sc, crop.ih * sc);
  }
  function syncCropSlider() {
    var slider = $('cropZoom');
    if (slider) slider.value = String(crop.zoom);
  }
  function zoomCropAround(nextZoom, px, py) {
    var oldScale = coverScale() * crop.zoom;
    var zoom = clampNum(nextZoom, 1, 4);
    var newScale = coverScale() * zoom;
    if (!(oldScale > 0)) return;
    var ix = (px - crop.x) / oldScale;
    var iy = (py - crop.y) / oldScale;
    crop.zoom = zoom;
    crop.x = px - ix * newScale;
    crop.y = py - iy * newScale;
    clampCrop();
    drawCrop();
    syncCropSlider();
  }
  function resetCropLayout() {
    var stage = $('cropStage');
    var S = stage ? stage.clientWidth : 0;
    if (!S || !crop.source) return false;
    crop.stage = S;
    crop.zoom = 1;
    var sc = coverScale();
    crop.x = (S - crop.iw * sc) / 2;
    crop.y = (S - crop.ih * sc) / 2;
    clampCrop();
    drawCrop();
    syncCropSlider();
    return true;
  }
  function cropPointerPos(e) {
    var rect = $('cropStage').getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function cropPointerList() {
    var out = [];
    Object.keys(crop.pointers).forEach(function (id) { out.push(crop.pointers[id]); });
    return out;
  }
  function beginPinch() {
    var pts = cropPointerList();
    if (pts.length < 2) { crop.pinch = null; return; }
    crop.pinch = {
      dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
      zoom: crop.zoom,
      midX: (pts[0].x + pts[1].x) / 2,
      midY: (pts[0].y + pts[1].y) / 2,
      x: crop.x,
      y: crop.y
    };
  }
  function applyPinch() {
    var pts = cropPointerList();
    if (pts.length < 2 || !crop.pinch) return;
    var dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    var midX = (pts[0].x + pts[1].x) / 2;
    var midY = (pts[0].y + pts[1].y) / 2;
    var next = clampNum(crop.pinch.zoom * (dist / crop.pinch.dist), 1, 4);
    var oldScale = coverScale() * crop.pinch.zoom;
    var newScale = coverScale() * next;
    var ix = (crop.pinch.midX - crop.pinch.x) / oldScale;
    var iy = (crop.pinch.midY - crop.pinch.y) / oldScale;
    crop.zoom = next;
    crop.x = midX - ix * newScale;
    crop.y = midY - iy * newScale;
    clampCrop();
    drawCrop();
    syncCropSlider();
  }
  function exportCropBlob() {
    return new Promise(function (resolve, reject) {
      if (!crop.source || !crop.stage) return reject(new Error('请先调整裁剪区域'));
      var S = crop.stage;
      var sc = coverScale() * crop.zoom;
      var srcX = -crop.x / sc;
      var srcY = -crop.y / sc;
      var srcS = S / sc;
      if (srcX < 0) srcX = 0;
      if (srcY < 0) srcY = 0;
      if (srcX + srcS > crop.iw) srcX = Math.max(0, crop.iw - srcS);
      if (srcY + srcS > crop.ih) srcY = Math.max(0, crop.ih - srcS);
      var out = document.createElement('canvas');
      out.width = 256;
      out.height = 256;
      var ctx = out.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(crop.source, srcX, srcY, srcS, srcS, 0, 0, 256, 256);
      if (!out.toBlob) return reject(new Error('浏览器不支持图片处理'));
      out.toBlob(function (blob) {
        if (blob) return resolve(blob);
        out.toBlob(function (jpeg) { jpeg ? resolve(jpeg) : reject(new Error('无法处理这张图片')); }, 'image/jpeg', 0.9);
      }, 'image/webp', 0.9);
    });
  }
  function closeCrop() {
    var mask = $('cropMask');
    var was = mask && !mask.classList.contains('hidden');
    if (mask) mask.classList.add('hidden');
    crop.source = null;
    crop.pointers = {};
    crop.pinch = null;
    var done = $('cropDone');
    if (done) { done.disabled = false; done.textContent = '完成'; }
    if (was && Z && Z.unlockScroll) Z.unlockScroll();
  }
  function openAvatarCrop(file) {
    var problem = acceptableAvatarFile(file);
    if (problem) return Promise.reject(new Error(problem));
    return Promise.all([readExifOrientation(file), browserAutoOrients(), loadImageElement(file)]).then(function (parts) {
      var orientation = parts[1] ? 1 : (parts[0] || 1);
      var source = rasterizeOriented(parts[2], orientation);
      crop.source = source;
      crop.iw = source.width;
      crop.ih = source.height;
      crop.zoom = 1;
      crop.x = 0;
      crop.y = 0;
      crop.pointers = {};
      crop.pinch = null;
      var view = $('cropView');
      if (view) { view.width = 1; view.height = 1; }
      var mask = $('cropMask');
      if (!mask) throw new Error('无法打开裁剪');
      mask.classList.remove('hidden');
      if (Z && Z.lockScroll) Z.lockScroll();
      return new Promise(function (resolve) {
        var tries = 0;
        var tick = function () {
          if (resetCropLayout()) return resolve();
          if (++tries > 12) return resolve();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    });
  }
  function finishCrop() {
    var btn = $('cropDone');
    if (btn) { btn.disabled = true; btn.textContent = '处理中…'; }
    return exportCropBlob().then(function (blob) {
      return applyAvatarBlob(blob);
    }).then(function () {
      closeCrop();
    }).catch(function (err) {
      if (btn && cropOpen()) { btn.disabled = false; btn.textContent = '完成'; }
      throw err;
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
  async function applyAvatarBlob(blob) {
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

  /* ---------------- 退出：登出后清本机，不删云端 ---------------- */
  function projectRef() {
    var m = String(cfg.url || '').match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
    return m ? m[1] : '';
  }
  function shellCacheRequest(url) {
    try {
      var u = new URL(url, location.href);
      if (u.origin !== location.origin) return false;
      var path = u.pathname.replace(/\/+$/, '') || '/';
      var parts = path.split('/');
      var base = parts[parts.length - 1] || '';
      if (!base) return true;
      if (/^(index\.html|privacy\.html|styles\.css|data\.js|streak\.js|strings\.js|app\.js|cloud\.js|admin\.js|config\.js|sw\.js|manifest\.json)$/i.test(base)) return true;
      if (/^icon.*\.(svg|png)$/i.test(base)) return true;
      if (parts.length >= 2 && parts[parts.length - 2] === 'vendor' && base === 'supabase.js') return true;
      return false;
    } catch (e2) { return false; }
  }
  async function wipeDeviceStores() {
    var ref = projectRef();
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
      keys.forEach(function (k) { if (appDataKey(k, ref)) localStorage.removeItem(k); });
    } catch (e) {}
    try {
      var sk = [];
      for (var j = 0; j < sessionStorage.length; j++) sk.push(sessionStorage.key(j));
      sk.forEach(function (k) { if (appDataKey(k, ref)) sessionStorage.removeItem(k); });
    } catch (e) {}
    try {
      if (window.indexedDB && indexedDB.databases) {
        var dbs = await indexedDB.databases();
        await Promise.all((dbs || []).map(function (d) {
          if (!d || !d.name || !/zenflow|supabase|gotrue/i.test(d.name)) return Promise.resolve();
          return new Promise(function (res) {
            var req = indexedDB.deleteDatabase(d.name);
            req.onsuccess = req.onerror = req.onblocked = function () { res(); };
          });
        }));
      }
    } catch (e) {}
    try {
      if (window.caches) {
        var names = await caches.keys();
        await Promise.all(names.map(function (name) {
          if (name.indexOf('zenflow-') !== 0) return Promise.resolve();
          return caches.open(name).then(function (cache) {
            return cache.keys().then(function (reqs) {
              return Promise.all(reqs.map(function (req) {
                if (shellCacheRequest(req.url)) return Promise.resolve();
                return cache.delete(req);
              }));
            });
          });
        }));
      }
    } catch (e) {}
    try { localStorage.setItem(PULL_REMOTE_KEY, '1'); } catch (e) {}
  }
  function clearAuthFields() {
    ['loginEmail', 'loginPassword', 'regName', 'regHandle', 'regEmail', 'regPassword', 'regPassword2', 'regInvite', 'phoneName', 'phoneHandle', 'phoneInvite', 'phoneNational', 'phoneCode', 'phoneCcOther'].forEach(function (id) {
      var el = $(id); if (el) el.value = '';
    });
    ['loginMsg', 'regMsg', 'phoneMsg', 'phoneCodeMsg'].forEach(function (id) {
      var el = $(id); if (el) { el.textContent = ''; el.className = 'auth-msg'; }
    });
    ['inviteState', 'regHandleState', 'phoneHandleState', 'phoneInviteState', 'gateInviteState', 'gateHandleState'].forEach(function (id) {
      var el = $(id); if (el) { el.innerHTML = ''; el.className = 'invite-state'; }
    });
    phoneE164 = '';
    phoneRegData = null;
    phoneIntent = 'login';
    smsUntil = 0;
    var cc = $('phoneCc'); if (cc) cc.value = '86';
    var other = $('phoneCcOther'); if (other) other.classList.add('hidden');
  }
  function confirmLogout() {
    Z.openModal({
      title: '退出登录',
      ok: '退出登录',
      danger: true,
      html: '<p>退出后会清除这台设备上的数据，云端数据保留。</p>',
      onOk: function () { doLogout(); }
    });
  }
  async function doLogout(opts) {
    opts = opts || {};
    if (wipeLock && !opts.keepLock) return;
    wipeLock = true;
    suppressSignedOut = true;
    clearTimeout(pushTimer);
    clearTimeout(smsTimer);
    pending = false;
    replaceAllPending = false;
    var err = null;
    try {
      if (sb) {
        var signP = sb.auth.signOut().then(function (r) { return r; }, function (e) { return { error: e }; });
        var r = await Promise.race([
          signP,
          new Promise(function (resolve) { setTimeout(function () { resolve({ error: new Error('timeout') }); }, 4000); })
        ]);
        if (r && r.error) err = r.error;
      }
    } catch (e) { err = e; }
    session = null;
    profile = null;
    invites = null;
    profileReady = true;
    authReady = true;
    sync.status = 'off';
    sync.at = 0;
    sync.error = '';
    await wipeDeviceStores();
    if (Z.wipeLocal) Z.wipeLocal();
    clearAuthFields();
    setPhoneMode('login');
    setEmailMode('login');
    setChannel(phoneLoginEnabled() ? 'phone' : 'email');
    renderAccount();
    renderChrome();
    updateGate();
    wipeLock = false;
    Z.toast(opts.toast || (err ? '已退出本机' : '已退出'));
  }

  function exportStamp(d) {
    d = d || new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return String(d.getFullYear()) + p(d.getMonth() + 1) + p(d.getDate());
  }
  function downloadJson(obj, name) {
    var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }
  function themeSetting() {
    try {
      var t = localStorage.getItem('zenflow_theme');
      return t === 'light' || t === 'dark' ? t : 'system';
    } catch (e) { return 'system'; }
  }
  function profileExport() {
    var p = profile || {};
    return {
      display_name: p.display_name || '',
      handle: p.handle || '',
      avatar_url: p.avatar_url || '',
      created_at: p.created_at || null
    };
  }
  async function buildExport() {
    var local = Z.sanitize(Z.getState());
    var data = local;
    var source = 'local';
    var note = '';
    if (!sb || !user()) {
      note = '未登录，只有本机数据。';
    } else {
      try {
        var uid = user().id;
        var r = await sb.from('user_data').select('data,updated_at').eq('user_id', uid).maybeSingle();
        if (r.error) throw r.error;
        if (!profile) {
          var pr = await sb.from('profiles').select('display_name,handle,avatar_url,created_at').eq('id', uid).maybeSingle();
          if (!pr.error && pr.data) profile = pr.data;
        }
        var remote = r.data && r.data.data ? Z.sanitize(r.data.data) : null;
        var lastUid = null, pullRemote = false;
        try {
          lastUid = localStorage.getItem(LAST_UID_KEY);
          pullRemote = localStorage.getItem(PULL_REMOTE_KEY) === '1';
        } catch (e) {}
        var choice = chooseSync(local, remote, lastUid, uid, pullRemote, false);
        data = choice === 'remote' ? (remote || local) : choice === 'local' ? local : merge(local, remote);
        source = remote ? 'cloud+local' : 'local';
      } catch (e) {
        data = local;
        source = 'local';
        note = '未能读取云端，可能缺少只在云端的数据。';
      }
    }
    var out = {
      app: 'ZenFlow',
      exportedAt: new Date().toISOString(),
      source: source,
      profile: profileExport(),
      data: data,
      settings: { theme: themeSetting() }
    };
    if (note) out.note = note;
    return out;
  }
  async function exportAccountData() {
    var pack = await buildExport();
    downloadJson(pack, 'zenflow-export-' + exportStamp() + '.json');
    Z.toast(pack.note || '已导出');
  }
  async function removeMyAvatarFiles(uid) {
    try {
      var bucket = sb.storage.from('avatars');
      var offset = 0;
      var names = [];
      while (offset < 1000) {
        var listed = await bucket.list(uid, { limit: 100, offset: offset });
        if (!listed || listed.error) break;
        var batch = listed.data || [];
        batch.forEach(function (f) {
          if (f && f.name && f.id) names.push(uid + '/' + f.name);
        });
        if (batch.length < 100) break;
        offset += batch.length;
      }
      if (names.length) await bucket.remove(names);
    } catch (e) {}
  }
  function confirmDeleteAccount() {
    Z.openModal({
      title: '注销账号',
      ok: '继续',
      danger: true,
      html: '<p>会永久删除账号和全部云端数据，不能恢复。</p><button class="btn btn-ghost btn-block" type="button" id="btnExportBeforeDelete">先导出数据</button>',
      onOk: function () { setTimeout(confirmDeleteHandle, 0); }
    });
  }
  function confirmDeleteHandle() {
    var handle = (profile && profile.handle) || '';
    Z.openModal({
      title: '确认注销',
      ok: '注销',
      danger: true,
      html: '<p>输入你的 @ID。</p><input type="text" id="deleteHandleConfirm" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="@ID" />',
      onOk: function () {
        var typed = normalizeHandleInput($('deleteHandleConfirm') && $('deleteHandleConfirm').value);
        if (!handle || typed !== handle) { Z.toast('@ID 不正确'); return false; }
        deleteMyAccount();
      }
    });
  }
  async function deleteMyAccount() {
    if (wipeLock) return;
    if (!sb || !user()) { Z.toast('请先登录'); return; }
    wipeLock = true;
    suppressSignedOut = true;
    clearTimeout(pushTimer);
    pending = false;
    replaceAllPending = false;
    try {
      await removeMyAvatarFiles(user().id);
      var r = await sb.rpc('delete_my_account');
      if (r.error) throw r.error;
    } catch (err) {
      wipeLock = false;
      suppressSignedOut = false;
      Z.toast(cn(err));
      return;
    }
    await doLogout({ toast: '账号已注销', keepLock: true });
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
        confirmLogout();
        break;
      case 'btnExportAccount':
      case 'btnExportBeforeDelete':
        exportAccountData();
        break;
      case 'btnDeleteAccount':
        confirmDeleteAccount();
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
  $('authSeg').addEventListener('click', function (e) {
    var b = e.target.closest('.seg-btn');
    if (!b || !b.dataset.channel) return;
    setChannel(b.dataset.channel);
    msg('loginMsg', ''); msg('regMsg', ''); msg('phoneMsg', ''); msg('phoneCodeMsg', '');
  });
  if ($('emailSeg')) $('emailSeg').addEventListener('click', function (e) {
    var b = e.target.closest('.seg-btn');
    if (!b) return;
    setEmailMode(b.dataset.auth);
    msg('loginMsg', ''); msg('regMsg', '');
  });
  $('formLogin').addEventListener('submit', doLogin);
  $('formRegister').addEventListener('submit', doRegister);
  if ($('formPhone')) $('formPhone').addEventListener('submit', doSendSms);
  if ($('formPhoneCode')) $('formPhoneCode').addEventListener('submit', doVerifySms);
  if ($('btnResendSms')) $('btnResendSms').addEventListener('click', doSendSms);
  if ($('btnPhoneMode')) $('btnPhoneMode').addEventListener('click', function () {
    msg('phoneMsg', '');
    setPhoneMode(phoneMode === 'register' ? 'login' : 'register');
  });
  if ($('btnPhoneBack')) $('btnPhoneBack').addEventListener('click', function () {
    msg('phoneCodeMsg', '');
    setPhoneMode(phoneIntent === 'register' ? 'register' : 'login');
  });
  if ($('phoneCc')) $('phoneCc').addEventListener('change', function () {
    var other = $('phoneCcOther');
    if (!other) return;
    var on = this.value === 'other';
    other.classList.toggle('hidden', !on);
    if (on) other.focus();
  });
  ['phoneNational', 'phoneName', 'phoneCode', 'phoneCcOther'].forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', function () {
      if (id === 'phoneCode') msg('phoneCodeMsg', '');
      else msg('phoneMsg', '');
    });
  });
  $('formInviteGate').addEventListener('submit', doCompleteInvite);
  $('btnForgot').addEventListener('click', doForgot);
  watchCaptchaTheme();
  $('btnGateLogout').addEventListener('click', confirmLogout);
  $('regInvite').addEventListener('blur', checkInvite);
  $('regInvite').addEventListener('input', function () { this.value = this.value.toUpperCase(); $('inviteState').innerHTML = ''; $('inviteState').className = 'invite-state'; });
  if ($('phoneInvite')) {
    $('phoneInvite').addEventListener('blur', checkPhoneInvite);
    $('phoneInvite').addEventListener('input', function () { this.value = this.value.toUpperCase(); $('phoneInviteState').innerHTML = ''; $('phoneInviteState').className = 'invite-state'; msg('phoneMsg', ''); });
  }
  $('gateInvite').addEventListener('blur', checkGateInvite);
  $('gateInvite').addEventListener('input', function () { this.value = this.value.toUpperCase(); $('gateInviteState').innerHTML = ''; $('gateInviteState').className = 'invite-state'; });
  var regHandleCheck = bindHandleInput($('regHandle'), $('regHandleState'));
  var phoneHandleCheck = bindHandleInput($('phoneHandle'), $('phoneHandleState'));
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
    openAvatarCrop(file).catch(function (err) { Z.toast(cn(err)); }).then(function () { if (btn) busy(btn, false); });
  });
  if ($('cropCancel')) $('cropCancel').addEventListener('click', closeCrop);
  if ($('cropDone')) $('cropDone').addEventListener('click', function () {
    finishCrop().catch(function (err) { Z.toast(cn(err)); });
  });
  if ($('cropMask')) $('cropMask').addEventListener('click', function (e) { if (e.target === this) closeCrop(); });
  if ($('cropZoom')) $('cropZoom').addEventListener('input', function () {
    if (!cropOpen() || !crop.stage) return;
    var z = parseFloat(this.value);
    if (!isFinite(z)) return;
    zoomCropAround(z, crop.stage / 2, crop.stage / 2);
  });
  if ($('cropStage')) {
    var stage = $('cropStage');
    stage.addEventListener('pointerdown', function (e) {
      if (!cropOpen()) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      crop.pointers[e.pointerId] = cropPointerPos(e);
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      if (Object.keys(crop.pointers).length >= 2) beginPinch();
      e.preventDefault();
    });
    stage.addEventListener('pointermove', function (e) {
      if (!cropOpen() || !crop.pointers[e.pointerId]) return;
      var prev = crop.pointers[e.pointerId];
      var pos = cropPointerPos(e);
      crop.pointers[e.pointerId] = pos;
      if (Object.keys(crop.pointers).length >= 2) applyPinch();
      else {
        crop.x += pos.x - prev.x;
        crop.y += pos.y - prev.y;
        clampCrop();
        drawCrop();
      }
      e.preventDefault();
    });
    function endCropPointer(e) {
      if (!crop.pointers[e.pointerId]) return;
      delete crop.pointers[e.pointerId];
      crop.pinch = null;
      if (Object.keys(crop.pointers).length >= 2) beginPinch();
    }
    stage.addEventListener('pointerup', endCropPointer);
    stage.addEventListener('pointercancel', endCropPointer);
    stage.addEventListener('wheel', function (e) {
      if (!cropOpen() || !crop.stage) return;
      e.preventDefault();
      var rect = stage.getBoundingClientRect();
      var delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 16;
      else if (e.deltaMode === 2) delta *= stage.clientHeight;
      zoomCropAround(crop.zoom * Math.exp(-delta * 0.0016), e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });
    stage.addEventListener('touchmove', function (e) { if (cropOpen()) e.preventDefault(); }, { passive: false });
  }
  window.addEventListener('resize', function () {
    if (!cropOpen() || !crop.stage) return;
    var stageEl = $('cropStage');
    var S = stageEl ? stageEl.clientWidth : 0;
    if (!S || S === crop.stage) { drawCrop(); return; }
    var k = S / crop.stage;
    crop.x *= k;
    crop.y *= k;
    crop.stage = S;
    clampCrop();
    drawCrop();
  });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (name) {
    document.addEventListener(name, function (e) { if (cropOpen()) e.preventDefault(); }, { passive: false });
  });
  if ($('btnAvatarRemove')) $('btnAvatarRemove').addEventListener('click', function () {
    Z.openModal({
      title: '移除头像？', ok: '移除', danger: true,
      html: '<p>移除后显示首字母。</p>',
      onOk: function () { removeAvatar(); }
    });
  });

  /* ---------------- 启动 ---------------- */
  window.ZFCloud = {
    merge: merge, stable: stable, keyProblem: keyProblem, cn: cn,
    configured: function () { return configured; },
    userId: function () { return user() && user().id; },
    status: function () { return { configured: configured, loggedIn: !!user(), email: user() && user().email, phone: user() && user().phone, sync: sync.status, profile: profile, inviteOk: inviteOk(), gated: isGated(), authReady: authReady, profileReady: profileReady, gateMode: gateMode }; },
    onLocalChange: function (replaceAll) { if (!user() || needsInvite()) return; if (replaceAll) { replaceAllPending = true; schedulePush(200); } else schedulePush(); },
    syncNow: syncNow, openAuth: openAuth, client: function () { return sb; },
    refreshChrome: renderChrome,
    cropOpen: cropOpen,
    closeCrop: closeCrop
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
        if (wipeLock || suppressSignedOut) return;
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
        suppressSignedOut = false;
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
