alter table public.sellers
  add column if not exists commission_rate numeric(7,4) not null default 0
  check (commission_rate >= 0 and commission_rate <= 1);
