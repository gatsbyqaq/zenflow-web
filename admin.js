/* ZenFlow · 管理后台（仅 profiles.is_admin）
 * 入口：设置 → 打开管理后台，或 #admin / ?admin=1
 * 数据全部走 SECURITY DEFINER RPC，不直接查询 auth.users。
 */
(function () {
  'use strict';
  var Z = window.ZenFlowCore;
  if (!Z) return;
  var $ = function (id) { return document.getElementById(id); };
  var esc = Z.esc, ic = Z.ic;
  var root = $('adminRoot');
  if (!root) return;

  var panel = 'overview';
  var cache = { stats: null, users: null, invites: null };
  var loading = false;
  var open = false;

  function cloud() { return window.ZFCloud; }
  function sb() { return cloud() && cloud().client && cloud().client(); }
  function me() { return cloud() && cloud().status && cloud().status(); }
  function cn(err) {
    if (cloud() && cloud().cn) return cloud().cn(err);
    var m = String((err && (err.message || err.error_description)) || err || '');
    if (/NOT_ADMIN/.test(m)) return '只有管理员可以访问管理后台';
    if (/CANNOT_DEMOTE_SELF/.test(m)) return '不能取消自己的管理员身份';
    if (/CANNOT_BAN_SELF/.test(m)) return '不能禁用自己的账号';
    if (/REVOKE_FAILED/.test(m)) return '邀请码不存在或已被使用，无法作废';
    if (/USER_NOT_FOUND/.test(m)) return '找不到该用户';
    return m || '操作失败';
  }
  function toast(t) { Z.toast(t); }
  function fmtDT(iso) {
    if (!iso) return '—';
    var d = new Date(iso); if (isNaN(+d)) return '—';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function setHash(on) {
    try {
      if (on) {
        if (location.hash !== '#admin') history.replaceState(null, '', location.pathname + location.search + '#admin');
      } else if (location.hash === '#admin') {
        history.replaceState(null, '', location.pathname + location.search + (location.search ? '' : '') || location.pathname);
        // clean trailing bare path
        if (!location.search) history.replaceState(null, '', location.pathname);
      }
    } catch (e) {}
  }
  function wantsAdmin() {
    try {
      if (location.hash === '#admin') return true;
      var q = new URLSearchParams(location.search);
      return q.get('admin') === '1' || q.get('admin') === 'true';
    } catch (e) { return location.hash === '#admin'; }
  }

  function showDenied() {
    toast('只有管理员可以打开管理后台');
    setHash(false);
    // strip ?admin=
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('admin')) { u.searchParams.delete('admin'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
    } catch (e) {}
  }

  function openAdmin(force) {
    var st = me();
    if (!st || !st.configured) { toast('尚未连接云端'); return; }
    if (!st.loggedIn) { toast('请先登录'); if (cloud().openAuth) cloud().openAuth('login'); return; }
    if (st.gated || (st.inviteOk === false)) { toast('请先完成登录与邀请码'); return; }
    if (!st.profile || !st.profile.is_admin) { showDenied(); return; }
    if (!sb()) { toast('云端尚未就绪，请稍后再试'); return; }
    open = true;
    root.classList.remove('hidden');
    root.removeAttribute('hidden');
    document.body.classList.add('admin-open');
    setHash(true);
    $('adminSub').textContent = (st.email || '管理员') + ' · 数据来自 Supabase RPC';
    switchPanel(panel);
    refresh(force !== false);
  }
  function closeAdmin() {
    if (!open) return;
    open = false;
    root.classList.add('hidden');
    root.setAttribute('hidden', '');
    document.body.classList.remove('admin-open');
    setHash(false);
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('admin')) { u.searchParams.delete('admin'); history.replaceState(null, '', u.pathname + (u.searchParams.toString() ? '?' + u.searchParams : '') + u.hash); }
    } catch (e) {}
  }

  function switchPanel(name) {
    panel = name;
    document.querySelectorAll('#adminNav .admin-tab').forEach(function (b) { b.classList.toggle('active', b.dataset.admin === name); });
    document.querySelectorAll('.admin-panel').forEach(function (p) { p.classList.toggle('active', p.dataset.adminPanel === name); });
    renderPanel(name);
  }

  async function refresh(force) {
    if (!open || !sb()) return;
    if (loading) return;
    loading = true;
    var btn = $('adminRefresh');
    if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
    try {
      if (force || !cache.stats) {
        var s = await sb().rpc('admin_stats');
        if (s.error) throw s.error;
        cache.stats = s.data;
      }
      if (panel === 'users' && (force || !cache.users)) {
        var u = await sb().rpc('admin_list_users');
        if (u.error) throw u.error;
        cache.users = u.data || [];
      }
      if (panel === 'invites' && (force || !cache.invites)) {
        var i = await sb().rpc('admin_list_invites');
        if (i.error) throw i.error;
        cache.invites = i.data || [];
      }
      if (panel === 'overview' && (force || !cache.users)) {
        // overview shows recent from stats; no need for full users
      }
      renderPanel(panel);
    } catch (e) {
      console.warn(e);
      var msg = cn(e);
      if (/NOT_ADMIN|42501/.test(String(e && e.message)) || /只有管理员/.test(msg)) {
        closeAdmin(); showDenied();
      } else {
        toast(msg);
        var el = panelEl(panel);
        if (el) el.innerHTML = '<div class="admin-error">' + esc(msg) + '</div>';
      }
    } finally {
      loading = false;
      if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
    }
  }

  function panelEl(name) {
    return document.querySelector('.admin-panel[data-admin-panel="' + name + '"]');
  }

  function renderPanel(name) {
    if (name === 'overview') renderOverview();
    else if (name === 'users') renderUsers();
    else if (name === 'invites') renderInvites();
    else if (name === 'maintenance') renderMaint();
  }

  function renderOverview() {
    var el = $('adminOverview'); if (!el) return;
    var s = cache.stats;
    if (!s) { el.innerHTML = '<p class="admin-empty">加载中…</p>'; return; }
    var cards = [
      ['用户总数', s.users_total, ''],
      ['今日活跃', s.active_today, 'ok'],
      ['可用邀请码', s.invites_unused, 'amber'],
      ['已使用邀请码', s.invites_used, ''],
      ['管理员', s.admins_total, ''],
      ['已禁用', s.banned_total, s.banned_total ? 'warn' : ''],
      ['过期邀请码', s.invites_expired, s.invites_expired ? 'warn' : ''],
      ['邀请码总数', s.invites_total, '']
    ];
    var h = '<div class="admin-grid">' + cards.map(function (c) {
      return '<div class="admin-stat ' + c[2] + '"><div class="k">' + esc(c[0]) + '</div><div class="v">' + esc(String(c[1] == null ? '—' : c[1])) + '</div></div>';
    }).join('') + '</div>';
    h += '<div class="admin-card"><h2>' + ic('users') + '最近注册</h2>';
    var recent = s.recent_signups || [];
    if (!recent.length) h += '<p class="admin-empty">还没有用户</p>';
    else {
      h += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>邮箱</th><th>昵称</th><th>状态</th><th>注册时间</th></tr></thead><tbody>';
      recent.forEach(function (u) {
        h += '<tr><td class="mono">' + esc(u.email || '—') + '</td><td>' + esc(u.display_name || '—') + '</td><td>' +
          (u.is_admin ? '<span class="pill-tag admin">管理员</span> ' : '') +
          (u.is_banned ? '<span class="pill-tag banned">已禁用</span>' : '<span class="pill-tag ok">正常</span>') +
          '</td><td>' + esc(fmtDT(u.created_at)) + '</td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '<p class="muted small" style="margin-top:10px">「今日活跃」按 user_data.updated_at 是否落在今天（服务器时区）估算，未同步过的用户不计。</p></div>';
    el.innerHTML = h;
  }

  function renderUsers() {
    var el = $('adminUsers'); if (!el) return;
    if (!cache.users) { el.innerHTML = '<p class="admin-empty">加载中…</p>'; refresh(false); return; }
    var myId = me() && me().profile && null; // filled below
    var st = me();
    var selfId = st && cloud().userId ? cloud().userId() : null;
    var q = (el.querySelector('#adminUserQ') && el.querySelector('#adminUserQ').value || '').trim().toLowerCase();
    var rows = cache.users.filter(function (u) {
      if (!q) return true;
      return (u.email || '').toLowerCase().indexOf(q) >= 0 || (u.display_name || '').toLowerCase().indexOf(q) >= 0;
    });
    var h = '<div class="admin-card"><div class="admin-toolbar">' +
      '<input class="grow" type="search" id="adminUserQ" placeholder="搜索邮箱 / 昵称" value="' + esc(q) + '" />' +
      '<button class="btn btn-ghost btn-sm" type="button" id="adminUsersReload">' + ic('refresh-cw') + '刷新</button></div>';
    if (!rows.length) h += '<p class="admin-empty">没有匹配的用户</p>';
    else {
      h += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>用户</th><th>角色</th><th>注册 / 同步</th><th>操作</th></tr></thead><tbody>';
      rows.forEach(function (u) {
        var isSelf = selfId && u.id === selfId;
        h += '<tr><td><div><b>' + esc(u.display_name || (u.email || '').split('@')[0] || '用户') + '</b>' +
          (isSelf ? ' <span class="muted small">（我）</span>' : '') +
          '</div><div class="mono muted">' + esc(u.email || '—') + '</div></td><td>' +
          (u.is_admin ? '<span class="pill-tag admin">管理员</span> ' : '<span class="pill-tag muted">用户</span> ') +
          (u.is_banned ? '<span class="pill-tag banned">已禁用</span>' : '') +
          '</td><td><div class="small">' + esc(fmtDT(u.created_at)) + '</div><div class="muted small">同步 ' + esc(fmtDT(u.last_sync_at)) + '</div>' +
          '<div class="muted small">登录 ' + esc(fmtDT(u.last_sign_in_at)) + '</div></td><td><div class="admin-actions">';
        if (!isSelf) {
          h += '<button class="btn btn-ghost btn-sm" type="button" data-admin-act="toggle-admin" data-id="' + esc(u.id) + '" data-on="' + (u.is_admin ? '0' : '1') + '">' +
            (u.is_admin ? '取消管理员' : '设为管理员') + '</button>';
          h += '<button class="btn ' + (u.is_banned ? 'btn-ghost' : 'btn-danger') + ' btn-sm" type="button" data-admin-act="toggle-ban" data-id="' + esc(u.id) + '" data-on="' + (u.is_banned ? '0' : '1') + '">' +
            (u.is_banned ? '解除禁用' : '禁用登录') + '</button>';
        } else {
          h += '<span class="muted small">不能修改自己的管理员 / 禁用状态</span>';
        }
        h += '</div></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '<p class="muted small" style="margin-top:10px">禁用会写入 auth.users.banned_until，对方将无法再登录；本机已缓存的会话可能仍短暂有效，直到 token 过期。</p></div>';
    el.innerHTML = h;
  }

  function renderInvites() {
    var el = $('adminInvites'); if (!el) return;
    if (!cache.invites) { el.innerHTML = '<p class="admin-empty">加载中…</p>'; refresh(false); return; }
    var filter = (el.querySelector('#adminInvFilter') && el.querySelector('#adminInvFilter').value) || 'all';
    var rows = cache.invites.filter(function (i) { return filter === 'all' || i.status === filter; });
    var h = '<div class="admin-card"><div class="admin-toolbar">' +
      '<select id="adminInvFilter" aria-label="筛选">' +
      [['all', '全部'], ['unused', '可用'], ['used', '已使用'], ['expired', '已过期']].map(function (o) {
        return '<option value="' + o[0] + '"' + (filter === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select>' +
      '<button class="btn btn-primary btn-sm" type="button" id="adminCreateInvites">' + ic('ticket') + '生成 5 个（30 天）</button>' +
      '<button class="btn btn-ghost btn-sm" type="button" id="adminCreateInvitesForever">' + ic('ticket') + '生成 3 个（永不过期）</button>' +
      '</div>';
    if (!rows.length) h += '<p class="admin-empty">没有邀请码</p>';
    else {
      h += '<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>邀请码</th><th>状态</th><th>使用者</th><th>过期</th><th>操作</th></tr></thead><tbody>';
      rows.forEach(function (i) {
        var st = i.status === 'unused' ? '<span class="pill-tag ok">可用</span>' : i.status === 'used' ? '<span class="pill-tag muted">已使用</span>' : '<span class="pill-tag banned">已过期</span>';
        h += '<tr><td class="mono"><b>' + esc(i.code) + '</b>' + (i.note ? '<div class="muted small">' + esc(i.note) + '</div>' : '') +
          '<div class="muted small">创建于 ' + esc(fmtDT(i.created_at)) + (i.created_by_email ? ' · ' + esc(i.created_by_email) : '') + '</div></td><td>' + st + '</td><td>' +
          (i.used_by_email ? '<div class="mono">' + esc(i.used_by_email) + '</div><div class="muted small">' + esc(fmtDT(i.used_at)) + '</div>' : '—') +
          '</td><td>' + esc(i.expires_at ? fmtDT(i.expires_at) : '永不过期') + '</td><td><div class="admin-actions">' +
          (i.status === 'unused' ? '<button class="btn btn-ghost btn-sm" type="button" data-copy="' + esc(i.code) + '">' + ic('copy') + '复制</button>' +
            '<button class="btn btn-danger btn-sm" type="button" data-admin-act="revoke" data-code="' + esc(i.code) + '">作废</button>' : '') +
          '</div></td></tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    el.innerHTML = h;
  }

  function renderMaint() {
    var el = $('adminMaint'); if (!el) return;
    var st = me() || {};
    var ver = (window.ZenFlow && window.ZenFlow.version) || '?';
    var cssV = (getComputedStyle(document.documentElement).getPropertyValue('--zf-css') || '').replace(/["'\s]/g, '');
    el.innerHTML =
      '<div class="admin-card"><h2>' + ic('wrench') + '维护说明</h2>' +
      '<p class="admin-note">管理后台不会在这里执行任何不可逆的批量删除。如需清理测试数据，请到 Supabase 控制台的 Table Editor / SQL Editor 操作，并先导出备份。</p>' +
      '<p class="admin-note"><b>建议的安全流程：</b></p>' +
      '<ul class="admin-note"><li>重要变更前让用户在「设置 → 导出数据」下载 JSON 备份。</li>' +
      '<li>作废未使用的邀请码用「邀请码」页的作废按钮即可。</li>' +
      '<li>禁用账号使用「用户」页的「禁用登录」（写入 <code>auth.users.banned_until</code>）。</li>' +
      '<li>本页面不会提供“清空所有用户数据”一类危险操作。</li></ul></div>' +
      '<div class="admin-card"><h2>' + ic('info') + '环境信息</h2>' +
      '<p class="admin-note">应用版本 <b>v' + esc(ver) + '</b> · 样式 <b>v' + esc(cssV || '?') + '</b></p>' +
      '<p class="admin-note">当前管理员 <code>' + esc(st.email || '—') + '</code></p>' +
      '<p class="admin-note">Supabase 项目 <code>ordgebjytixmbwabpsrj</code></p>' +
      '<p class="admin-note">入口：设置 → 打开管理后台，或地址栏 <code>#admin</code> / <code>?admin=1</code>（非管理员会被拒绝）。</p>' +
      '<div class="admin-toolbar" style="margin-top:12px">' +
      '<button class="btn btn-ghost" type="button" id="adminGotoExport">' + ic('download') + '去设置导出数据</button>' +
      '<button class="btn btn-primary" type="button" id="adminClose2">' + ic('arrow-left') + '返回应用</button>' +
      '</div></div>';
  }

  /* ---- actions ---- */
  function confirmAct(title, html, onOk) {
    Z.openModal({
      title: title, html: '<p>' + html + '</p>', ok: '确认',
      danger: /禁用|作废|取消管理员/.test(title),
      onOk: function () { setTimeout(function () { Promise.resolve(onOk()).catch(function (e) { toast(cn(e)); }); }, 0); }
    });
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('button, [data-copy]'); if (!t) return;
    if (t.id === 'adminBack' || t.id === 'adminClose2') { closeAdmin(); return; }
    if (t.id === 'adminRefresh') { cache = { stats: null, users: null, invites: null }; refresh(true); return; }
    if (t.id === 'adminUsersReload') { cache.users = null; refresh(true); return; }
    if (t.id === 'adminGotoExport') { closeAdmin(); if (window.ZenFlow && window.ZenFlow.go) window.ZenFlow.go('settings'); return; }
    if (t.id === 'adminCreateInvites' || t.id === 'adminCreateInvitesForever') {
      var forever = t.id === 'adminCreateInvitesForever';
      var count = forever ? 3 : 5, days = forever ? 0 : 30;
      t.disabled = true;
      sb().rpc('create_invites', { p_count: count, p_days: days, p_note: forever ? '管理后台·永不过期' : '管理后台' }).then(function (r) {
        t.disabled = false;
        if (r.error) return toast(cn(r.error));
        toast('已生成 ' + (r.data && r.data.length) + ' 个邀请码');
        cache.invites = null; cache.stats = null; refresh(true);
      });
      return;
    }
    if (t.dataset.copy) {
      var code = t.dataset.copy;
      (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () { toast('已复制 ' + code); }, function () { toast(code); });
      return;
    }
    var act = t.dataset.adminAct;
    if (!act) return;
    if (act === 'revoke') {
      var c = t.dataset.code;
      confirmAct('作废邀请码？', '确认作废 <code>' + esc(c) + '</code>？此操作不可恢复（已被使用的邀请码无法作废）。', function () {
        return sb().rpc('admin_revoke_invite', { p_code: c }).then(function (r) {
          if (r.error) throw r.error;
          toast('已作废'); cache.invites = null; cache.stats = null; refresh(true);
        });
      });
      return;
    }
    if (act === 'toggle-admin') {
      var id = t.dataset.id, on = t.dataset.on === '1';
      confirmAct(on ? '设为管理员？' : '取消管理员？', on ? '对方将可以打开管理后台、生成邀请码。' : '对方将失去管理后台访问权限。不能取消自己的管理员身份。', function () {
        return sb().rpc('admin_set_admin', { p_user: id, p_admin: on }).then(function (r) {
          if (r.error) throw r.error;
          toast(on ? '已设为管理员' : '已取消管理员'); cache.users = null; cache.stats = null; refresh(true);
        });
      });
      return;
    }
    if (act === 'toggle-ban') {
      var uid = t.dataset.id, ban = t.dataset.on === '1';
      confirmAct(ban ? '禁用该账号登录？' : '解除禁用？', ban ? '对方将无法再登录（banned_until = infinity）。不能禁用自己。' : '对方可以重新登录。', function () {
        return sb().rpc('admin_set_banned', { p_user: uid, p_banned: ban }).then(function (r) {
          if (r.error) throw r.error;
          toast(ban ? '已禁用' : '已解除禁用'); cache.users = null; cache.stats = null; refresh(true);
        });
      });
    }
  });

  root.addEventListener('input', function (e) {
    if (e.target.id === 'adminUserQ') renderUsers();
  });
  root.addEventListener('change', function (e) {
    if (e.target.id === 'adminInvFilter') renderInvites();
  });
  $('adminNav').addEventListener('click', function (e) {
    var b = e.target.closest('.admin-tab'); if (!b) return;
    switchPanel(b.dataset.admin);
    if ((b.dataset.admin === 'users' && !cache.users) || (b.dataset.admin === 'invites' && !cache.invites) || (b.dataset.admin === 'overview' && !cache.stats)) refresh(false);
  });

  document.addEventListener('keydown', function (e) {
    if (!open) return;
    if (e.key === 'Escape') {
      var modalOpen = !$('modalMask').classList.contains('hidden');
      if (!modalOpen) { e.preventDefault(); closeAdmin(); }
    }
  });

  function tryAutoOpen() {
    if (!wantsAdmin()) return;
    // wait until cloud profile is known
    var tries = 0;
    (function wait() {
      tries++;
      var st = me();
      if (!st || !st.configured) { if (tries < 40) return setTimeout(wait, 150); return; }
      if (!st.loggedIn) { if (tries < 40) return setTimeout(wait, 150); showDenied(); return; }
      if (!st.profile) { if (tries < 50) return setTimeout(wait, 150); showDenied(); return; }
      if (st.profile.is_admin) openAdmin(true); else showDenied();
    })();
  }

  window.ZFAdmin = {
    open: function () { openAdmin(true); },
    close: closeAdmin,
    isOpen: function () { return open; },
    onProfile: function () { if (wantsAdmin()) tryAutoOpen(); }
  };

  // spinning refresh icon
  var style = document.createElement('style');
  style.textContent = '#adminRefresh.spinning .ic{animation:spin 1s linear infinite}';
  document.head.appendChild(style);

  window.addEventListener('hashchange', function () {
    if (location.hash === '#admin') tryAutoOpen();
    else if (open && location.hash !== '#admin') closeAdmin();
  });
  tryAutoOpen();
})();
