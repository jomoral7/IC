create or replace function public.assign_invoice_seller(
  p_document_id uuid,
  p_seller_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_document public.documents%rowtype;
  v_seller public.sellers%rowtype;
  v_commission public.seller_commissions%rowtype;
  v_base numeric(12,2);
  v_amount numeric(12,2);
  v_status text;
  v_old_seller uuid;
begin
  if (select auth.uid()) is null or coalesce((select public.current_app_role())::text, '') not in ('admin', 'manager') then
    raise exception 'Solo administración puede asignar el vendedor de una factura';
  end if;

  select * into v_document
  from public.documents
  where id = p_document_id and kind = 'sale' and voided_at is null
  for update;
  if not found then raise exception 'La factura no existe, no es una venta o está anulada'; end if;

  select * into v_seller from public.sellers where id = p_seller_id and active;
  if not found then raise exception 'El vendedor no existe o está inactivo'; end if;

  v_base := greatest(0, round(coalesce(v_document.subtotal, v_document.total) - coalesce(v_document.discount, 0), 2));
  v_amount := round(v_base * v_seller.commission_rate, 2);
  v_status := case when v_document.payment_terms = 'credit' and v_document.paid_amount < v_document.total then 'hold' else 'pending' end;

  select * into v_commission
  from public.seller_commissions
  where document_id = p_document_id
  order by created_at
  limit 1
  for update;

  if found then
    v_old_seller := v_commission.seller_id;
    if v_commission.status = 'paid' then
      raise exception 'No se puede cambiar el vendedor de una factura cuya comisión ya fue pagada';
    end if;
    update public.seller_commissions
    set seller_id = p_seller_id,
        base_amount = v_base,
        rate = v_seller.commission_rate,
        commission_amount = v_amount,
        status = v_status,
        created_at = v_document.created_at
    where id = v_commission.id
    returning * into v_commission;
  else
    insert into public.seller_commissions(seller_id, document_id, base_amount, rate, commission_amount, status, created_at)
    values (p_seller_id, p_document_id, v_base, v_seller.commission_rate, v_amount, v_status, v_document.created_at)
    returning * into v_commission;
  end if;

  if v_old_seller is not null and v_old_seller <> p_seller_id then
    perform public.ensure_month_bonus(v_old_seller);
  end if;
  perform public.ensure_month_bonus(p_seller_id);
  return v_commission.id;
end;
$function$;

revoke all on function public.assign_invoice_seller(uuid, uuid) from public;
revoke execute on function public.assign_invoice_seller(uuid, uuid) from anon;
grant execute on function public.assign_invoice_seller(uuid, uuid) to authenticated;

create or replace function public.collect_credit_payment(
  p_document_id uuid,
  p_amount numeric,
  p_method text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_document public.documents%rowtype;
  v_payment_id uuid;
  v_cash_account uuid;
  v_bank_account uuid;
  v_receivable_account uuid;
  v_asset_account uuid;
  v_amount numeric(12,2);
  v_new_paid numeric(12,2);
begin
  if (select auth.uid()) is null or coalesce((select public.current_app_role())::text, '') not in ('admin', 'manager', 'sales') then
    raise exception 'No tienes permiso para registrar cobros';
  end if;
  if p_method not in ('cash', 'bank_deposit', 'bank_transfer') then
    raise exception 'Elige Caja, depósito bancario o transferencia bancaria';
  end if;
  if p_amount is null or p_amount <= 0 then raise exception 'El monto del cobro debe ser mayor que cero'; end if;

  select * into v_document
  from public.documents
  where id = p_document_id and kind = 'sale' and payment_terms = 'credit' and voided_at is null
  for update;
  if not found then raise exception 'La factura a crédito no existe o está anulada'; end if;

  v_amount := round(p_amount, 2);
  v_new_paid := round(v_document.paid_amount + v_amount, 2);
  if v_new_paid > v_document.total then
    raise exception 'El cobro supera el saldo pendiente de L %', round(v_document.total - v_document.paid_amount, 2);
  end if;

  select id into v_cash_account from public.chart_of_accounts where system_key = 'cash' and active and is_postable and type = 'asset';
  select id into v_bank_account from public.chart_of_accounts where system_key = 'bank' and active and is_postable and type = 'asset';
  select id into v_receivable_account from public.chart_of_accounts where system_key = 'accounts_receivable' and active and is_postable and type = 'asset';
  if v_receivable_account is null then raise exception 'No está activa la cuenta Cuentas por cobrar'; end if;
  v_asset_account := case when p_method = 'cash' then v_cash_account else v_bank_account end;
  if v_asset_account is null then raise exception 'No está activa la cuenta de Caja o Banco seleccionada'; end if;

  insert into public.payments(document_id, amount, method, created_by)
  values (p_document_id, v_amount, p_method, (select auth.uid()))
  returning id into v_payment_id;

  update public.documents
  set paid_amount = v_new_paid,
      status = case when v_new_paid >= total then 'paid'::public.document_status else 'partial'::public.document_status end
  where id = p_document_id;

  if v_new_paid >= v_document.total then
    update public.seller_commissions
    set status = 'pending'
    where document_id = p_document_id and status = 'hold';
  end if;

  perform public.post_journal_entry(
    current_date,
    'Cobro de crédito · Factura ' || v_document.document_number,
    'credit_collection',
    v_payment_id,
    jsonb_build_array(
      jsonb_build_object('account_id', v_asset_account, 'debit', v_amount, 'credit', 0, 'description', case when p_method = 'cash' then 'Cobro de factura en Caja' else 'Cobro de factura en Banco' end),
      jsonb_build_object('account_id', v_receivable_account, 'debit', 0, 'credit', v_amount, 'description', 'Disminución de Cuentas por cobrar')
    )
  );

  return v_payment_id;
end;
$function$;

revoke all on function public.collect_credit_payment(uuid, numeric, text) from public;
revoke execute on function public.collect_credit_payment(uuid, numeric, text) from anon;
grant execute on function public.collect_credit_payment(uuid, numeric, text) to authenticated;
