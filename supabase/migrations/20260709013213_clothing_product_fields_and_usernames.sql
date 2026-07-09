create sequence if not exists public.product_internal_code_seq start 1;

alter table public.profiles
  add column if not exists username text unique,
  add column if not exists active boolean not null default true;

update public.profiles
set username = split_part(lower(full_name), ' ', 1)
where username is null;

alter table public.products
  add column if not exists brand text,
  add column if not exists size text,
  add column if not exists color text,
  add column if not exists gender text,
  add column if not exists season text,
  add column if not exists internal_code text unique,
  add column if not exists qr_payload text;

update public.products
set internal_code = coalesce(internal_code, sku),
    qr_payload = coalesce(qr_payload, sku)
where internal_code is null or qr_payload is null;

create or replace function public.next_product_internal_code()
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select 'IC-' || lpad(nextval('public.product_internal_code_seq')::text, 6, '0')
$$;
