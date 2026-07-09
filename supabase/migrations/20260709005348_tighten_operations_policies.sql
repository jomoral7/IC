alter table public.seller_commissions enable row level security;

create policy "authenticated read seller commissions"
on public.seller_commissions for select to authenticated
using (true);

create policy "admin manager manage seller commissions"
on public.seller_commissions for all to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));

drop policy if exists "admin manager manage sellers" on public.sellers;
create policy "admin manager insert sellers" on public.sellers for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager'));
create policy "admin manager update sellers" on public.sellers for update to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));
create policy "admin manager delete sellers" on public.sellers for delete to authenticated
using (public.current_app_role() in ('admin', 'manager'));

drop policy if exists "admin manager manage commission rules" on public.commission_rules;
create policy "admin manager insert commission rules" on public.commission_rules for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager'));
create policy "admin manager update commission rules" on public.commission_rules for update to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));
create policy "admin manager delete commission rules" on public.commission_rules for delete to authenticated
using (public.current_app_role() in ('admin', 'manager'));

drop policy if exists "admin manager warehouse manage stock requests" on public.stock_requests;
create policy "admin manager warehouse insert stock requests" on public.stock_requests for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));
create policy "admin manager warehouse update stock requests" on public.stock_requests for update to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'))
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));
create policy "admin manager warehouse delete stock requests" on public.stock_requests for delete to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'));
