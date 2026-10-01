-- Pagar el bono ya devengado sin intentar insertarlo otra vez: un BEFORE INSERT
-- disparaba un asiento incluso cuando ON CONFLICT actualizaba la fila existente.
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

  select * into v_bonus from public.seller_bonus_payments
  where seller_id = p_seller_id and period = p_period for update;
  if not found then raise exception 'No hay un bono pendiente para este período; actualiza la pantalla'; end if;
  if v_bonus.status <> 'pending' then raise exception 'El bono ya fue pagado o no está pendiente'; end if;
  if v_bonus.goal_id <> v_goal.id or v_bonus.bonus <> v_goal.bonus then
    raise exception 'El bono pendiente cambió; actualiza la pantalla antes de pagar';
  end if;
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

revoke all on function public.pay_seller_bonus(uuid, uuid, date) from public;
revoke execute on function public.pay_seller_bonus(uuid, uuid, date) from anon;
grant execute on function public.pay_seller_bonus(uuid, uuid, date) to authenticated;

-- La fila fantasma de bono no existe en seller_bonus_payments. Se revierte
-- únicamente su asiento huérfano, dejando el asiento original y el pago intactos.
do $repair$
declare
  v_orphan record;
  v_payable uuid;
  v_expense uuid;
  v_reversal uuid;
begin
  select id into v_payable from public.chart_of_accounts where code = '2104';
  select id into v_expense from public.chart_of_accounts where code = '5213';
  if v_payable is null or v_expense is null then
    raise exception 'No se encontraron las cuentas 2104 y 5213 para corregir el bono';
  end if;

  for v_orphan in
    select je.id, je.source_id, je.entry_date, je.memo,
      count(*) as line_count,
      sum(jl.debit) as total_debit,
      sum(jl.credit) as total_credit,
      sum(case when jl.account_id = v_expense then jl.debit else 0 end) as expense_debit,
      sum(case when jl.account_id = v_payable then jl.credit else 0 end) as payable_credit
    from public.journal_entries je
    join public.journal_lines jl on jl.entry_id = je.id
    where je.source = 'bonus_accrual'
      and not exists (select 1 from public.seller_bonus_payments b where b.id = je.source_id)
      and exists (
        select 1 from public.journal_entries paid
        where paid.source = 'bonus_payment' and paid.created_at = je.created_at
      )
      and not exists (
        select 1 from public.journal_entries correction
        where correction.source = 'bonus_adjustment'
          and correction.source_id = je.source_id
          and correction.memo like 'Corrección de devengo duplicado al pagar bono%'
      )
    group by je.id
  loop
    if v_orphan.line_count <> 2 or v_orphan.expense_debit <= 0
      or v_orphan.expense_debit <> v_orphan.payable_credit
      or v_orphan.total_debit <> v_orphan.expense_debit
      or v_orphan.total_credit <> v_orphan.payable_credit then
      raise exception 'El devengo huérfano % requiere revisión manual', v_orphan.id;
    end if;

    insert into public.journal_entries(entry_date, memo, source, source_id, created_by)
    values (v_orphan.entry_date,
      'Corrección de devengo duplicado al pagar bono · ' || v_orphan.memo,
      'bonus_adjustment', v_orphan.source_id, null)
    returning id into v_reversal;
    insert into public.journal_lines(entry_id, account_id, debit, credit, description)
    values
      (v_reversal, v_payable, v_orphan.payable_credit, 0, 'Reversión de bonificación por pagar duplicada'),
      (v_reversal, v_expense, 0, v_orphan.expense_debit, 'Reversión de gasto por bono duplicado');
  end loop;
end;
$repair$;
