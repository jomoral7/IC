-- Un pedido puede recibirse en varias entregas. Conservamos solicitado, recibido y pendiente.
alter type public.stock_request_status add value if not exists 'partial';

alter table public.stock_requests
  add column if not exists received_quantity integer not null default 0
  check (received_quantity >= 0 and received_quantity <= requested_quantity);

update public.stock_requests
set received_quantity = requested_quantity
where status = 'received' and received_quantity = 0;

create index if not exists stock_requests_open_product_idx
  on public.stock_requests(product_id, status, requested_at desc);
