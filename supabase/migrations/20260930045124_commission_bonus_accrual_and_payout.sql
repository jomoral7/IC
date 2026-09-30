alter table public.seller_commissions
  add column if not exists accounted_amount numeric(12,2) not null default 0;

alter table public.seller_bonus_payments
  add column if not exists accounted_amount numeric(12,2) not null default 0,
  alter column paid_at drop not null;

update public.seller_bonus_payments
set paid_at = null
where status = 'pending';

create unique index if not exists journal_commission_accrual_once
  on public.journal_entries (source, source_id)
  where source = 'commission_accrual';

create unique index if not exists journal_commission_payment_once
  on public.journal_entries (source, source_id)
  where source = 'commission_payment';

create unique index if not exists journal_bonus_payment_once
  on public.journal_entries (source, source_id)
  where source = 'bonus_payment';

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

drop trigger if exists seller_commission_accounting on public.seller_commissions;
create trigger seller_commission_accounting
before insert or update of commission_amount, status on public.seller_commissions
for each row execute function public.reconcile_seller_commission_accounting();

create or replace function public.reconcile_seller_bonus_accounting()
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
  v_seller text;
begin
  if tg_op = 'DELETE' then
    if old.status = 'paid' then
      raise exception 'No se puede eliminar un bono pagado; conserve su historial contable';
    end if;
    v_target := 0;
    v_delta := round(v_target - old.accounted_amount, 2);
  else
    if new.status = 'pending' then
      v_target := round(new.bonus, 2);
    else
      v_target := new.accounted_amount;
    end if;
    v_delta := round(v_target - new.accounted_amount, 2);
  end if;

  if v_delta = 0 then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  select id into v_expense from public.chart_of_accounts
  where code = '5213' and active and is_postable;
  select id into v_payable from public.chart_of_accounts
  where code = '2104' and active and is_postable;
  if v_expense is null or v_payable is null then
    raise exception 'No están activas las cuentas 5213 y 2104 para bonificaciones';
  end if;
  select name into v_seller from public.sellers where id = case when tg_op = 'DELETE' then old.seller_id else new.seller_id end;

  insert into public.journal_entries(entry_date, memo, source, source_id, created_by)
  values (
    case when tg_op = 'DELETE' then old.period else new.period end,
    case when v_delta > 0 then 'Bono por metas devengado' else 'Ajuste de bono por metas devengado' end
      || ' · ' || coalesce(v_seller, 'Vendedor') || ' · '
      || case when tg_op = 'DELETE' then old.period else new.period end::text,
    case when tg_op = 'DELETE' then 'bonus_adjustment' else 'bonus_accrual' end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    (select auth.uid())
  ) returning id into v_entry;

  if v_delta > 0 then
    insert into public.journal_lines(entry_id, account_id, debit, credit, description)
    values
      (v_entry, v_expense, v_delta, 0, 'Gastos de ventas-Bonificaciones por metas'),
      (v_entry, v_payable, 0, v_delta, 'Bonificaciones por pagar a vendedores');
  else
    insert into public.journal_lines(entry_id, account_id, debit, credit, description)
    values
      (v_entry, v_payable, abs(v_delta), 0, 'Reversión de bonificación por pagar'),
      (v_entry, v_expense, 0, abs(v_delta), 'Reversión de gasto por bonificación');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  new.accounted_amount := v_target;
  return new;
end;
$function$;

drop trigger if exists seller_bonus_accounting on public.seller_bonus_payments;
create trigger seller_bonus_accounting
before insert or update of bonus, status on public.seller_bonus_payments
for each row execute function public.reconcile_seller_bonus_accounting();

drop trigger if exists seller_bonus_accounting_delete on public.seller_bonus_payments;
create trigger seller_bonus_accounting_delete
before delete on public.seller_bonus_payments
for each row execute function public.reconcile_seller_bonus_accounting();

create or replace function public.pay_seller_commission(p_commission_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_commission public.seller_commissions%rowtype;
  v_seller text;
  v_invoice text;
  v_payable uuid;
  v_bank uuid;
  v_entry uuid;
begin
  if coalesce((select public.current_app_role())::text, '') not in ('admin', 'manager') then
    raise exception 'Solo administración puede pagar comisiones';
  end if;
  select * into v_commission from public.seller_commissions where id = p_commission_id for update;
  if not found then raise exception 'No se encontró la comisión'; end if;
  if v_commission.status <> 'pending' then raise exception 'La comisión ya no está pendiente de pago'; end if;
  if v_commission.accounted_amount <> round(v_commission.commission_amount, 2) then
    raise exception 'La comisión todavía no está reconocida en contabilidad';
  end if;
  if exists(select 1 from public.documents where id = v_commission.document_id and voided_at is not null) then
    raise exception 'No se puede pagar la comisión de una factura anulada';
  end if;
  select id into v_payable from public.chart_of_accounts where code = '2103' and active and is_postable;
  select id into v_bank from public.chart_of_accounts where code = '1102' and active and is_postable;
  select name into v_seller from public.sellers where id = v_commission.seller_id;
  select document_number into v_invoice from public.documents where id = v_commission.document_id;
  if v_payable is null or v_bank is null then raise exception 'No están activas las cuentas por pagar o Banco'; end if;

  insert into public.journal_entries(entry_date, memo, source, source_id, created_by)
  values (current_date, 'Pago comisión ' || coalesce(v_seller, '') || ' · factura ' || coalesce(v_invoice, ''), 'commission_payment', v_commission.id, (select auth.uid()))
  returning id into v_entry;
  insert into public.journal_lines(entry_id, account_id, debit, credit, description)
  values
    (v_entry, v_payable, v_commission.commission_amount, 0, 'Comisiones por pagar'),
    (v_entry, v_bank, 0, v_commission.commission_amount, 'Pago de comisión desde Banco');
  update public.seller_commissions set status = 'paid', paid_at = now() where id = v_commission.id;
  return v_entry;
end;
$function$;

create or replace function public.pay_seller_bonus(p_seller_id uuid, p_goal_id uuid, p_period date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sales numeric(12,2);
  v_goal public.seller_goals%rowtype;
  v_bonus public.seller_bonus_payments%rowtype;
  v_payable uuid;
  v_bank uuid;
  v_entry uuid;
  v_seller text;
begin
  if coalesce((select public.current_app_role())::text, '') not in ('admin', 'manager') then
    raise exception 'Solo administración puede pagar bonificaciones';
  end if;
  select coalesce(sum(base_amount), 0) into v_sales
  from public.seller_commissions
  where seller_id = p_seller_id
    and status <> 'cancelled'
    and date_trunc('month', created_at) = date_trunc('month', p_period::timestamp);
  select * into v_goal from public.seller_goals
  where id = p_goal_id and seller_id = p_seller_id and active and min_sales <= v_sales;
  if not found then raise exception 'La meta seleccionada ya no se ha alcanzado'; end if;
  if exists (
    select 1 from public.seller_goals g
    where g.seller_id = p_seller_id and g.active and g.min_sales <= v_sales
      and g.min_sales > v_goal.min_sales
  ) then
    raise exception 'Hay una meta superior alcanzada; actualiza la pantalla antes de pagar';
  end if;

  insert into public.seller_bonus_payments(seller_id, goal_id, period, sales, bonus, status, paid_at)
  values (p_seller_id, v_goal.id, p_period, v_sales, v_goal.bonus, 'pending', null)
  on conflict (seller_id, period) do update
    set goal_id = excluded.goal_id, sales = excluded.sales, bonus = excluded.bonus
    where public.seller_bonus_payments.status = 'pending';

  select * into v_bonus from public.seller_bonus_payments
  where seller_id = p_seller_id and period = p_period for update;
  if not found then raise exception 'No se pudo localizar el bono del período'; end if;
  if v_bonus.status <> 'pending' then raise exception 'El bono ya fue pagado o no está pendiente'; end if;
  if v_bonus.accounted_amount <> round(v_bonus.bonus, 2) then
    raise exception 'El bono todavía no está reconocido en contabilidad';
  end if;

  select id into v_payable from public.chart_of_accounts where code = '2104' and active and is_postable;
  select id into v_bank from public.chart_of_accounts where code = '1102' and active and is_postable;
  select name into v_seller from public.sellers where id = p_seller_id;
  if v_payable is null or v_bank is null then raise exception 'No están activas las cuentas por pagar o Banco'; end if;

  insert into public.journal_entries(entry_date, memo, source, source_id, created_by)
  values (current_date, 'Pago bono ' || coalesce(v_seller, '') || ' · ' || p_period::text, 'bonus_payment', v_bonus.id, (select auth.uid()))
  returning id into v_entry;
  insert into public.journal_lines(entry_id, account_id, debit, credit, description)
  values
    (v_entry, v_payable, v_bonus.bonus, 0, 'Bonificaciones por pagar a vendedores'),
    (v_entry, v_bank, 0, v_bonus.bonus, 'Pago de bonificación desde Banco');
  update public.seller_bonus_payments set status = 'paid', paid_at = now() where id = v_bonus.id;
  return v_entry;
end;
$function$;

revoke all on function public.pay_seller_commission(uuid) from public;
revoke execute on function public.pay_seller_commission(uuid) from anon;
grant execute on function public.pay_seller_commission(uuid) to authenticated;
revoke all on function public.pay_seller_bonus(uuid, uuid, date) from public;
revoke execute on function public.pay_seller_bonus(uuid, uuid, date) from anon;
grant execute on function public.pay_seller_bonus(uuid, uuid, date) to authenticated;

-- Reconoce de forma idempotente las comisiones pendientes y bonos ya existentes.
update public.seller_commissions set commission_amount = commission_amount
where status = 'pending' and accounted_amount = 0;

update public.seller_bonus_payments set bonus = bonus
where status = 'pending' and accounted_amount = 0;
