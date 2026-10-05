-- OAuth 友好的邀请制：无邀请码时可创建 pending 资料；complete_invite_registration 核销后放行
alter table public.profiles
  add column if not exists invite_ok boolean not null default false;

update public.profiles set invite_ok = true where invite_ok is distinct from true;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  code text := nullif(trim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')), '');
  dname text := nullif(left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 40), '');
begin
  if code is not null then
    perform public.redeem_invite(code, new.id);
    insert into public.profiles (id, display_name, invite_ok)
    values (new.id, dname, true)
    on conflict (id) do update set display_name = coalesce(excluded.display_name, public.profiles.display_name), invite_ok = true;
  else
    insert into public.profiles (id, display_name, invite_ok)
    values (new.id, dname, false)
    on conflict (id) do nothing;
  end if;
  return new;
end $$;

create or replace function public.complete_invite_registration(p_code text, p_display_name text default null)
returns public.profiles
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  row public.profiles;
  dname text := nullif(left(trim(coalesce(p_display_name, '')), 40), '');
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into row from public.profiles where id = uid;
  if not found then
    insert into public.profiles (id, display_name, invite_ok) values (uid, dname, false)
    returning * into row;
  end if;
  if row.invite_ok then
    if dname is not null and coalesce(row.display_name, '') is distinct from dname then
      update public.profiles set display_name = dname where id = uid returning * into row;
    end if;
    return row;
  end if;
  perform public.redeem_invite(p_code, uid);
  update public.profiles
     set invite_ok = true,
         display_name = coalesce(dname, display_name)
   where id = uid
  returning * into row;
  return row;
end $$;

revoke all on function public.complete_invite_registration(text, text) from public, anon;
grant execute on function public.complete_invite_registration(text, text) to authenticated;
