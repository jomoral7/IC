-- El par técnico (devengo fantasma y su reversión) deja el saldo neto correcto,
-- pero infla las columnas brutas del Libro Mayor. Se archiva íntegro en auditoría
-- y se retira solo ese par; el devengo real y el pago siguen en los libros.
do $cleanup$
declare
  v_ghost public.journal_entries%rowtype;
  v_correction public.journal_entries%rowtype;
  v_candidates integer;
  v_ghost_lines record;
  v_correction_lines record;
begin
  select count(*) into v_candidates
  from public.journal_entries je
  where je.source = 'bonus_accrual'
    and not exists (select 1 from public.seller_bonus_payments b where b.id = je.source_id)
    and exists (select 1 from public.journal_entries paid
      where paid.source = 'bonus_payment' and paid.created_at = je.created_at)
    and exists (select 1 from public.journal_entries correction
      where correction.source = 'bonus_adjustment'
        and correction.source_id = je.source_id
        and correction.memo like 'Corrección de devengo duplicado al pagar bono%');
  if v_candidates = 0 then return; end if;
  if v_candidates <> 1 then raise exception 'Hay % pares de bono para revisar antes de limpiar', v_candidates; end if;

  select je.* into strict v_ghost
  from public.journal_entries je
  where je.source = 'bonus_accrual'
    and not exists (select 1 from public.seller_bonus_payments b where b.id = je.source_id)
    and exists (select 1 from public.journal_entries paid
      where paid.source = 'bonus_payment' and paid.created_at = je.created_at)
    and exists (select 1 from public.journal_entries correction
      where correction.source = 'bonus_adjustment'
        and correction.source_id = je.source_id
        and correction.memo like 'Corrección de devengo duplicado al pagar bono%');
  select correction.* into strict v_correction
  from public.journal_entries correction
  where correction.source = 'bonus_adjustment'
    and correction.source_id = v_ghost.source_id
    and correction.memo like 'Corrección de devengo duplicado al pagar bono%';

  select count(*) as line_count,
    sum(jl.debit) as debit, sum(jl.credit) as credit,
    sum(case when a.code = '5213' then jl.debit else 0 end) as expense_debit,
    sum(case when a.code = '2104' then jl.credit else 0 end) as payable_credit
  into v_ghost_lines
  from public.journal_lines jl join public.chart_of_accounts a on a.id = jl.account_id
  where jl.entry_id = v_ghost.id;
  select count(*) as line_count,
    sum(jl.debit) as debit, sum(jl.credit) as credit,
    sum(case when a.code = '2104' then jl.debit else 0 end) as payable_debit,
    sum(case when a.code = '5213' then jl.credit else 0 end) as expense_credit
  into v_correction_lines
  from public.journal_lines jl join public.chart_of_accounts a on a.id = jl.account_id
  where jl.entry_id = v_correction.id;
  if v_ghost.entry_date <> v_correction.entry_date
    or v_ghost_lines.line_count <> 2 or v_correction_lines.line_count <> 2
    or v_ghost_lines.expense_debit <= 0
    or v_ghost_lines.expense_debit <> v_ghost_lines.payable_credit
    or v_ghost_lines.debit <> v_ghost_lines.expense_debit
    or v_ghost_lines.credit <> v_ghost_lines.payable_credit
    or v_correction_lines.payable_debit <> v_ghost_lines.payable_credit
    or v_correction_lines.expense_credit <> v_ghost_lines.expense_debit
    or v_correction_lines.debit <> v_correction_lines.payable_debit
    or v_correction_lines.credit <> v_correction_lines.expense_credit then
    raise exception 'Los asientos de corrección del bono no forman un par exacto';
  end if;

  insert into public.audit_log(user_name, action, detail)
  values ('Sistema', 'Corrección de bono duplicado',
    jsonb_build_object(
      'reason', 'Devengo fantasma generado por BEFORE INSERT durante ON CONFLICT al pagar el bono',
      'ghost_entry', to_jsonb(v_ghost),
      'ghost_lines', (select jsonb_agg(to_jsonb(jl)) from public.journal_lines jl where jl.entry_id = v_ghost.id),
      'correction_entry', to_jsonb(v_correction),
      'correction_lines', (select jsonb_agg(to_jsonb(jl)) from public.journal_lines jl where jl.entry_id = v_correction.id)
    )::text);
  delete from public.journal_entries where id in (v_ghost.id, v_correction.id);
end;
$cleanup$;
