-- Require invite_ok before cloud sync (OAuth pending users blocked at RLS)
create or replace function public.current_invite_ok() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select invite_ok from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public.current_invite_ok() from public;
grant execute on function public.current_invite_ok() to authenticated;

drop policy if exists "user_data: own row" on public.user_data;
drop policy if exists "user_data: own row invite_ok" on public.user_data;
create policy "user_data: own row invite_ok" on public.user_data
  for all to authenticated
  using (user_id = auth.uid() and public.current_invite_ok())
  with check (user_id = auth.uid() and public.current_invite_ok());
