drop policy if exists "admins insert profiles" on public.profiles;
drop policy if exists "users create own sales profile" on public.profiles;

create policy "insert profiles by admin or self bootstrap"
on public.profiles for insert to authenticated
with check (
  public.current_app_role() = 'admin'
  or (
    id = (select auth.uid())
    and role = 'sales'
  )
);
