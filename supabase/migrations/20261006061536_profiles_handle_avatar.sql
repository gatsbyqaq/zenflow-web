-- 线上迁移 20261006061536 profiles_handle_avatar 的仓库副本。
-- 生产库已经记过这个版本，不会再执行。新库按文件名顺序跑到后面的安全迁移。

alter table public.profiles add column if not exists handle text;
alter table public.profiles add column if not exists avatar_url text;
create unique index if not exists profiles_handle_key on public.profiles (handle) where handle is not null;

create or replace function public.normalize_handle(p_handle text) returns text
language sql immutable set search_path = '' as $$
  select nullif(lower(regexp_replace(trim(coalesce(p_handle, '')), '^@+', '')), '')
$$;

create or replace function public.assert_handle(p_handle text, p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare h text := public.normalize_handle(p_handle);
begin
  if h is null or h !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'HANDLE_INVALID: ID 需为 3-20 位小写字母、数字或下划线' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where handle = h and id is distinct from p_user) then
    raise exception 'HANDLE_TAKEN: 这个 ID 已被占用' using errcode = 'P0001';
  end if;
  return h;
end $$;

create or replace function public.is_handle_available(p_handle text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.normalize_handle(p_handle) ~ '^[a-z0-9_]{3,20}$'
     and not exists (
       select 1 from public.profiles
       where handle = public.normalize_handle(p_handle) and id is distinct from auth.uid()
     )
$$;

create or replace function public.update_my_profile(
  p_display_name text default null,
  p_handle text default null,
  p_avatar_url text default null
) returns public.profiles
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); row public.profiles; h text;
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if p_handle is not null then h := public.assert_handle(p_handle, uid); end if;
  update public.profiles set
    display_name = coalesce(nullif(left(trim(coalesce(p_display_name, '')), 40), ''), display_name),
    handle = coalesce(h, handle),
    avatar_url = case when p_avatar_url is null then avatar_url when p_avatar_url = '' then null else left(p_avatar_url, 500) end
  where id = uid returning * into row;
  return row;
end $$;

revoke all on function public.assert_handle(text, uuid) from public, anon, authenticated;
revoke all on function public.normalize_handle(text) from public, anon, authenticated;
grant execute on function public.is_handle_available(text) to authenticated;
grant execute on function public.update_my_profile(text, text, text) to authenticated;
