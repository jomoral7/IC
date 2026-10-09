-- Allow any active postable account, except inventory itself, to fund a purchase batch.
-- Asset and expense accounts are credited against their available debit balance.
create or replace function public.record_purchase_batch(
  p_supplier_id uuid, p_location_id uuid, p_entry_date date,
  p_lines jsonb, p_freight numeric, p_funding jsonb, p_request_id uuid default null
) returns uuid language plpgsql security invoker set search_path = '' as $fn$
declare
  v_document uuid; v_number text; v_inventory uuid; v_account public.chart_of_accounts;
  v_line jsonb; v_payment jsonb; v_product public.products; v_request public.stock_requests;
  v_qty integer; v_unit numeric(12,2); v_raw_qty numeric; v_raw_unit numeric;
  v_base numeric(12,2):=0; v_total numeric(12,2);
  v_freight numeric(12,2); v_allocated numeric(12,2):=0; v_line_freight numeric(12,2);
  v_credit numeric(12,2):=0; v_amount numeric(12,2); v_paid numeric(12,2):=0;
  v_reclassified numeric(12,2):=0;
  v_advance uuid; v_original numeric(12,2); v_used numeric(12,2); v_balance numeric(12,2);
  v_lines_count integer; v_index integer:=0; v_stock integer; v_old_stock integer;
  v_avg numeric(12,2); v_landed_unit numeric(12,2); v_journal jsonb:='[]'::jsonb;
begin
  if auth.uid() is null or coalesce(public.current_app_role()::text,'') not in ('admin','manager') then
    raise exception 'Solo administración puede registrar compras';
  end if;
  if p_entry_date is null or p_location_id is null or p_freight is null or p_freight < 0
    or p_freight <> round(p_freight,2) then raise exception 'Revisa la fecha, sucursal y flete'; end if;
  if not exists(select 1 from public.inventory_locations where id=p_location_id) then raise exception 'Sucursal inválida'; end if;
  if p_supplier_id is not null and not exists(select 1 from public.parties where id=p_supplier_id and kind='supplier') then
    raise exception 'Proveedor inválido';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines)>100
    or jsonb_typeof(p_funding) <> 'array' or jsonb_array_length(p_funding)=0 then
    raise exception 'Selecciona productos y formas de pago';
  end if;
  if exists(select 1 from jsonb_array_elements(p_lines) l group by l->>'product_id' having count(*)>1) then
    raise exception 'No repitas el mismo producto en el lote';
  end if;
  if exists(select 1 from jsonb_array_elements(p_funding) f
    where nullif(f->>'advance_entry_id','') is not null
    group by f->>'advance_entry_id',f->>'account_id' having count(*)>1) then
    raise exception 'No repitas la misma cuenta de una partida previa dentro del lote';
  end if;
  v_lines_count:=jsonb_array_length(p_lines);
  select id into v_inventory from public.chart_of_accounts where system_key='inventory' and active and is_postable;
  if v_inventory is null then raise exception 'No existe la cuenta activa de inventario'; end if;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_raw_qty:=(v_line->>'qty')::numeric;
    v_raw_unit:=(v_line->>'unit_cost')::numeric;
    if v_raw_qty is null or v_raw_qty<=0 or v_raw_qty<>trunc(v_raw_qty) or v_raw_unit is null or v_raw_unit<0
      or v_raw_unit<>round(v_raw_unit,2) then raise exception 'Cantidad o costo de producto inválido'; end if;
    v_qty:=v_raw_qty; v_unit:=v_raw_unit;
    if not exists(select 1 from public.products where id=(v_line->>'product_id')::uuid and active) then
      raise exception 'Un producto ya no está activo'; end if;
    v_base:=v_base+v_qty*v_unit;
  end loop;
  if v_base<=0 then raise exception 'El lote debe tener un costo de productos mayor a cero'; end if;
  v_freight:=p_freight; v_total:=v_base+v_freight;
  if p_request_id is not null then
    select * into v_request from public.stock_requests where id=p_request_id for update;
    if not found or v_request.status not in ('pending','ordered','partial') or v_lines_count<>1
      or v_request.product_id<>(p_lines->0->>'product_id')::uuid
      or v_request.requested_quantity-coalesce(v_request.received_quantity,0)<(p_lines->0->>'qty')::integer then
      raise exception 'El pedido ya no permite esta recepción';
    end if;
    if v_request.supplier_id is distinct from p_supplier_id then raise exception 'El proveedor del pedido cambió'; end if;
  end if;
  for v_payment in select value from jsonb_array_elements(p_funding) loop
    v_amount:=(v_payment->>'amount')::numeric;
    if v_amount is null or v_amount<=0 or v_amount<>round(v_amount,2) then raise exception 'Monto de pago inválido'; end if;
    select * into v_account from public.chart_of_accounts
      where id=(v_payment->>'account_id')::uuid and active and is_postable for update;
    if not found then raise exception 'Cuenta de pago inválida'; end if;
    if v_account.system_key='inventory' then raise exception 'La cuenta de inventario no puede cubrir su propia entrada'; end if;
    v_advance:=nullif(v_payment->>'advance_entry_id','')::uuid;
    if v_account.system_key in ('bank','cash') then
      if v_advance is not null then raise exception 'Banco y Caja no usan anticipos'; end if;
      v_paid:=v_paid+v_amount;
    elsif v_account.type in ('asset','expense') then
      select coalesce(sum(jl.debit-jl.credit),0) into v_balance from public.journal_lines jl
        where jl.account_id=v_account.id;
      if v_balance<v_amount then
        raise exception 'La cuenta % no tiene saldo suficiente: disponible L %, solicitado L %',v_account.code,v_balance,v_amount;
      end if;
      v_paid:=v_paid+v_amount;
    elsif v_account.system_key='accounts_payable' and v_account.type='liability' then
      if v_advance is not null or p_supplier_id is null then raise exception 'Las cuentas por pagar requieren proveedor'; end if;
    end if;
    v_credit:=v_credit+v_amount;
  end loop;
  if v_credit<>v_total then raise exception 'Debe distribuir exactamente L % entre las cuentas; distribuido L %',v_total,v_credit; end if;
  v_number:='C-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
  insert into public.documents(kind,document_number,party_id,location_id,status,payment_terms,subtotal,total,paid_amount,created_by)
    values('purchase',v_number,p_supplier_id,p_location_id,case when v_paid=v_total then 'paid'::public.document_status else 'partial'::public.document_status end,
      case when v_paid=v_total then 'cash'::public.payment_terms else 'credit'::public.payment_terms end,
      v_base,v_total,v_paid,auth.uid()) returning id into v_document;
  for v_line in select value from jsonb_array_elements(p_lines) loop
    v_index:=v_index+1;
    v_qty:=(v_line->>'qty')::integer; v_unit:=(v_line->>'unit_cost')::numeric;
    select * into v_product from public.products where id=(v_line->>'product_id')::uuid for update;
    if v_index=v_lines_count then v_line_freight:=v_freight-v_allocated;
    else v_line_freight:=round(v_freight*(v_qty*v_unit)/v_base,2); end if;
    v_allocated:=v_allocated+v_line_freight;
    v_landed_unit:=round(v_unit+v_line_freight/v_qty,2);
    select coalesce(sum(quantity),0) into v_old_stock from public.stock_levels where product_id=v_product.id;
    v_avg:=round((v_old_stock*v_product.real_cost+v_qty*v_unit+v_line_freight)/(v_old_stock+v_qty),2);
    insert into public.document_items(document_id,product_id,quantity,unit_cost,unit_price,line_total,freight_allocated)
      values(v_document,v_product.id,v_qty,v_landed_unit,v_product.sale_price,v_qty*v_unit+v_line_freight,v_line_freight);
    insert into public.stock_levels(product_id,location_id,quantity) values(v_product.id,p_location_id,v_qty)
      on conflict(product_id,location_id) do update set quantity=public.stock_levels.quantity+excluded.quantity
      returning quantity into v_stock;
    update public.products set real_cost=v_avg,cost=v_avg,supplier_id=coalesce(p_supplier_id,supplier_id) where id=v_product.id;
    insert into public.inventory_movements(product_id,location_id,document_id,movement_type,quantity,unit_cost,unit_price,notes,created_by)
      values(v_product.id,p_location_id,v_document,'purchase',v_qty,v_landed_unit,v_product.sale_price,
        'Entrada lote '||v_number||'; flete asignado L '||v_line_freight,auth.uid());
  end loop;
  if p_request_id is not null then
    update public.stock_requests set received_quantity=coalesce(received_quantity,0)+(p_lines->0->>'qty')::integer,
      status=case when coalesce(received_quantity,0)+(p_lines->0->>'qty')::integer>=requested_quantity
        then 'received'::public.stock_request_status else 'partial'::public.stock_request_status end,
      received_at=now() where id=p_request_id;
  end if;
  v_journal:=jsonb_build_array(jsonb_build_object('account_id',v_inventory,'debit',v_total,'credit',0,'description','Mercadería y flete de compra'));
  for v_payment in select value from jsonb_array_elements(p_funding) loop
    v_amount:=(v_payment->>'amount')::numeric;
    v_advance:=nullif(v_payment->>'advance_entry_id','')::uuid;
    insert into public.purchase_funding(document_id,account_id,amount,advance_entry_id)
      values(v_document,(v_payment->>'account_id')::uuid,v_amount,v_advance);
    v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',(v_payment->>'account_id')::uuid,
      'debit',0,'credit',v_amount,'description','Cuenta aplicada a compra'));
  end loop;
  perform public.post_journal_entry(p_entry_date,'Compra '||v_number,'purchase',v_document,v_journal);
  return v_document;
end $fn$;


