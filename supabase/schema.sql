-- =====================================================================
-- ZenFlow · Supabase schema（邀请制注册 + 个人资料 + 云同步）
-- 在 Supabase 控制台 → SQL Editor 中整体运行一次即可（可重复运行）。
-- 依赖 Supabase 自带的 auth.users / auth.uid()。不含任何密钥。
-- =====================================================================

-- ---------- 表 ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 40),
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.invites (
  code       text primary key check (code ~ '^[A-Z0-9-]{6,32}$'),
  created_by uuid references auth.users(id) on delete set null,
  used_by    uuid references auth.users(id) on delete set null,
  used_at    timestamptz,
  expires_at timestamptz,
  note       text check (note is null or char_length(note) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists invites_created_by_idx on public.invites(created_by);

-- 云同步：每个用户一行，data 为整个本地状态（与导出的 JSON 相同结构）
create table if not exists public.user_data (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  constraint user_data_size check (octet_length(data::text) < 2000000)
);

-- ---------- 行级安全（RLS） ----------
alter table public.profiles  enable row level security;
alter table public.invites   enable row level security;
alter table public.user_data enable row level security;

-- 先收回 Supabase 默认授予 anon / authenticated 的表权限，再按需授予
revoke all on public.profiles, public.invites, public.user_data from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;   -- 只能改昵称，不能改 is_admin
grant select on public.invites to authenticated;                    -- 仅管理员可见自己生成的（见下方策略）
grant select, insert, update, delete on public.user_data to authenticated;

drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = auth.uid());
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "invites: admin reads own" on public.invites;
create policy "invites: admin reads own" on public.invites
  for select to authenticated
  using (created_by = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

drop policy if exists "user_data: own row" on public.user_data;
create policy "user_data: own row" on public.user_data
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 服务器时间作为 updated_at
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch before insert or update on public.user_data
  for each row execute function public.touch_updated_at();

-- ---------- 邀请码 ----------
create or replace function public.normalize_invite(p_code text) returns text
language sql immutable set search_path = '' as $$
  select upper(regexp_replace(coalesce(p_code, ''), '\s', '', 'g'))
$$;

-- 生成一个随机邀请码：ZF-XXXX-XXXX（去掉易混淆字符 0/O/1/I/L）
create or replace function public.gen_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid()) || uuid_send(gen_random_uuid());
  s text := '';
  i int;
begin
  for i in 0..7 loop
    s := s || substr(alphabet, 1 + (get_byte(b, i * 2) % 31), 1);   -- 每个 uuid 的前 6 字节完全随机
  end loop;
  return 'ZF-' || substr(s, 1, 4) || '-' || substr(s, 5, 4);
end $$;

-- 注册前校验（任何人可调用，只返回是否可用，不暴露其它信息）
create or replace function public.validate_invite(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.invites i
    where i.code = public.normalize_invite(p_code)
      and i.used_by is null
      and (i.expires_at is null or i.expires_at > now())
  )
$$;

-- 原子地核销邀请码：单条 UPDATE ... WHERE used_by IS NULL，并发时只有一个事务能成功
create or replace function public.redeem_invite(p_code text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.invites
     set used_by = p_user, used_at = now()
   where code = public.normalize_invite(p_code)
     and used_by is null
     and (expires_at is null or expires_at > now());
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'INVITE_INVALID: 邀请码无效、已过期或已被使用' using errcode = 'P0001';
  end if;
end $$;

-- 新用户注册时（auth.users 插入后）核销邀请码并创建资料；邀请码无效则抛错，整个注册回滚
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.redeem_invite(new.raw_user_meta_data ->> 'invite_code', new.id);
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 40), ''));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 生成邀请码：管理员（profiles.is_admin）在网页里调用，或在 SQL Editor 中直接运行
create or replace function public.create_invites(p_count int default 5, p_days int default 30, p_note text default null)
returns setof public.invites
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  jwt_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  k int;
begin
  if uid is null then
    if jwt_role in ('anon', 'authenticated') then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  elsif not exists (select 1 from public.profiles p where p.id = uid and p.is_admin) then
    raise exception 'NOT_ADMIN: 只有管理员可以生成邀请码' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 50 then raise exception 'BAD_COUNT: 1–50' using errcode = '22023'; end if;
  for k in 1..p_count loop
    return query
      insert into public.invites (code, created_by, expires_at, note)
      values (public.gen_invite_code(), uid,
              case when p_days is null or p_days <= 0 then null else now() + make_interval(days => p_days) end,
              p_note)
      on conflict (code) do nothing
      returning *;
  end loop;
end $$;

-- 函数权限：Supabase 默认对新函数授予 anon/authenticated 执行权限，这里显式收紧
revoke all on function public.redeem_invite(text, uuid)        from public, anon, authenticated;
revoke all on function public.handle_new_user()                 from public, anon, authenticated;
revoke all on function public.create_invites(int, int, text)    from public, anon;
revoke all on function public.gen_invite_code()                 from public, anon, authenticated;
grant execute on function public.validate_invite(text)          to anon, authenticated;
grant execute on function public.create_invites(int, int, text) to authenticated;

-- ---------- 管理后台 RPC ----------
-- ZenFlow · 管理后台 RPC（仅 profiles.is_admin = true 可调用）
-- 通过 SECURITY DEFINER 读取 auth.users 邮箱 / banned_until，不把 auth.users 直接暴露给客户端。

create or replace function public.require_admin() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles p where p.id = uid and p.is_admin) then
    raise exception 'NOT_ADMIN: 只有管理员可以执行此操作' using errcode = '42501';
  end if;
  return uid;
end $$;
revoke all on function public.require_admin() from public, anon, authenticated;

create or replace function public.admin_stats()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  _admin uuid;
  users_total int;
  admins_total int;
  banned_total int;
  invites_total int;
  invites_unused int;
  invites_used int;
  invites_expired int;
  active_today int;
  recent jsonb;
begin
  _admin := public.require_admin();
  select count(*)::int into users_total from public.profiles;
  select count(*)::int into admins_total from public.profiles where is_admin;
  select count(*)::int into banned_total from auth.users where banned_until is not null and banned_until > now();
  select count(*)::int into invites_total from public.invites;
  select count(*)::int into invites_used from public.invites where used_by is not null;
  select count(*)::int into invites_expired from public.invites
    where used_by is null and expires_at is not null and expires_at <= now();
  invites_unused := invites_total - invites_used - invites_expired;
  -- 「今日活跃」：user_data.updated_at 在今天（UTC）有更新，尽力而为
  select count(*)::int into active_today from public.user_data where updated_at >= date_trunc('day', now());
  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb) into recent
  from (
    select p.id, p.display_name, p.is_admin, p.created_at, u.email,
           (u.banned_until is not null and u.banned_until > now()) as is_banned
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at desc
    limit 8
  ) t;
  return jsonb_build_object(
    'users_total', users_total,
    'admins_total', admins_total,
    'banned_total', banned_total,
    'invites_total', invites_total,
    'invites_unused', invites_unused,
    'invites_used', invites_used,
    'invites_expired', invites_expired,
    'active_today', active_today,
    'recent_signups', recent
  );
end $$;

create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  is_admin boolean,
  is_banned boolean,
  banned_until timestamptz,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  last_sync_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
  select p.id,
         u.email::text,
         p.display_name,
         p.is_admin,
         (u.banned_until is not null and u.banned_until > now()),
         u.banned_until,
         p.created_at,
         u.last_sign_in_at,
         ud.updated_at
  from public.profiles p
  join auth.users u on u.id = p.id
  left join public.user_data ud on ud.user_id = p.id
  order by p.created_at desc;
end $$;

create or replace function public.admin_list_invites()
returns table (
  code text,
  note text,
  created_at timestamptz,
  expires_at timestamptz,
  used_at timestamptz,
  created_by uuid,
  created_by_email text,
  used_by uuid,
  used_by_email text,
  status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
  select i.code,
         i.note,
         i.created_at,
         i.expires_at,
         i.used_at,
         i.created_by,
         cu.email::text,
         i.used_by,
         uu.email::text,
         case
           when i.used_by is not null then 'used'
           when i.expires_at is not null and i.expires_at <= now() then 'expired'
           else 'unused'
         end
  from public.invites i
  left join auth.users cu on cu.id = i.created_by
  left join auth.users uu on uu.id = i.used_by
  order by i.created_at desc;
end $$;

create or replace function public.admin_set_admin(p_user uuid, p_admin boolean)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid;
begin
  me := public.require_admin();
  if p_user is null then raise exception 'BAD_USER' using errcode = '22023'; end if;
  if p_user = me and p_admin is not true then
    raise exception 'CANNOT_DEMOTE_SELF: 不能取消自己的管理员身份' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.profiles set is_admin = coalesce(p_admin, false) where id = p_user;
end $$;

-- 禁用 / 解禁：写 auth.users.banned_until（Supabase Auth 会拒绝被禁用账号登录）
create or replace function public.admin_set_banned(p_user uuid, p_banned boolean)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid;
begin
  me := public.require_admin();
  if p_user is null then raise exception 'BAD_USER' using errcode = '22023'; end if;
  if p_user = me then
    raise exception 'CANNOT_BAN_SELF: 不能禁用自己的账号' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if coalesce(p_banned, false) then
    update auth.users set banned_until = 'infinity'::timestamptz where id = p_user;
  else
    update auth.users set banned_until = null where id = p_user;
  end if;
end $$;

create or replace function public.admin_revoke_invite(p_code text)
returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare n int;
begin
  perform public.require_admin();
  delete from public.invites
   where code = public.normalize_invite(p_code)
     and used_by is null;
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'REVOKE_FAILED: 邀请码不存在或已被使用，无法作废' using errcode = 'P0001';
  end if;
  return true;
end $$;

revoke all on function public.admin_stats() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_list_invites() from public, anon;
revoke all on function public.admin_set_admin(uuid, boolean) from public, anon;
revoke all on function public.admin_set_banned(uuid, boolean) from public, anon;
revoke all on function public.admin_revoke_invite(text) from public, anon;

grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_list_invites() to authenticated;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;
grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;
grant execute on function public.admin_revoke_invite(text) to authenticated;


-- OAuth invite gate (see migrations/20261005_oauth_invite_gate.sql)


-- OAuth invite gate (see migrations/20261005_oauth_invite_gate.sql + user_data_invite_ok_rls)
-- profiles.invite_ok: false until invite redeemed (email signup with invite_code sets true in handle_new_user)
-- complete_invite_registration(p_code, p_display_name) for Google/pending users
-- user_data RLS requires current_invite_ok()
