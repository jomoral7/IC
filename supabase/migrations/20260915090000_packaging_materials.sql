-- Materiales de empaque: activos consumibles que no se venden al cliente.
create sequence if not exists public.packaging_material_code_seq;

create table if not exists public.packaging_materials (
  id uuid primary key default gen_random_uuid(),
  internal_code text not null unique default ('EMP-' || lpad(nextval('public.packaging_material_code_seq')::text, 6, '0')),
  name text not null,
  kind text not null default 'Bolsa',
  description text,
  size text,
  color text,
  unit text not null default 'unidad',
  min_stock numeric(12, 2) not null default 0 check (min_stock >= 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packaging_stock_levels (
  material_id uuid not null references public.packaging_materials(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  quantity numeric(12, 2) not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (material_id, location_id)
);

create table if not exists public.packaging_movements (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.packaging_materials(id),
  location_id uuid not null references public.inventory_locations(id),
  document_id uuid references public.documents(id) on delete set null,
  movement_type text not null check (movement_type in ('purchase', 'use', 'adjustment_in', 'adjustment_out', 'void_return')),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.sale_packaging_usage (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  material_id uuid not null references public.packaging_materials(id),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  total_cost numeric(12, 2) not null default 0 check (total_cost >= 0),
  created_at timestamptz not null default now(),
  unique (document_id, material_id)
);

create index if not exists packaging_movements_material_created_idx on public.packaging_movements(material_id, created_at desc);
create index if not exists sale_packaging_usage_document_idx on public.sale_packaging_usage(document_id);

alter table public.packaging_materials enable row level security;
alter table public.packaging_stock_levels enable row level security;
alter table public.packaging_movements enable row level security;
alter table public.sale_packaging_usage enable row level security;

grant select, insert, update, delete on public.packaging_materials, public.packaging_stock_levels, public.packaging_movements, public.sale_packaging_usage to authenticated;
grant usage, select on sequence public.packaging_material_code_seq to authenticated;

create policy "authenticated read packaging materials" on public.packaging_materials for select to authenticated using (true);
create policy "admin manager warehouse manage packaging materials" on public.packaging_materials for all to authenticated
  using (public.current_app_role() in ('admin', 'manager', 'warehouse'))
  with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));

create policy "authenticated read packaging stock" on public.packaging_stock_levels for select to authenticated using (true);
create policy "admin manager warehouse manage packaging stock" on public.packaging_stock_levels for all to authenticated
  using (public.current_app_role() in ('admin', 'manager', 'warehouse'))
  with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));

create policy "authenticated read packaging movements" on public.packaging_movements for select to authenticated using (true);
create policy "admin manager warehouse create packaging movements" on public.packaging_movements for insert to authenticated
  with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));

create policy "authenticated read sale packaging usage" on public.sale_packaging_usage for select to authenticated using (true);
create policy "admin manager sales create sale packaging usage" on public.sale_packaging_usage for insert to authenticated
  with check (public.current_app_role() in ('admin', 'manager', 'sales'));

-- Cuentas separadas para no mezclar bolsas, cajas o etiquetas con mercaderia.
-- La cuenta 1105 ya existe en este catalogo; se le asigna la llave que usa la aplicacion.
update public.chart_of_accounts
set name = 'Materiales de empaque', system_key = 'packaging_inventory', active = true
where code = '1105' and system_key is null;

insert into public.chart_of_accounts (code, name, type, normal_side, is_postable, system_key, active)
select '5209', 'Gasto de empaque', 'expense', 'debit', true, 'packaging_expense', true
where not exists (select 1 from public.chart_of_accounts where system_key = 'packaging_expense');
