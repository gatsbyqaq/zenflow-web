/* ZenFlow · 账号（Supabase Auth，邀请制注册）+ 云同步
 * - 未配置 Supabase（config.js 留空）时：只渲染"本机模式"说明，不加载任何云端代码，行为与以前完全一致。
 * - 已配置时：按需加载 vendor/supabase.js，提供登录 / 邀请码注册 / 找回密码 / 退出、个人资料、
 *   管理员生成邀请码，以及登录后的自动同步（拉取 → 合并 → 上传，最后写入者不会覆盖另一台设备的新增记录）。
 */
(function () {
  /* icons: ic('cloud-check') ic('cloud-off') ic('circle-alert') ic('refresh-cw') ic('loader-circle') ic('copy') ic('log-out') ic('plug') ic('circle-check') ic('ticket') ic('user-plus') ic('log-in') ic('pen-line') ic('shield') */
  'use strict';
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
  var sync = { status: 'off', at: +localStorage.getItem(LAST_SYNC_KEY) || 0, error: '' };
  var syncing = false, pending = false, pushTimer = null, replaceAllPending = false;
  var loadError = '';
  function appUrl() { return location.origin + location.pathname; }
  function user() { return session && session.user; }

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
  function merge(a, b) {
    a = Z.sanitize(a); b = Z.sanitize(b);
    var removed = { ids: mergeTomb(a.removed.ids, b.removed.ids), reasons: mergeTomb(a.removed.reasons, b.removed.reasons) };
    var checkins = {};
    [a.checkins, b.checkins].forEach(function (m) { Object.keys(m).forEach(function (k) { if (!checkins[k] || (m[k].ts || 0) > (checkins[k].ts || 0)) checkins[k] = m[k]; }); });
    function byId(x, y) {
      var map = {}, order = [];
      x.concat(y).forEach(function (r) { if (!(r.id in map)) order.push(r.id); if (!(r.id in map)) map[r.id] = r; });
      return order.filter(function (id) { return !(removed.ids[id] > 0); }).map(function (id) { return map[id]; }).sort(function (p, q) { return p.ts - q.ts; });
    }
    var reasons = [];
    a.reasons.concat(b.reasons).forEach(function (r) { if (reasons.indexOf(r) < 0 && !(removed.reasons[r] > 0)) reasons.push(r); });
    var takeA = a.streakStartSetAt > b.streakStartSetAt || (a.streakStartSetAt === b.streakStartSetAt && a.streakStart >= b.streakStart);
    return {
      version: 1,
      createdAt: Math.min(a.createdAt, b.createdAt),
      streakStart: takeA ? a.streakStart : b.streakStart,
      streakStartSetAt: Math.max(a.streakStartSetAt, b.streakStartSetAt),
      bestStreakMs: Math.max(a.bestStreakMs, b.bestStreakMs),
      checkins: checkins,
      relapses: byId(a.relapses, b.relapses),
      urges: byId(a.urges, b.urges),
      reasons: reasons,
      removed: removed
    };
  }

  /* ---------------- 加载 Supabase ---------------- */
  function loadLib() {
    return new Promise(function (res, rej) {
      if (window.supabase && window.supabase.createClient) return res();
      var s = document.createElement('script');
      s.src = 'vendor/supabase.js?v=10'; s.async = true;
      s.onload = function () { window.supabase && window.supabase.createClient ? res() : rej(new Error('Supabase 库加载异常')); };
      s.onerror = function () { rej(new Error('无法加载 Supabase 库（离线？）')); };
      document.head.appendChild(s);
    });
  }

  /* ---------------- 错误信息（中文） ---------------- */
  function cn(err) {
    var m = String((err && (err.message || err.error_description || err.msg)) || err || '');
    var code = err && (err.code || err.error_code) || '';
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
    if (!sb || !user()) return;
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
    pushTimer = setTimeout(function () {
  /* icons: ic('cloud-check') ic('cloud-off') ic('circle-alert') ic('refresh-cw') ic('loader-circle') ic('copy') ic('log-out') ic('plug') ic('circle-check') ic('ticket') ic('user-plus') ic('log-in') ic('pen-line') ic('shield') */ syncNow(); }, ms == null ? 1500 : ms);
  }

  /* ---------------- 顶部/侧边栏状态 ---------------- */
  function syncLabel() {
    if (!configured || !user()) return { icon: 'cloud-off', text: '本机模式', cls: '' };
    if (sync.status === 'syncing') return { icon: 'refresh-cw', text: '同步中', cls: 'busy' };
    if (sync.status === 'error') return { icon: 'circle-alert', text: '同步失败', cls: 'err' };
    if (sync.status === 'offline') return { icon: 'cloud-off', text: '离线', cls: 'err' };
    return { icon: 'cloud-check', text: '已同步', cls: 'ok' };
  }
  function renderChrome() {
    var L = syncLabel();
    var pill = $('syncPill');
    if (pill) { pill.className = 'sync-pill ' + L.cls; pill.innerHTML = ic(L.icon) + esc(L.text); }
    var logged = configured && user();
    var pp = document.querySelector('#screen-home .privacy-pill');
    if (pp) { pp.innerHTML = ic(logged ? 'cloud-check' : 'lock') + (logged ? '云同步' : '仅本机'); pp.title = logged ? '已登录，数据会同步到你的账号' : '所有数据只保存在本机浏览器中'; pp.classList.toggle('synced', !!logged); }
    var sn = document.querySelector('.side-note');
    if (sn) sn.innerHTML = ic(logged ? 'cloud-check' : 'lock') + (logged ? '已登录 · 云同步' : '仅本机 · 数据不上传');
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
        '<p class="small">登录后，打卡、记录和理由会自动同步到你的账号，换手机或在电脑上也能继续。<b>不登录也能使用全部功能</b>，数据只保存在本机。</p>' +
        '<div class="acct-actions"><button class="btn btn-primary" id="btnOpenLogin">' + ic('log-in') + '登录</button>' +
        '<button class="btn btn-ghost" id="btnOpenRegister">' + ic('ticket') + '邀请码注册</button></div>' +
        (cfg.source === 'local' ? '<p class="muted small acct-src">使用本机连接设置 · <button class="btn-link" id="btnCloudSetup">修改</button></p>' : '');
      return;
    }
    var name = (profile && profile.display_name) || (u.email || '').split('@')[0];
    var h = '<div class="acct-head"><span class="avatar">' + esc((name || '?').slice(0, 1).toUpperCase()) + '</span><div class="acct-id"><b id="acctName">' + esc(name) + '</b>' +
      (profile && profile.is_admin ? '<span class="admin-tag">管理员</span>' : '') + '<span class="muted small" id="acctEmail">' + esc(u.email || '') + '</span></div>' +
      '<button class="icon-btn" id="btnEditName" aria-label="修改昵称" title="修改昵称">' + ic('pen-line') + '</button></div>' +
      '<div class="acct-sync" id="acctSync">' + syncLine() + '</div>' +
      '<div class="acct-actions"><button class="btn btn-ghost" id="btnSyncNow">' + ic('refresh-cw') + '立即同步</button>' +
      '<button class="btn btn-danger" id="btnLogout">' + ic('log-out') + '退出登录</button></div>';
    if (profile && profile.is_admin) {
      h += '<div class="invite-admin"><div class="card-title"><h3>' + ic('layout-dashboard', 'h-ic tint-amber') + '管理后台</h3></div>' +
        '<p class="muted small">查看用户、邀请码与活跃概览。也可在地址栏打开 <code>#admin</code>。</p>' +
        '<div class="acct-actions"><button class="btn btn-primary" id="btnOpenAdmin">' + ic('layout-dashboard') + '打开管理后台</button></div>' +
        '<div class="card-title" style="margin-top:14px"><h3>' + ic('ticket', 'h-ic tint-amber') + '快捷邀请码</h3>' +
        '<button class="btn btn-ghost btn-sm" id="btnNewInvites">' + ic('ticket') + '生成 3 个</button></div>' +
        '<div id="inviteList">' + inviteListHtml() + '</div><p class="muted small">新邀请码 30 天内有效；完整管理请用管理后台。</p></div>';
    }
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
    profile = null; invites = null;
    if (!user()) return;
    var r = await sb.from('profiles').select('display_name,is_admin,created_at').eq('id', user().id).maybeSingle();
    if (!r.error) profile = r.data;
    renderAccount();
    if (profile && profile.is_admin) loadInvites();
    if (window.ZFAdmin && window.ZFAdmin.onProfile) window.ZFAdmin.onProfile();
  }
  async function loadInvites() {
    var r = await sb.from('invites').select('code,used_at,expires_at,note,created_at').order('created_at', { ascending: false }).limit(30);
    invites = r.error ? [] : r.data;
    var el = $('inviteList'); if (el) el.innerHTML = inviteListHtml();
  }

  /* ---------------- 登录 / 注册面板 ---------------- */
  var authMode = 'login';
  function openAuth(mode) {
    if (!configured) { openSetup(); return; }
    setAuthMode(mode || 'login');
    $('loginMsg').textContent = ''; $('regMsg').textContent = '';
    $('authMask').classList.remove('hidden');
    Z.lockScroll();
    setTimeout(function () {
  /* icons: ic('cloud-check') ic('cloud-off') ic('circle-alert') ic('refresh-cw') ic('loader-circle') ic('copy') ic('log-out') ic('plug') ic('circle-check') ic('ticket') ic('user-plus') ic('log-in') ic('pen-line') ic('shield') */ (mode === 'register' ? $('regInvite') : $('loginEmail')).focus(); }, 60);
  }
  function closeAuth() {
    if ($('authMask').classList.contains('hidden')) return;
    $('authMask').classList.add('hidden');
    Z.unlockScroll();
  }
  function setAuthMode(m) {
    authMode = m;
    document.querySelectorAll('#authSeg .seg-btn').forEach(function (b) { var on = b.dataset.auth === m; b.classList.toggle('active', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
    $('formLogin').classList.toggle('hidden', m !== 'login');
    $('formRegister').classList.toggle('hidden', m !== 'register');
    $('authTitle').textContent = m === 'login' ? '登录 ZenFlow' : '用邀请码注册';
    $('authSub').textContent = m === 'login' ? '登录后可在手机和电脑之间同步数据。不登录也能使用全部功能。' : '注册需要一个有效的邀请码。注册成功后，本机已有的数据会自动同步到新账号。';
  }
  function msg(id, text, ok) { var el = $(id); el.textContent = text || ''; el.classList.toggle('ok', !!ok); }
  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = ic('loader-circle', 'spin') + label; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  function normInvite(v) { return String(v || '').replace(/\s+/g, '').toUpperCase(); }

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
      closeAuth(); Z.toast('登录成功，正在同步');
    } catch (err) { msg('loginMsg', cn(err)); }
    finally { busy(btn, false); }
  }
  async function doRegister(e) {
    e.preventDefault();
    var code = normInvite($('regInvite').value), name = $('regName').value.trim(), email = $('regEmail').value.trim();
    var pw = $('regPassword').value, pw2 = $('regPassword2').value;
    if (!code) return msg('regMsg', '请输入邀请码');
    if (!EMAIL_RE.test(email)) return msg('regMsg', '请输入有效的邮箱');
    if (pw.length < 8) return msg('regMsg', '密码至少 8 位');
    if (pw !== pw2) return msg('regMsg', '两次输入的密码不一致');
    var btn = $('btnRegister'); busy(btn, true, '注册中…'); msg('regMsg', '');
    try {
      var valid = await checkInvite();
      if (valid === false) throw new Error('INVITE_INVALID');
      var r = await sb.auth.signUp({ email: email, password: pw, options: { data: { invite_code: code, display_name: name || null }, emailRedirectTo: appUrl() } });
      if (r.error) throw r.error;
      $('regPassword').value = ''; $('regPassword2').value = '';
      if (r.data && r.data.session) { closeAuth(); Z.toast('注册成功，欢迎加入'); }
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
      case 'btnEditName':
        Z.openModal({
          title: '修改昵称', ok: '保存',
          html: '<input type="text" id="nameInput" maxlength="20" value="' + esc((profile && profile.display_name) || '') + '" placeholder="昵称" />',
          onOk: function () {
            var v = $('nameInput').value.trim();
            sb.from('profiles').update({ display_name: v || null }).eq('id', user().id).then(function (r) {
              if (r.error) return Z.toast(cn(r.error));
              profile = Object.assign({}, profile, { display_name: v || null }); renderAccount(); Z.toast('昵称已更新');
            });
          }
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
  /* icons: ic('cloud-check') ic('cloud-off') ic('circle-alert') ic('refresh-cw') ic('loader-circle') ic('copy') ic('log-out') ic('plug') ic('circle-check') ic('ticket') ic('user-plus') ic('log-in') ic('pen-line') ic('shield') */ Z.toast('已复制 ' + code); }, function () { Z.toast('邀请码：' + code); });
    }
  });
  $('authClose').addEventListener('click', closeAuth);
  $('authMask').addEventListener('click', function (e) { if (e.target === this) closeAuth(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('authMask').classList.contains('hidden') && $('modalMask').classList.contains('hidden')) closeAuth(); });
  $('authSeg').addEventListener('click', function (e) { var b = e.target.closest('.seg-btn'); if (b) { setAuthMode(b.dataset.auth); msg('loginMsg', ''); msg('regMsg', ''); } });
  $('formLogin').addEventListener('submit', doLogin);
  $('formRegister').addEventListener('submit', doRegister);
  $('btnForgot').addEventListener('click', doForgot);
  $('regInvite').addEventListener('blur', checkInvite);
  $('regInvite').addEventListener('input', function () { this.value = this.value.toUpperCase(); $('inviteState').innerHTML = ''; $('inviteState').className = 'invite-state'; });

  /* ---------------- 启动 ---------------- */
  window.ZFCloud = {
    merge: merge, stable: stable, keyProblem: keyProblem, cn: cn,
    configured: function () { return configured; },
    userId: function () { return user() && user().id; },
    status: function () { return { configured: configured, loggedIn: !!user(), email: user() && user().email, sync: sync.status, profile: profile }; },
    onLocalChange: function (replaceAll) { if (!user()) return; if (replaceAll) { replaceAllPending = true; schedulePush(200); } else schedulePush(); },
    syncNow: syncNow, openAuth: openAuth, client: function () { return sb; }
  };
  renderChrome(); renderAccount();
  if (!configured) return;

  loadLib().then(function () {
  /* icons: ic('cloud-check') ic('cloud-off') ic('circle-alert') ic('refresh-cw') ic('loader-circle') ic('copy') ic('log-out') ic('plug') ic('circle-check') ic('ticket') ic('user-plus') ic('log-in') ic('pen-line') ic('shield') */
    sb = window.supabase.createClient(cfg.url, cfg.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'zenflow_auth', flowType: 'implicit' }
    });
    sb.auth.onAuthStateChange(function (event, s) {
      var prev = user() && user().id;
      session = s;
      if (event === 'PASSWORD_RECOVERY') setTimeout(promptNewPassword, 300);
      if (event === 'SIGNED_OUT' || !s) { profile = null; invites = null; setSync('off'); renderAccount(); Z.toast && event === 'SIGNED_OUT' && Z.toast('已退出登录，数据仍保留在本机'); return; }
      if (prev !== s.user.id || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        renderAccount();
        // 回调里不能直接 await Supabase 请求（会与 auth 锁死锁），放到下一轮
        setTimeout(function () {
  /* icons: ic('cloud-check') ic('cloud-off') ic('circle-alert') ic('refresh-cw') ic('loader-circle') ic('copy') ic('log-out') ic('plug') ic('circle-check') ic('ticket') ic('user-plus') ic('log-in') ic('pen-line') ic('shield') */ loadProfile(); syncNow(); }, 0);
      }
    });
    sb.auth.getSession().then(function (r) { if (!r.data.session) renderAccount(); });
    window.addEventListener('online', function () { if (user()) syncNow(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && user() && Date.now() - sync.at > 60000) syncNow(); });
    setInterval(function () {
  /* icons: ic('cloud-check') ic('cloud-off') ic('circle-alert') ic('refresh-cw') ic('loader-circle') ic('copy') ic('log-out') ic('plug') ic('circle-check') ic('ticket') ic('user-plus') ic('log-in') ic('pen-line') ic('shield') */ if (user() && sync.status === 'error') syncNow(); }, 60000);
  }).catch(function (e) { loadError = e.message; renderAccount(); });
})();
