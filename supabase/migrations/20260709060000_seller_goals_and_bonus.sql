alter table public.seller_commissions add column if not exists paid_at timestamptz;

create table if not exists public.seller_goals (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  name text not null default 'Meta',
  min_sales numeric(12,2) not null check (min_sales >= 0),
  bonus numeric(12,2) not null check (bonus >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.seller_bonus_payments (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  goal_id uuid not null references public.seller_goals(id) on delete cascade,
  period date not null,
  sales numeric(12,2) not null default 0,
  bonus numeric(12,2) not null default 0,
  status text not null default 'paid',
  paid_at timestamptz not null default now(),
  unique (seller_id, goal_id, period)
);

alter table public.seller_goals enable row level security;
alter table public.seller_bonus_payments enable row level security;

drop policy if exists "auth read seller goals" on public.seller_goals;
drop policy if exists "manage seller goals" on public.seller_goals;
drop policy if exists "auth read seller bonus" on public.seller_bonus_payments;
drop policy if exists "manage seller bonus" on public.seller_bonus_payments;

create policy "auth read seller goals" on public.seller_goals for select to authenticated using (true);
create policy "manage seller goals" on public.seller_goals for all to authenticated
  using (public.current_app_role() in ('admin','manager'))
  with check (public.current_app_role() in ('admin','manager'));

create policy "auth read seller bonus" on public.seller_bonus_payments for select to authenticated using (true);
create policy "manage seller bonus" on public.seller_bonus_payments for all to authenticated
  using (public.current_app_role() in ('admin','manager'))
  with check (public.current_app_role() in ('admin','manager'));
