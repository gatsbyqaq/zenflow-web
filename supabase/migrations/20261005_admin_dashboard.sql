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
