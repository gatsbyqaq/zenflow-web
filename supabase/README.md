# ZenFlow · Supabase 接入指南

ZenFlow 网页本身是静态托管的（GitHub Pages），**账号 / 邀请码 / 云同步**由你自己的 [Supabase](https://supabase.com) 项目提供。仓库里**没有**任何密钥。

本机检查过：`gatsbyqaq/ZenFlow`（SwiftUI）的 `worktree-zenflow-supabase` 分支实际用的是 Apple 登录 + 本地邮箱密码（Keychain），**没有**现成的 Supabase 项目 URL 或 schema 可复用，所以这里是一套新的、独立的网页端方案。

## 一次配置（大约 10 分钟）

### 1. 创建项目

1. 打开 https://supabase.com → 新建项目（免费计划足够）
2. 选一个区域（推荐靠近你的，例如 `Northeast Asia (Tokyo)`）
3. 记下数据库密码（只用于控制台，网页用不到）

### 2. 跑 SQL

打开 **SQL Editor** → New query → 把 [`schema.sql`](schema.sql) 全文粘进去 → Run。

然后（可选）生成几枚邀请码：粘贴 [`seed_invites.sql`](seed_invites.sql) → Run，把结果表格里的 `code` 抄下来。

### 3. 打开邮箱密码注册

**Authentication → Providers → Email**：

| 设置 | 推荐值 | 说明 |
|---|---|---|
| Enable Email provider | 开 | |
| Confirm email | 可先关掉 | 关掉后注册立刻登录，方便自测；上线后建议打开 |
| Secure email change | 开 | |
| Minimum password length | 8 | |

**Authentication → URL Configuration**：

| 字段 | 值 |
|---|---|
| Site URL | `https://gatsbyqaq.github.io/zenflow-web/` |
| Redirect URLs | 再加上 `http://localhost:8765/`（本地调试）和 `http://127.0.0.1:8765/` |

找回密码 / 邮箱确认邮件会跳回这里。

### 4. 把公开密钥写进网页

**Project Settings → API**：

- **Project URL** → 填到 [`../config.js`](../config.js) 的 `supabaseUrl`
- **anon public** / **Publishable** key → 填到 `supabaseAnonKey`

```js
window.ZENFLOW_CONFIG = {
  supabaseUrl: 'https://xxxxxxxx.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIs...'   // 或 sb_publishable_...
};
```

这两个值**本来就是给前端用的公开值**，可以提交到仓库。数据安全靠数据库的行级安全（RLS）。

⚠️ **绝对不要**把 `service_role` / `sb_secret_…` 写进网页或仓库 —— 网页代码会拒绝使用它们。

填好后提交并推送到 `main` + `gh-pages`，或在网页里临时用「设置 → 账号与同步 → 填写连接信息」（只保存在本机）。

### 5. 把第一个账号设为管理员

用其中一枚邀请码在网页上注册，然后在 SQL Editor 运行：

```sql
update public.profiles set is_admin = true
 where id = (select id from auth.users where email = '你的邮箱@example.com');
```

刷新网页后，「设置 → 账号与同步」会出现「生成邀请码」按钮。之后就不用再回 SQL Editor 了。

## 网页行为

| 状态 | 行为 |
|---|---|
| `config.js` 留空 | 纯本机模式，和以前完全一样；不加载 Supabase 库 |
| 已配置、未登录 | 全部功能可用；设置页可登录 / 邀请码注册 |
| 已登录 | 自动同步打卡 / 记录 / 理由；换设备登录后合并，不会丢另一台的新增记录 |

冲突处理（同账号两台设备）：

- 打卡按日期取较新的；抵御冲动 / 破戒按 `id` 并集；已删除的 id 用墓碑，避免"复活"
- 理由做并集，已删除的不会回来
- 连续开始时间取最近一次被设置的那一边

## 自己再生成邀请码（管理员）

网页：**设置 → 账号与同步 → 生成 3 个**（30 天有效）。

或 SQL：

```sql
select code, expires_at from public.create_invites(5, 0, '朋友');  -- 0 = 永不过期
```

## 本地验证 schema（可选）

仓库的测试用 PGlite（纯本地 Postgres）跑过一遍 `schema.sql`，覆盖：

- 无邀请码 / 错误码 / 过期码 / 已使用码 → 注册失败且不留下用户
- 合法码 → 注册成功，邀请码原子核销，资料创建
- anon 不能读任何表，也不能调用 `redeem_invite` / `create_invites`
- 用户只能读写自己的 `profiles` / `user_data`；不能把自己设为管理员
- 管理员可生成邀请码，且只能看到自己生成的

## 文件

| 文件 | 作用 |
|---|---|
| `schema.sql` | 表、RLS、邀请码 RPC、注册触发器、云同步表 |
| `seed_invites.sql` | 生成首批邀请码 + 设管理员的示例 |
| `../config.js` | 前端配置（占位，由你填写） |
| `../cloud.js` | 登录 / 注册 / 同步客户端 |
| `../vendor/supabase.js` | `@supabase/supabase-js` UMD（MIT） |


## 管理后台

管理员（`profiles.is_admin = true`）登录后：

- 设置 → 账号与同步 → **打开管理后台**
- 或访问 `https://…/zenflow-web/#admin` / `?admin=1`（非管理员会被拒绝）

功能：总览统计、用户列表（设管理员 / 禁用登录）、邀请码（生成 / 复制 / 作废）、维护说明。

相关 SQL：`migrations/20261005_admin_dashboard.sql`（`admin_stats`、`admin_list_users`、`admin_list_invites`、`admin_set_admin`、`admin_set_banned`、`admin_revoke_invite`）。全部为 `SECURITY DEFINER`，内部检查 `is_admin`，只授予 `authenticated` 执行权限。


## Google 一键登录（需你在控制台完成密钥）

Supabase MCP **无法**代填 Google Client Secret，请按下列步骤操作：

### A. Google Cloud Console
1. 打开 https://console.cloud.google.com/ → 创建/选择项目
2. **APIs & Services → OAuth consent screen**：选 External，填应用名（ZenFlow）、支持邮箱
3. **Credentials → Create Credentials → OAuth client ID** → 类型 **Web application**
4. **Authorized JavaScript origins**
   - `https://gatsbyqaq.github.io`
   - （本地调试）`http://localhost:8765`
5. **Authorized redirect URIs**（必须是 Supabase 回调，不是 Pages 地址）：
   - `https://ordgebjytixmbwabpsrj.supabase.co/auth/v1/callback`
6. 复制 **Client ID** 与 **Client Secret**

### B. Supabase Dashboard
1. **Authentication → Providers → Google** → Enable
2. 粘贴 Client ID / Client Secret → Save
3. **Authentication → URL Configuration**
   - Site URL: `https://gatsbyqaq.github.io/zenflow-web/`
   - Redirect URLs 另加：`https://gatsbyqaq.github.io/zenflow-web/`、`http://localhost:8765/`

### C. 产品行为
- 已配置 `config.js` 时：**未登录只能看到登录门禁**，不能使用主应用
- Google 新用户：OAuth 成功后进入「输入邀请码完成注册」，调用 `complete_invite_registration`
- 邮箱+邀请码注册：metadata 带 `invite_code`、`display_name`（昵称，不必唯一）和 `handle`（@ID，不含 @，`^[a-z0-9_]{3,20}$`，全站唯一）。触发器校验失败会返回 `HANDLE_INVALID` 或 `HANDLE_TAKEN`
- Google 新用户在补填邀请码时也要设置 @ID。已通过邀请、但 `handle` 仍为空的账号会先被要求设置 @ID
- 头像：登录后在「设置 → 账号与资料」上传，客户端裁成约 256px 方形后写入公开存储桶 `avatars`（路径 `<uid>/...`），再调用 `update_my_profile`
- `config.js` 留空：仍为纯本机模式


### 数据库门禁
- `profiles.invite_ok`：未核销邀请码的账号（典型：Google 首次登录）不能进入主应用，也不能读写 `user_data`（RLS 调用 `current_invite_ok()`）。
