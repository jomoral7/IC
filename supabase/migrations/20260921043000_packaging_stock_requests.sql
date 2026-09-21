-- Pedidos y recepciones parciales para bolsas, cajas, etiquetas y demas empaques.
create table if not exists public.packaging_stock_requests (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.packaging_materials(id),
  location_id uuid references public.inventory_locations(id),
  requested_quantity integer not null check (requested_quantity > 0),
  received_quantity integer not null default 0 check (received_quantity >= 0 and received_quantity <= requested_quantity),
  status public.stock_request_status not null default 'pending',
  supplier_id uuid references public.parties(id),
  requested_by uuid references public.profiles(id),
  requested_at timestamptz not null default now(),
  received_at timestamptz,
  notes text
);

create index if not exists packaging_stock_requests_open_material_idx
  on public.packaging_stock_requests(material_id, status, requested_at desc);

alter table public.packaging_stock_requests enable row level security;
grant select, insert, update, delete on public.packaging_stock_requests to authenticated;

create policy "authenticated read packaging stock requests" on public.packaging_stock_requests
  for select to authenticated using (true);
create policy "admin manager warehouse manage packaging stock requests" on public.packaging_stock_requests
  for all to authenticated
  using (public.current_app_role() in ('admin', 'manager', 'warehouse'))
  with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));
