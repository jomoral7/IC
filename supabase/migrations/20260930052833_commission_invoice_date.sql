-- Las comisiones reconocidas por primera vez pertenecen a la fecha de su factura.
-- La fecha de creación del asiento se conserva para auditoría.
create or replace function public.reconcile_seller_commission_accounting()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target numeric(12,2);
  v_delta numeric(12,2);
  v_expense uuid;
  v_payable uuid;
  v_entry uuid;
  v_entry_date date;
begin
  if new.status = 'cancelled' and tg_op = 'UPDATE' and old.status = 'paid' then
    v_target := new.accounted_amount;
  elsif new.status = 'cancelled' then
    v_target := 0;
  elsif new.status in ('pending', 'paid') then
    v_target := round(new.commission_amount, 2);
  else
    v_target := 0;
  end if;

  v_delta := round(v_target - new.accounted_amount, 2);
  if v_delta = 0 then
    return new;
  end if;

  select id into v_expense from public.chart_of_accounts
  where code = '5210' and active and is_postable;
  select id into v_payable from public.chart_of_accounts
  where code = '2103' and active and is_postable;
  if v_expense is null or v_payable is null then
    raise exception 'No están activas las cuentas 5210 y 2103 para comisiones';
  end if;

  v_entry_date := coalesce(new.created_at::date, current_date);
  if v_delta > 0 and new.accounted_amount = 0 then
    select d.created_at::date into v_entry_date
    from public.documents d where d.id = new.document_id;
    v_entry_date := coalesce(v_entry_date, new.created_at::date, current_date);
  end if;

  insert into public.journal_entries(entry_date, memo, source, source_id, created_by)
  values (
    v_entry_date,
    case when v_delta > 0 then 'Comisión devengada' else 'Ajuste de comisión devengada' end
      || ' · factura ' || coalesce((select d.document_number from public.documents d where d.id = new.document_id), new.document_id::text),
    case when tg_op = 'INSERT' and new.accounted_amount = 0 then 'commission_accrual' else 'commission_adjustment' end,
    new.id,
    (select auth.uid())
  ) returning id into v_entry;

  if v_delta > 0 then
    insert into public.journal_lines(entry_id, account_id, debit, credit, description)
    values
      (v_entry, v_expense, v_delta, 0, 'Gastos por comisiones sobre ventas'),
      (v_entry, v_payable, 0, v_delta, 'Comisiones por pagar');
  else
    insert into public.journal_lines(entry_id, account_id, debit, credit, description)
    values
      (v_entry, v_payable, abs(v_delta), 0, 'Reversión de comisiones por pagar'),
      (v_entry, v_expense, 0, abs(v_delta), 'Reversión de gasto por comisión');
  end if;

  new.accounted_amount := v_target;
  return new;
end;
$function$;

update public.journal_entries je
set entry_date = d.created_at::date
from public.seller_commissions sc
join public.documents d on d.id = sc.document_id
where je.source = 'commission_accrual'
  and je.source_id = sc.id
  and je.entry_date is distinct from d.created_at::date;
