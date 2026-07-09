drop policy if exists "admin manager manage seller commissions" on public.seller_commissions;
create policy "admin manager insert seller commissions"
on public.seller_commissions for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager'));
create policy "admin manager update seller commissions"
on public.seller_commissions for update to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));
create policy "admin manager delete seller commissions"
on public.seller_commissions for delete to authenticated
using (public.current_app_role() in ('admin', 'manager'));
