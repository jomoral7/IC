create policy "users create own sales profile"
on public.profiles for insert to authenticated
with check (
  id = (select auth.uid())
  and role = 'sales'
);
