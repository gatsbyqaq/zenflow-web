-- 线上迁移 20261006084259 delete_my_account 的仓库副本（含当时的缺陷）。
-- 生产库已经记过这个版本。缺陷由 20261104090000_security_prd.sql 修掉：
-- 这里会把 used_by 置空，已用邀请码会重新变成可用。不要单独停在这一版。

create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if exists (select 1 from public.profiles where id = uid and is_admin) then
    raise exception 'ADMIN_CANNOT_DELETE';
  end if;
  delete from public.user_data where user_id = uid;
  delete from public.ios_habit_records_legacy where user_id::text = uid::text;
  delete from public.ios_profiles_legacy where user_id::text = uid::text;
  update public.invites set used_by = null where used_by = uid;
  update public.invites set created_by = null where created_by = uid;
  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
