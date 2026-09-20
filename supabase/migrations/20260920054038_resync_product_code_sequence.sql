-- El inventario inicial ya ocupaba IC-000001...IC-000408 antes de crear la secuencia.
-- Alineamos la siguiente referencia con el codigo mas alto para no reutilizar un SKU.
do $$
declare
  latest_code bigint;
begin
  select coalesce(max((regexp_match(coalesce(internal_code, sku), '([0-9]+)$'))[1]::bigint), 0)
    into latest_code
  from public.products
  where coalesce(internal_code, sku) ~ '^IC-[0-9]+$';

  perform setval('public.product_internal_code_seq', greatest(latest_code, 1), true);
end;
$$;
