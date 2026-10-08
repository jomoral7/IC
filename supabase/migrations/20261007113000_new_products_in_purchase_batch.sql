-- Create new references and receive their stock in the same purchase transaction.
-- Existing references continue through record_purchase_batch unchanged.
create function public.record_purchase_batch_with_new_products(
  p_supplier_id uuid, p_location_id uuid, p_entry_date date,
  p_lines jsonb, p_freight numeric, p_funding jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $fn$
declare
  v_line jsonb; v_new jsonb; v_lines jsonb := '[]'::jsonb;
  v_id uuid; v_code text; v_name text; v_category text;
  v_price numeric; v_cost numeric; v_min numeric; v_creator text;
begin
  if auth.uid() is null or coalesce(public.current_app_role()::text,'') not in ('admin','manager') then
    raise exception 'Solo administración puede registrar compras';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 100 then
    raise exception 'Selecciona entre 1 y 100 productos';
  end if;
  select full_name into v_creator from public.profiles where id = auth.uid();
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_new := v_line->'new_product';
    if v_new is null then
      if nullif(v_line->>'product_id','') is null then raise exception 'Falta una referencia del lote'; end if;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id',v_line->>'product_id','qty',v_line->'qty','unit_cost',v_line->'unit_cost'));
      continue;
    end if;
    if jsonb_typeof(v_new) <> 'object' then raise exception 'Datos de producto inválidos'; end if;
    v_name := nullif(btrim(v_new->>'name'),'');
    v_category := coalesce(btrim(v_new->>'category'),'');
    v_price := (v_new->>'sale_price')::numeric;
    v_cost := (v_line->>'unit_cost')::numeric;
    v_min := coalesce((v_new->>'min_stock')::numeric,0);
    if v_name is null or v_price is null or v_price <= 0 or v_price <> round(v_price,2)
      or v_cost is null or v_cost <= 0 or v_cost <> round(v_cost,2)
      or v_min < 0 or v_min <> trunc(v_min) then
      raise exception 'Revisa nombre, costo, precio y mínimo de la nueva referencia';
    end if;
    v_code := public.next_product_internal_code();
    insert into public.products(
      sku,name,category,barcode,min_stock,cost,price,real_cost,sale_price,supplier_id,
      brand,size,color,description,gender,season,internal_code,qr_payload,
      active,created_by_name,updated_by_name,updated_at
    ) values (
      v_code,v_name,v_category,v_code,v_min::integer,v_cost,v_price,v_cost,v_price,p_supplier_id,
      nullif(v_new->>'brand',''),nullif(v_new->>'size',''),nullif(v_new->>'color',''),
      nullif(v_new->>'description',''),nullif(v_new->>'gender',''),nullif(v_new->>'season',''),
      v_code,v_code,true,v_creator,v_creator,now()
    ) returning id into v_id;
    if (v_line->>'qty')::numeric > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id',v_id,'qty',v_line->'qty','unit_cost',v_line->'unit_cost'));
    elsif (v_line->>'qty')::numeric <> 0 then
      raise exception 'Cantidad de variante inválida';
    end if;
  end loop;
  return public.record_purchase_batch(p_supplier_id,p_location_id,p_entry_date,v_lines,p_freight,p_funding,null);
end $fn$;

revoke all on function public.record_purchase_batch_with_new_products(uuid,uuid,date,jsonb,numeric,jsonb) from public,anon;
grant execute on function public.record_purchase_batch_with_new_products(uuid,uuid,date,jsonb,numeric,jsonb) to authenticated;
