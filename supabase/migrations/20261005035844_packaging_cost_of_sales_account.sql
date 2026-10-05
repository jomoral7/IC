-- Packaging is a cost of sale when it is consumed, not a general operating expense.
update public.chart_of_accounts set system_key = null where system_key = 'packaging_expense';
update public.chart_of_accounts
set system_key = 'packaging_expense', active = true, is_postable = true
where code = '5102' and type = 'expense';

do $$
begin
  if not exists (select 1 from public.chart_of_accounts where system_key = 'packaging_expense') then
    raise exception 'No existe la cuenta 5102 Costo de venta-Empaque y bolsas';
  end if;
end $$;
