create or replace function public.post_journal_entry(
  p_entry_date date,
  p_memo text,
  p_source text,
  p_source_id uuid,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_entry_id uuid;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
  v_line jsonb;
  v_account_id uuid;
  v_debit numeric;
  v_credit numeric;
begin
  if p_source = 'manual_entry' then
    if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
      raise exception 'La partida manual requiere al menos dos líneas';
    end if;

    for v_line in select * from jsonb_array_elements(p_lines)
    loop
      v_account_id := (v_line->>'account_id')::uuid;
      v_debit := coalesce((v_line->>'debit')::numeric, 0);
      v_credit := coalesce((v_line->>'credit')::numeric, 0);

      if v_debit < 0 or v_credit < 0 or ((v_debit > 0) = (v_credit > 0)) then
        raise exception 'Cada línea manual debe tener un monto positivo en Debe o en Haber';
      end if;

      if not exists (
        select 1
        from public.chart_of_accounts account
        where account.id = v_account_id
          and account.active
          and account.is_postable
      ) then
        raise exception 'La cuenta de la partida no existe, está inactiva o no acepta movimientos';
      end if;

      v_total_debit := v_total_debit + v_debit;
      v_total_credit := v_total_credit + v_credit;
    end loop;
  else
    for v_line in select * from jsonb_array_elements(p_lines)
    loop
      v_total_debit := v_total_debit + coalesce((v_line->>'debit')::numeric, 0);
      v_total_credit := v_total_credit + coalesce((v_line->>'credit')::numeric, 0);
    end loop;
  end if;

  if round(v_total_debit, 2) <> round(v_total_credit, 2) then
    raise exception 'Asiento desbalanceado: debe % <> haber %', v_total_debit, v_total_credit;
  end if;
  if v_total_debit = 0 then
    raise exception 'El asiento no tiene montos';
  end if;

  insert into public.journal_entries (entry_date, memo, source, source_id, created_by)
  values (p_entry_date, p_memo, coalesce(p_source, 'manual'), p_source_id, (select auth.uid()))
  returning id into v_entry_id;

  insert into public.journal_lines (entry_id, account_id, debit, credit, description)
  select v_entry_id,
         (elem->>'account_id')::uuid,
         coalesce((elem->>'debit')::numeric, 0),
         coalesce((elem->>'credit')::numeric, 0),
         elem->>'description'
  from jsonb_array_elements(p_lines) as elem;

  return v_entry_id;
end;
$function$;

revoke all on function public.post_journal_entry(date, text, text, uuid, jsonb) from public;
revoke execute on function public.post_journal_entry(date, text, text, uuid, jsonb) from anon;
grant execute on function public.post_journal_entry(date, text, text, uuid, jsonb) to authenticated;
