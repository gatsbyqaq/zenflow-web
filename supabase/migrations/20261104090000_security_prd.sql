-- PRD §5。只写进仓库，不在这里对生产执行。
-- 邀请码永久单次、熵 ≥ 60 位、校验限速、收回 anon/PUBLIC 的 EXECUTE、
-- 旧 iOS 表去掉 anon 的 TRUNCATE、注销时按 owner 删头像行、同步版本校验、管理审计。

create extension if not exists pgcrypto with schema extensions;

-- ---------- 邀请码：未用 = used_at is null ----------
alter table public.invites drop constraint if exists invites_code_check;
alter table public.invites add constraint invites_code_check check (code ~ '^[A-Z0-9-]{6,32}$');

create or replace function public.gen_invite_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  -- 32 个字符，256 能整除 32，get_byte % 32 没有取模偏差。12 位 = 60 位熵。
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  b bytea := extensions.gen_random_bytes(12);
  s text := '';
  i int;
begin
  for i in 0..11 loop
    s := s || substr(alphabet, 1 + (get_byte(b, i) % 32), 1);
  end loop;
  return 'ZF-' || substr(s, 1, 4) || '-' || substr(s, 5, 4) || '-' || substr(s, 9, 4);
end $$;

create table if not exists public.invite_attempts (
  id bigserial primary key,
  ip_hash text not null,
  code_prefix text,
  ok boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists invite_attempts_ip_time_idx on public.invite_attempts (ip_hash, created_at desc);
alter table public.invite_attempts enable row level security;
revoke all on public.invite_attempts from public, anon, authenticated;

create table if not exists public.invite_locks (
  ip_hash text primary key,
  fail_streak int not null default 0,
  lock_step int not null default 0,
  locked_until timestamptz
);
alter table public.invite_locks enable row level security;
revoke all on public.invite_locks from public, anon, authenticated;

create or replace function public.invite_client_hash() returns text
language plpgsql stable set search_path = '' as $$
declare
  hdr text := coalesce(nullif(current_setting('request.headers', true), ''), '{}');
  ip text := 'unknown';
begin
  begin
    ip := coalesce(
      nullif(split_part(hdr::json->>'x-forwarded-for', ',', 1), ''),
      nullif(hdr::json->>'cf-connecting-ip', ''),
      'unknown'
    );
  exception when others then
    ip := 'unknown';
  end;
  return encode(extensions.digest(trim(ip), 'sha256'), 'hex');
end $$;

-- 同一 IP 每分钟最多 10 次。连续 5 次无效后锁 15 分钟，之后加倍，上限 24 小时。
-- 锁定和普通失败都抛 INVITE_INVALID，并先睡固定时间，避免用耗时区分原因。
create or replace function public.guard_invite_attempt(p_code text, p_ok boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  h text := public.invite_client_hash();
  n int;
  streak int;
  step int;
  until_at timestamptz;
  prefix text := left(coalesce(p_code, ''), 7);
begin
  perform pg_catalog.pg_sleep(0.12);
  select fail_streak, lock_step, locked_until into streak, step, until_at
    from public.invite_locks where ip_hash = h;
  if until_at is not null and until_at > pg_catalog.now() then
    insert into public.invite_attempts (ip_hash, code_prefix, ok) values (h, prefix, false);
    raise exception 'INVITE_INVALID' using errcode = 'P0001';
  end if;
  select count(*)::int into n from public.invite_attempts
   where ip_hash = h and created_at > pg_catalog.now() - interval '1 minute';
  if n >= 10 then
    insert into public.invite_attempts (ip_hash, code_prefix, ok) values (h, prefix, false);
    raise exception 'INVITE_INVALID' using errcode = 'P0001';
  end if;
  insert into public.invite_attempts (ip_hash, code_prefix, ok) values (h, prefix, coalesce(p_ok, false));
  if coalesce(p_ok, false) then
    insert into public.invite_locks (ip_hash, fail_streak, lock_step, locked_until)
    values (h, 0, 0, null)
    on conflict (ip_hash) do update set fail_streak = 0, lock_step = 0, locked_until = null;
    return;
  end if;
  streak := coalesce(streak, 0) + 1;
  step := coalesce(step, 0);
  until_at := null;
  if streak >= 5 then
    step := step + 1;
    until_at := pg_catalog.now() + make_interval(mins => least(15 * (2 ^ greatest(step - 1, 0)), 24 * 60));
    streak := 0;
  end if;
  insert into public.invite_locks (ip_hash, fail_streak, lock_step, locked_until)
  values (h, streak, step, until_at)
  on conflict (ip_hash) do update
    set fail_streak = excluded.fail_streak, lock_step = excluded.lock_step, locked_until = excluded.locked_until;
end $$;

create or replace function public.invite_is_open(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.invites i
    where i.code = public.normalize_invite(p_code)
      and i.used_at is null
      and (i.expires_at is null or i.expires_at > pg_catalog.now())
  )
$$;

create or replace function public.validate_invite(p_code text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare ok boolean;
begin
  ok := public.invite_is_open(p_code);
  perform public.guard_invite_attempt(p_code, ok);
  return ok;
end $$;

create or replace function public.redeem_invite(p_code text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  perform public.guard_invite_attempt(p_code, public.invite_is_open(p_code));
  update public.invites
     set used_by = p_user, used_at = pg_catalog.now()
   where code = public.normalize_invite(p_code)
     and used_at is null
     and (expires_at is null or expires_at > pg_catalog.now());
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'INVITE_INVALID' using errcode = 'P0001';
  end if;
end $$;

-- 先核销邀请码，再校验 @ID，避免用无效码探测 @ID。
create or replace function public.complete_invite_registration(
  p_code text,
  p_display_name text default null,
  p_handle text default null
) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  row public.profiles;
  dname text := nullif(left(trim(coalesce(p_display_name, '')), 40), '');
  h text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into row from public.profiles where id = uid;
  if not found then
    insert into public.profiles (id, display_name, invite_ok) values (uid, dname, false) returning * into row;
  end if;
  if row.invite_ok then
    if p_handle is not null or row.handle is null then
      h := public.assert_handle(coalesce(p_handle, row.handle), uid);
    else
      h := row.handle;
    end if;
    update public.profiles set display_name = coalesce(dname, display_name), handle = h where id = uid returning * into row;
    return row;
  end if;
  perform public.redeem_invite(p_code, uid);
  h := public.assert_handle(coalesce(p_handle, row.handle), uid);
  update public.profiles set invite_ok = true, display_name = coalesce(dname, display_name), handle = h
   where id = uid returning * into row;
  return row;
end $$;

create or replace function public.is_handle_available(p_handle text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare ok boolean;
begin
  ok := public.normalize_handle(p_handle) ~ '^[a-z0-9_]{3,20}$'
    and not exists (
      select 1 from public.profiles
      where handle = public.normalize_handle(p_handle) and id is distinct from auth.uid()
    );
  perform public.guard_invite_attempt(p_handle, ok);
  return ok;
end $$;

-- ---------- 头像地址只能指向本项目 avatars 桶 ----------
create or replace function public.update_my_profile(
  p_display_name text default null,
  p_handle text default null,
  p_avatar_url text default null
) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); row public.profiles; h text; url text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if p_handle is not null then h := public.assert_handle(p_handle, uid); end if;
  if p_avatar_url is null then
    url := null;
  elsif p_avatar_url = '' then
    url := '';
  elsif p_avatar_url ~ '/storage/v1/object/(public|sign)/avatars/[0-9a-f-]{36}/[0-9a-f]{32}\.webp(\?.*)?$' then
    url := left(p_avatar_url, 500);
  else
    raise exception 'AVATAR_URL' using errcode = '22023';
  end if;
  update public.profiles set
    display_name = coalesce(nullif(left(trim(coalesce(p_display_name, '')), 40), ''), display_name),
    handle = coalesce(h, handle),
    avatar_url = case when url is null then avatar_url when url = '' then null else url end
  where id = uid returning * into row;
  return row;
end $$;

-- ---------- 注销：邀请码保持已用，并删掉头像对象行 ----------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = uid and is_admin) then
    raise exception 'ADMIN_CANNOT_DELETE' using errcode = 'P0001';
  end if;
  delete from public.user_data where user_id = uid;
  begin
    delete from public.ios_habit_records_legacy where user_id::text = uid::text;
    delete from public.ios_profiles_legacy where user_id::text = uid::text;
  exception when undefined_table then
    null;
  end;
  -- 只去掉个人关联。used_at 保留，码不能再次使用。外键 ON DELETE SET NULL 同样只动 used_by。
  update public.invites set used_by = null where used_by = uid;
  update public.invites set created_by = null where created_by = uid;
  delete from storage.objects
   where bucket_id = 'avatars'
     and (owner = uid or name like uid::text || '/%');
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end $$;

-- ---------- 同步：带版本的条件更新 ----------
create or replace function public.server_now() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select pg_catalog.now()
$$;

create or replace function public.save_user_data(p_data jsonb, p_expected timestamptz)
returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  cur timestamptz;
  nxt timestamptz;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if octet_length(p_data::text) >= 2000000 then
    raise exception 'PAYLOAD_TOO_LARGE' using errcode = '22023';
  end if;
  select updated_at into cur from public.user_data where user_id = uid;
  if not found then
    insert into public.user_data (user_id, data) values (uid, p_data) returning updated_at into nxt;
    return nxt;
  end if;
  if p_expected is not null and cur is distinct from p_expected then
    raise exception 'SYNC_CONFLICT' using errcode = 'P0001';
  end if;
  update public.user_data set data = p_data where user_id = uid returning updated_at into nxt;
  return nxt;
end $$;

-- ---------- 管理审计（只增） ----------
create table if not exists public.admin_audit (
  id bigserial primary key,
  actor uuid not null,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default pg_catalog.now()
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from public, anon, authenticated;

create or replace function public.write_admin_audit(p_actor uuid, p_action text, p_target text, p_detail jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.admin_audit (actor, action, target, detail) values (p_actor, p_action, p_target, p_detail);
end $$;
revoke all on function public.write_admin_audit(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public.admin_set_admin(p_user uuid, p_admin boolean) returns void
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
  perform public.write_admin_audit(me, 'set_admin', p_user::text, jsonb_build_object('admin', coalesce(p_admin, false)));
end $$;

create or replace function public.admin_set_banned(p_user uuid, p_banned boolean) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare me uuid;
begin
  me := public.require_admin();
  if p_user is null then raise exception 'BAD_USER' using errcode = '22023'; end if;
  if p_user = me then raise exception 'CANNOT_BAN_SELF: 不能禁用自己的账号' using errcode = 'P0001'; end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'USER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if coalesce(p_banned, false) then
    update auth.users set banned_until = 'infinity'::timestamptz where id = p_user;
    delete from auth.sessions where user_id = p_user;
    delete from auth.refresh_tokens where user_id = p_user::text;
  else
    update auth.users set banned_until = null where id = p_user;
  end if;
  perform public.write_admin_audit(me, 'set_banned', p_user::text, jsonb_build_object('banned', coalesce(p_banned, false)));
end $$;

create or replace function public.admin_revoke_invite(p_code text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare n int; me uuid;
begin
  me := public.require_admin();
  delete from public.invites
   where code = public.normalize_invite(p_code)
     and used_at is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'REVOKE_FAILED: 邀请码不存在或已被使用，无法作废' using errcode = 'P0001'; end if;
  perform public.write_admin_audit(me, 'revoke_invite', public.normalize_invite(p_code), null);
  return true;
end $$;

create or replace function public.admin_list_invites()
returns table (
  code text, note text, created_at timestamptz, expires_at timestamptz, used_at timestamptz,
  created_by uuid, created_by_email text, used_by uuid, used_by_email text, status text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return query
  select i.code, i.note, i.created_at, i.expires_at, i.used_at, i.created_by, cu.email::text,
         i.used_by, uu.email::text,
         case
           when i.used_at is not null then 'used'
           when i.expires_at is not null and i.expires_at <= pg_catalog.now() then 'expired'
           else 'unused'
         end
  from public.invites i
  left join auth.users cu on cu.id = i.created_by
  left join auth.users uu on uu.id = i.used_by
  order by i.created_at desc;
end $$;

-- create_invites：默认最多 30 天；0 或负数不再表示永不过期。
create or replace function public.create_invites(p_count int default 5, p_days int default 30, p_note text default null)
returns setof public.invites
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  jwt_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
  days int := least(coalesce(nullif(p_days, 0), 30), 30);
  k int;
  made text;
begin
  if days < 1 then days := 30; end if;
  if uid is null then
    if jwt_role in ('anon', 'authenticated') then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  elsif not exists (select 1 from public.profiles p where p.id = uid and p.is_admin) then
    raise exception 'NOT_ADMIN: 只有管理员可以生成邀请码' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 50 then raise exception 'BAD_COUNT: 1–50' using errcode = '22023'; end if;
  for k in 1..p_count loop
    made := public.gen_invite_code();
    return query
      insert into public.invites (code, created_by, expires_at, note)
      values (made, uid, pg_catalog.now() + make_interval(days => days), p_note)
      on conflict (code) do nothing
      returning *;
    if uid is not null then
      perform public.write_admin_audit(uid, 'create_invite', made, jsonb_build_object('days', days));
    end if;
  end loop;
end $$;

-- ---------- 授权 ----------
revoke all on function public.gen_invite_code() from public, anon, authenticated;
revoke all on function public.invite_client_hash() from public, anon, authenticated;
revoke all on function public.invite_is_open(text) from public, anon, authenticated;
revoke all on function public.guard_invite_attempt(text, boolean) from public, anon, authenticated;
revoke all on function public.validate_invite(text) from public, anon, authenticated;
revoke all on function public.redeem_invite(text, uuid) from public, anon, authenticated;
revoke all on function public.admin_stats() from public, anon;
revoke all on function public.admin_list_users() from public, anon;
revoke all on function public.admin_list_invites() from public, anon;
revoke all on function public.admin_set_admin(uuid, boolean) from public, anon;
revoke all on function public.admin_set_banned(uuid, boolean) from public, anon;
revoke all on function public.admin_revoke_invite(text) from public, anon;
revoke all on function public.create_invites(int, int, text) from public, anon;
revoke all on function public.complete_invite_registration(text, text, text) from public, anon;
revoke all on function public.update_my_profile(text, text, text) from public, anon;
revoke all on function public.current_invite_ok() from public, anon;
revoke all on function public.is_handle_available(text) from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.server_now() from public, anon;
revoke all on function public.save_user_data(jsonb, timestamptz) from public, anon;

grant execute on function public.validate_invite(text) to service_role;
grant execute on function public.server_now() to authenticated;
grant execute on function public.save_user_data(jsonb, timestamptz) to authenticated;
grant execute on function public.is_handle_available(text) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.update_my_profile(text, text, text) to authenticated;
grant execute on function public.complete_invite_registration(text, text, text) to authenticated;
grant execute on function public.create_invites(int, int, text) to authenticated;
grant execute on function public.current_invite_ok() to authenticated;

-- 旧版 iOS 表：anon 的 TRUNCATE 不受 RLS 约束。表仍保留（当前 0 行），只收回权限。
do $$
begin
  if to_regclass('public.ios_profiles_legacy') is not null then
    execute 'revoke all on public.ios_profiles_legacy from public, anon, authenticated';
  end if;
  if to_regclass('public.ios_habit_records_legacy') is not null then
    execute 'revoke all on public.ios_habit_records_legacy from public, anon, authenticated';
  end if;
end $$;

-- 头像不再接受 gif。
update storage.buckets
   set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']
 where id = 'avatars';

-- 30 天后清掉邀请码尝试日志。由 pg_cron 或管理员手动调用均可。
create or replace function public.purge_invite_attempts() returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.invite_attempts where created_at < pg_catalog.now() - interval '30 days';
end $$;
revoke all on function public.purge_invite_attempts() from public, anon, authenticated;
