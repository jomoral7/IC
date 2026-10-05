-- Shipping guides at cost. No seed rows, accounts or historical purchase entries.
create schema if not exists private;

create table public.shipping_guides (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  price numeric(12,2) not null check (price > 0),
  stock integer not null default 0 check (stock >= 0),
  min_stock integer not null default 0 check (min_stock >= 0),
  receivable_account_id uuid not null references public.chart_of_accounts(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.documents add column shipping_total numeric(12,2) not null default 0 check (shipping_total >= 0);
create table public.sale_shipping_guides (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id),
  guide_id uuid not null references public.shipping_guides(id),
  guide_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price > 0),
  receivable_account_id uuid not null references public.chart_of_accounts(id),
  bank_account_id uuid not null references public.chart_of_accounts(id),
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(document_id,guide_id)
);
create index sale_shipping_guide_idx on public.sale_shipping_guides(guide_id);
create index shipping_receivable_idx on public.shipping_guides(receivable_account_id);
create index sale_shipping_receivable_idx on public.sale_shipping_guides(receivable_account_id);
create index sale_shipping_bank_idx on public.sale_shipping_guides(bank_account_id);
alter table public.shipping_guides enable row level security;
alter table public.sale_shipping_guides enable row level security;
grant select,insert,update,delete on public.shipping_guides,public.sale_shipping_guides to authenticated;
create policy "Read shipping guides" on public.shipping_guides for select to authenticated using (true);
create policy "Manage shipping guides" on public.shipping_guides for all to authenticated
  using ((select public.current_app_role()) in ('admin','manager','warehouse'))
  with check ((select public.current_app_role()) in ('admin','manager','warehouse'));
create policy "Read shipping usage" on public.sale_shipping_guides for select to authenticated using (true);
create policy "Admin restore shipping usage" on public.sale_shipping_guides for all to authenticated
  using ((select public.current_app_role()) = 'admin') with check ((select public.current_app_role()) = 'admin');

create function private.validate_shipping_guide() returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op='UPDATE' and (old.price is distinct from new.price or old.receivable_account_id is distinct from new.receivable_account_id)
    and (old.stock>0 or exists(select 1 from public.sale_shipping_guides where guide_id=old.id)
      or exists(select 1 from public.journal_entries where source='shipping_purchase' and source_id=old.id)) then
    raise exception 'Crea otra referencia para cambiar costo o cuenta de guías con existencias o historial';
  end if;
  if not exists (select 1 from public.chart_of_accounts where id=new.receivable_account_id and active and is_postable and type='asset' and coalesce(system_key,'') not in ('bank','cash')) then
    raise exception 'Selecciona una cuenta por cobrar activa que acepte movimientos';
  end if;
  return new;
end $$;
revoke all on function private.validate_shipping_guide() from public,anon,authenticated;
create trigger validate_shipping_guide before insert or update of receivable_account_id,price on public.shipping_guides
  for each row execute function private.validate_shipping_guide();

create function public.receive_prepaid_shipping_guides(p_guide_id uuid,p_quantity integer) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.current_app_role()::text,'') not in ('admin','manager','warehouse') then
    raise exception 'No tienes permiso para registrar existencias de guías';
  end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'La cantidad debe ser un entero positivo'; end if;
  update public.shipping_guides set stock=stock+p_quantity where id=p_guide_id and active;
  if not found then raise exception 'La guía no existe o está inactiva'; end if;
end $$;
revoke all on function public.receive_prepaid_shipping_guides(uuid,integer) from public,anon;
grant execute on function public.receive_prepaid_shipping_guides(uuid,integer) to authenticated;

-- A new purchase posts its journal entry and increases quantities in one transaction.
create function public.record_shipping_guide_purchase(p_guide_id uuid,p_quantity integer,p_entry_date date) returns void
language plpgsql security invoker set search_path='' as $$
declare v_guide public.shipping_guides; v_bank uuid; v_amount numeric(12,2);
begin
  if auth.uid() is null or coalesce(public.current_app_role()::text,'') not in ('admin','manager') then raise exception 'No tienes permiso para registrar compras de guías'; end if;
  if p_quantity is null or p_quantity<=0 or p_entry_date is null then raise exception 'Revisa cantidad y fecha de compra'; end if;
  select * into v_guide from public.shipping_guides where id=p_guide_id and active for update;
  if not found then raise exception 'La guía no existe o está inactiva'; end if;
  if not exists(select 1 from public.chart_of_accounts where id=v_guide.receivable_account_id and active and is_postable and type='asset' and coalesce(system_key,'') not in ('bank','cash')) then raise exception 'La cuenta por recuperar no está disponible'; end if;
  select id into v_bank from public.chart_of_accounts where system_key='bank' and active and is_postable and type='asset';
  if v_bank is null then raise exception 'La cuenta Banco no está disponible'; end if;
  v_amount:=p_quantity*v_guide.price;
  perform public.post_journal_entry(p_entry_date,'Compra de '||p_quantity||' guías · '||v_guide.name,'shipping_purchase',v_guide.id,
    jsonb_build_array(jsonb_build_object('account_id',v_guide.receivable_account_id,'debit',v_amount,'credit',0,'description','Guías por recuperar'),
      jsonb_build_object('account_id',v_bank,'debit',0,'credit',v_amount,'description','Pago de guías')));
  update public.shipping_guides set stock=stock+p_quantity where id=v_guide.id;
end $$;
revoke all on function public.record_shipping_guide_purchase(uuid,integer,date) from public,anon;
grant execute on function public.record_shipping_guide_purchase(uuid,integer,date) to authenticated;

create function public.create_shipping_guide(p_form jsonb,p_record_purchase boolean,p_entry_date date)
returns public.shipping_guides language plpgsql security invoker set search_path='' as $$
declare v_input public.shipping_guides; v_saved public.shipping_guides;
begin
  if auth.uid() is null or coalesce(public.current_app_role()::text,'') not in ('admin','manager','warehouse') then raise exception 'No tienes permiso para crear guías'; end if;
  if p_record_purchase is null then raise exception 'Selecciona el tipo de entrada inicial'; end if;
  v_input:=jsonb_populate_record(null::public.shipping_guides,p_form);
  if v_input.stock is null or v_input.stock<0 then raise exception 'Revisa las existencias iniciales'; end if;
  insert into public.shipping_guides(name,price,stock,min_stock,receivable_account_id)
    values(v_input.name,v_input.price,case when p_record_purchase then 0 else v_input.stock end,v_input.min_stock,v_input.receivable_account_id) returning * into v_saved;
  if p_record_purchase and v_input.stock>0 then
    perform public.record_shipping_guide_purchase(v_saved.id,v_input.stock,p_entry_date);
    select * into v_saved from public.shipping_guides where id=v_saved.id;
  end if;
  return v_saved;
end $$;
revoke all on function public.create_shipping_guide(jsonb,boolean,date) from public,anon;
grant execute on function public.create_shipping_guide(jsonb,boolean,date) to authenticated;

-- The controlled RPC needs to deduct stock for sellers, who cannot edit the catalog.
-- It checks identity/role, trusts no client amounts, locks rows, and commits with the document.
create function public.create_sale_with_shipping_guides(p_document jsonb,p_guides jsonb,p_bank_received boolean)
returns public.documents language plpgsql security definer set search_path = '' as $$
declare
  v_document public.documents; v_input public.documents; v_guide public.shipping_guides;
  v_item jsonb; v_quantity integer; v_bank uuid; v_total numeric(12,2):=0; v_lines jsonb:='[]';
begin
  if auth.uid() is null or coalesce(public.current_app_role()::text,'') not in ('admin','manager','sales') then
    raise exception 'No tienes permiso para registrar ventas con guías';
  end if;
  if p_bank_received is distinct from true then raise exception 'Confirma el cobro de las guías en Banco'; end if;
  if p_guides is null or jsonb_typeof(p_guides)<>'array' then raise exception 'Selección de guías inválida'; end if;
  if jsonb_array_length(p_guides)=0 or jsonb_array_length(p_guides)>100 then raise exception 'Selecciona al menos una guía'; end if;
  if exists (select 1 from jsonb_array_elements(p_guides) x group by x->>'guide_id' having count(*)>1) then raise exception 'No repitas una guía en la venta'; end if;
  select id into v_bank from public.chart_of_accounts where system_key='bank' and active and is_postable and type='asset';
  if v_bank is null then raise exception 'La cuenta Banco no está disponible'; end if;
  v_input:=jsonb_populate_record(null::public.documents,p_document);
  if v_input.kind::text is distinct from 'sale' or v_input.total is null or v_input.total<0 then raise exception 'Venta inválida'; end if;
  insert into public.documents(kind,document_number,created_by,created_by_name,party_id,customer_name,location_id,status,payment_terms,subtotal,discount,tax,total,paid_amount)
    values('sale',v_input.document_number,auth.uid(),v_input.created_by_name,v_input.party_id,v_input.customer_name,v_input.location_id,v_input.status,v_input.payment_terms,v_input.subtotal,v_input.discount,v_input.tax,v_input.total,v_input.paid_amount)
    returning * into v_document;
  for v_item in select x from jsonb_array_elements(p_guides) x order by x->>'guide_id' loop
    if (v_item->>'quantity') is null or (v_item->>'quantity')::numeric<>trunc((v_item->>'quantity')::numeric) then raise exception 'La cantidad de guías debe ser entera'; end if;
    v_quantity:=(v_item->>'quantity')::integer;
    select * into v_guide from public.shipping_guides where id=(v_item->>'guide_id')::uuid for update;
    if not found or not v_guide.active or v_quantity is null or v_quantity<=0 or v_quantity>v_guide.stock then raise exception 'No hay suficientes guías disponibles'; end if;
    if (v_item->>'unit_price')::numeric is distinct from v_guide.price then raise exception 'El precio de la guía cambió. Recarga e intenta de nuevo'; end if;
    if not exists (select 1 from public.chart_of_accounts where id=v_guide.receivable_account_id and active and is_postable and type='asset' and coalesce(system_key,'') not in ('bank','cash')) then raise exception 'La cuenta por cobrar de la guía no está disponible'; end if;
    update public.shipping_guides set stock=stock-v_quantity where id=v_guide.id;
    insert into public.sale_shipping_guides(document_id,guide_id,guide_name,quantity,unit_price,receivable_account_id,bank_account_id)
      values(v_document.id,v_guide.id,v_guide.name,v_quantity,v_guide.price,v_guide.receivable_account_id,v_bank);
    v_total:=v_total+v_quantity*v_guide.price;
    v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_guide.receivable_account_id,'debit',0,'credit',v_quantity*v_guide.price,'description',v_guide.name));
  end loop;
  v_lines:=jsonb_build_array(jsonb_build_object('account_id',v_bank,'debit',v_total,'credit',0,'description','Cobro de guías de envío'))||v_lines;
  perform public.post_journal_entry(v_document.created_at::date,'Guías de envío · '||v_document.document_number,'shipping_collection',v_document.id,v_lines);
  update public.documents set shipping_total=v_total where id=v_document.id returning * into v_document;
  return v_document;
end $$;
revoke all on function public.create_sale_with_shipping_guides(jsonb,jsonb,boolean) from public,anon;
grant execute on function public.create_sale_with_shipping_guides(jsonb,jsonb,boolean) to authenticated;

-- A first cancellation returns guide stock and reverses exactly the original accounts/amounts.
create function private.reverse_sale_shipping_guides() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_use public.sale_shipping_guides; v_lines jsonb:='[]';
begin
  if old.voided_at is not null or new.voided_at is null then return new; end if;
  if not exists(select 1 from public.sale_shipping_guides where document_id=new.id and reversed_at is null) then return new; end if;
  if auth.uid() is null or coalesce(public.current_app_role()::text,'') not in ('admin','manager') then raise exception 'No tienes permiso para anular guías'; end if;
  for v_use in select * from public.sale_shipping_guides where document_id=new.id and reversed_at is null order by guide_id for update loop
    update public.shipping_guides set stock=stock+v_use.quantity where id=v_use.guide_id;
    update public.sale_shipping_guides set reversed_at=now() where id=v_use.id;
    v_lines:=v_lines||jsonb_build_array(
      jsonb_build_object('account_id',v_use.receivable_account_id,'debit',v_use.quantity*v_use.unit_price,'credit',0,'description','Reversa guía '||v_use.guide_name),
      jsonb_build_object('account_id',v_use.bank_account_id,'debit',0,'credit',v_use.quantity*v_use.unit_price,'description','Reversa cobro guía'));
  end loop;
  perform public.post_journal_entry(current_date,'Anulación guías · '||new.document_number,'shipping_void',new.id,v_lines);
  return new;
end $$;
revoke all on function private.reverse_sale_shipping_guides() from public,anon,authenticated;
create trigger reverse_sale_shipping_guides after update of voided_at on public.documents
  for each row execute function private.reverse_sale_shipping_guides();
