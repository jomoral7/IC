create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security invoker
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins insert profiles"
on public.profiles for insert to authenticated
with check (public.current_app_role() = 'admin');
create policy "admins update profiles"
on public.profiles for update to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');
create policy "admins delete profiles"
on public.profiles for delete to authenticated
using (public.current_app_role() = 'admin');

drop policy if exists "admin manager warehouse manage products" on public.products;
create policy "admin manager warehouse insert products"
on public.products for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));
create policy "admin manager warehouse update products"
on public.products for update to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'))
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));
create policy "admin manager warehouse delete products"
on public.products for delete to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'));

drop policy if exists "admin manager warehouse manage locations" on public.inventory_locations;
create policy "admin manager warehouse insert locations"
on public.inventory_locations for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));
create policy "admin manager warehouse update locations"
on public.inventory_locations for update to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'))
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));
create policy "admin manager warehouse delete locations"
on public.inventory_locations for delete to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'));

drop policy if exists "admin manager warehouse manage stock" on public.stock_levels;
create policy "admin manager warehouse insert stock"
on public.stock_levels for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));
create policy "admin manager warehouse update stock"
on public.stock_levels for update to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'))
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));
create policy "admin manager warehouse delete stock"
on public.stock_levels for delete to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'));

drop policy if exists "admin manager sales manage parties" on public.parties;
create policy "admin manager sales insert parties"
on public.parties for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager', 'sales'));
create policy "admin manager sales update parties"
on public.parties for update to authenticated
using (public.current_app_role() in ('admin', 'manager', 'sales'))
with check (public.current_app_role() in ('admin', 'manager', 'sales'));
create policy "admin manager sales delete parties"
on public.parties for delete to authenticated
using (public.current_app_role() in ('admin', 'manager', 'sales'));
