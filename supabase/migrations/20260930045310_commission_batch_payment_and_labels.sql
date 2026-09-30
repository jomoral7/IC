-- Backfilled commission records are first-recognition entries, not adjustments.
update public.journal_entries je
set source = 'commission_accrual'
where je.source = 'commission_adjustment'
  and je.memo like 'Comisión devengada · factura %'
  and exists (
    select 1 from public.seller_commissions sc
    where sc.id = je.source_id and sc.accounted_amount > 0
  );

create or replace function public.pay_seller_commissions(p_commission_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
  v_count integer := 0;
begin
  if coalesce((select public.current_app_role())::text, '') not in ('admin', 'manager') then
    raise exception 'Solo administración puede pagar comisiones';
  end if;
  if p_commission_ids is null or cardinality(p_commission_ids) = 0 then
    raise exception 'Selecciona al menos una comisión';
  end if;
  if exists(select 1 from unnest(p_commission_ids) as ids(id) where id is null) then
    raise exception 'La selección contiene una comisión inválida';
  end if;
  if cardinality(p_commission_ids) <> (select count(distinct id) from unnest(p_commission_ids) as ids(id)) then
    raise exception 'La selección contiene comisiones duplicadas';
  end if;

  for v_id in select id from unnest(p_commission_ids) as ids(id) order by id
  loop
    perform public.pay_seller_commission(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$function$;

revoke all on function public.pay_seller_commissions(uuid[]) from public;
revoke execute on function public.pay_seller_commissions(uuid[]) from anon;
grant execute on function public.pay_seller_commissions(uuid[]) to authenticated;
