create type public.app_role as enum ('admin', 'manager', 'warehouse', 'sales');
create type public.movement_type as enum ('purchase', 'sale', 'adjustment_in', 'adjustment_out', 'transfer');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'sales',
  branch text,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category text not null,
  barcode text,
  min_stock integer not null default 0 check (min_stock >= 0),
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  price numeric(12, 2) not null default 0 check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'branch',
  created_at timestamptz not null default now()
);

create table public.stock_levels (
  product_id uuid not null references public.products(id) on delete cascade,
  location_id uuid not null references public.inventory_locations(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (product_id, location_id)
);

create table public.parties (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('supplier', 'customer')),
  name text not null,
  tax_id text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('purchase', 'sale')),
  document_number text not null,
  party_id uuid references public.parties(id),
  location_id uuid references public.inventory_locations(id),
  total numeric(12, 2) not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (kind, document_number)
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  location_id uuid not null references public.inventory_locations(id),
  document_id uuid references public.documents(id),
  movement_type public.movement_type not null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12, 2) not null default 0,
  unit_price numeric(12, 2) not null default 0,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security invoker
as $$
  select role from public.profiles where id = (select auth.uid())
$$;

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.stock_levels enable row level security;
alter table public.parties enable row level security;
alter table public.documents enable row level security;
alter table public.inventory_movements enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;

create policy "profiles can read own or admin"
on public.profiles for select to authenticated
using ((select auth.uid()) = id or public.current_app_role() = 'admin');

create policy "admins manage profiles"
on public.profiles for all to authenticated
using (public.current_app_role() = 'admin')
with check (public.current_app_role() = 'admin');

create policy "authenticated can read operational catalog"
on public.products for select to authenticated
using (true);

create policy "admin manager warehouse manage products"
on public.products for all to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'))
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));

create policy "authenticated can read locations and stock"
on public.inventory_locations for select to authenticated
using (true);

create policy "admin manager warehouse manage locations"
on public.inventory_locations for all to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'))
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));

create policy "authenticated can read stock"
on public.stock_levels for select to authenticated
using (true);

create policy "admin manager warehouse manage stock"
on public.stock_levels for all to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'))
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));

create policy "authenticated can read parties and documents"
on public.parties for select to authenticated
using (true);

create policy "admin manager sales manage parties"
on public.parties for all to authenticated
using (public.current_app_role() in ('admin', 'manager', 'sales'))
with check (public.current_app_role() in ('admin', 'manager', 'sales'));

create policy "authenticated can read documents"
on public.documents for select to authenticated
using (true);

create policy "admin manager sales create sales"
on public.documents for insert to authenticated
with check (
  public.current_app_role() in ('admin', 'manager')
  or (public.current_app_role() = 'sales' and kind = 'sale')
);

create policy "admin manager manage documents"
on public.documents for update to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));

create policy "authenticated can read movements"
on public.inventory_movements for select to authenticated
using (true);

create policy "admin manager warehouse create inventory movements"
on public.inventory_movements for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));

create policy "admin manager manage movements"
on public.inventory_movements for update to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));
