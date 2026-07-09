create type public.document_status as enum ('draft', 'issued', 'paid', 'partial', 'void');
create type public.payment_terms as enum ('cash', 'credit');
create type public.stock_request_status as enum ('pending', 'ordered', 'received', 'cancelled');
create type public.adjustment_reason as enum ('return', 'damaged', 'lost', 'found', 'manual_count', 'other');

alter table public.products
  add column if not exists real_cost numeric(12, 2) not null default 0 check (real_cost >= 0),
  add column if not exists sale_price numeric(12, 2) not null default 0 check (sale_price >= 0),
  add column if not exists qr_code text,
  add column if not exists supplier_id uuid references public.parties(id);

update public.products
set real_cost = cost,
    sale_price = price
where real_cost = 0 and sale_price = 0;

alter table public.parties
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists credit_limit numeric(12, 2) not null default 0 check (credit_limit >= 0),
  add column if not exists active boolean not null default true;

alter table public.documents
  add column if not exists status public.document_status not null default 'draft',
  add column if not exists payment_terms public.payment_terms not null default 'cash',
  add column if not exists due_date date,
  add column if not exists subtotal numeric(12, 2) not null default 0,
  add column if not exists discount numeric(12, 2) not null default 0 check (discount >= 0),
  add column if not exists tax numeric(12, 2) not null default 0 check (tax >= 0),
  add column if not exists paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  add column if not exists voided_at timestamptz,
  add column if not exists void_reason text,
  add column if not exists voided_by uuid references public.profiles(id);

create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id),
  name text not null,
  code text not null unique,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rate numeric(7, 4) not null check (rate >= 0 and rate <= 1),
  applies_to text not null default 'all',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.document_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  product_id uuid not null references public.products(id),
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  line_total numeric(12, 2) not null default 0 check (line_total >= 0),
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null default 'cash',
  reference text,
  paid_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.invoice_voids (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id),
  reason text not null,
  voided_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.stock_requests (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  location_id uuid references public.inventory_locations(id),
  min_quantity integer not null default 0 check (min_quantity >= 0),
  current_quantity integer not null default 0 check (current_quantity >= 0),
  requested_quantity integer not null check (requested_quantity > 0),
  status public.stock_request_status not null default 'pending',
  supplier_id uuid references public.parties(id),
  requested_by uuid references public.profiles(id),
  requested_at timestamptz not null default now(),
  ordered_at timestamptz,
  received_at timestamptz,
  notes text
);

create table public.stock_adjustments (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  location_id uuid not null references public.inventory_locations(id),
  reason public.adjustment_reason not null,
  quantity_delta integer not null check (quantity_delta <> 0),
  notes text,
  approved_by uuid references public.profiles(id),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.seller_commissions (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id),
  document_id uuid not null references public.documents(id),
  rule_id uuid references public.commission_rules(id),
  base_amount numeric(12, 2) not null default 0,
  rate numeric(7, 4) not null default 0,
  commission_amount numeric(12, 2) not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (seller_id, document_id)
);

create or replace view public.inventory_kardex
with (security_invoker = true)
as
select
  im.id,
  im.product_id,
  p.sku,
  p.name as product_name,
  im.location_id,
  l.name as location_name,
  im.document_id,
  d.document_number,
  im.movement_type,
  case
    when im.movement_type in ('purchase', 'adjustment_in', 'transfer') then im.quantity
    else -im.quantity
  end as signed_quantity,
  im.unit_cost,
  im.unit_price,
  im.notes,
  im.created_at,
  im.created_by
from public.inventory_movements im
join public.products p on p.id = im.product_id
join public.inventory_locations l on l.id = im.location_id
left join public.documents d on d.id = im.document_id;

alter table public.sellers enable row level security;
alter table public.commission_rules enable row level security;
alter table public.document_items enable row level security;
alter table public.payments enable row level security;
alter table public.invoice_voids enable row level security;
alter table public.stock_requests enable row level security;
alter table public.stock_adjustments enable row level security;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.inventory_kardex to authenticated;

create policy "authenticated read sellers" on public.sellers for select to authenticated using (true);
create policy "admin manager manage sellers" on public.sellers for all to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));

create policy "authenticated read commission rules" on public.commission_rules for select to authenticated using (true);
create policy "admin manager manage commission rules" on public.commission_rules for all to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));

create policy "authenticated read document items" on public.document_items for select to authenticated using (true);
create policy "admin manager sales create document items" on public.document_items for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager', 'sales'));
create policy "admin manager update document items" on public.document_items for update to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));

create policy "authenticated read payments" on public.payments for select to authenticated using (true);
create policy "admin manager sales create payments" on public.payments for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager', 'sales'));
create policy "admin manager update payments" on public.payments for update to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));

create policy "authenticated read invoice voids" on public.invoice_voids for select to authenticated using (true);
create policy "admin manager void invoices" on public.invoice_voids for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager'));

create policy "authenticated read stock requests" on public.stock_requests for select to authenticated using (true);
create policy "admin manager warehouse manage stock requests" on public.stock_requests for all to authenticated
using (public.current_app_role() in ('admin', 'manager', 'warehouse'))
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));

create policy "authenticated read stock adjustments" on public.stock_adjustments for select to authenticated using (true);
create policy "admin manager warehouse create stock adjustments" on public.stock_adjustments for insert to authenticated
with check (public.current_app_role() in ('admin', 'manager', 'warehouse'));
create policy "admin manager update stock adjustments" on public.stock_adjustments for update to authenticated
using (public.current_app_role() in ('admin', 'manager'))
with check (public.current_app_role() in ('admin', 'manager'));
