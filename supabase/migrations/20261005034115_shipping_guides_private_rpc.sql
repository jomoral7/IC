-- Elevated stock access stays outside the exposed API schema.
alter function public.create_sale_with_shipping_guides(jsonb,jsonb,boolean) set schema private;
grant usage on schema private to authenticated;
revoke all on function private.create_sale_with_shipping_guides(jsonb,jsonb,boolean) from public,anon;
grant execute on function private.create_sale_with_shipping_guides(jsonb,jsonb,boolean) to authenticated;
create function public.create_sale_with_shipping_guides(p_document jsonb,p_guides jsonb,p_bank_received boolean)
returns public.documents language sql security invoker set search_path='' as $$
  select * from private.create_sale_with_shipping_guides(p_document,p_guides,p_bank_received);
$$;
revoke all on function public.create_sale_with_shipping_guides(jsonb,jsonb,boolean) from public,anon;
grant execute on function public.create_sale_with_shipping_guides(jsonb,jsonb,boolean) to authenticated;
