drop policy if exists "insert profiles by admin or self bootstrap" on public.profiles;

create policy "insert profiles by admin first user or self sales"
on public.profiles for insert to authenticated
with check (
  public.current_app_role() = 'admin'
  or (
    id = (select auth.uid())
    and role = 'sales'
  )
  or (
    id = (select auth.uid())
    and role = 'admin'
    and not exists (select 1 from public.profiles)
  )
);
