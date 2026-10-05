-- Discounts are a contra-revenue account: debits reduce gross sales.
update public.chart_of_accounts
set system_key = 'sales_discounts', active = true, is_postable = true
where code = '4103' and type = 'income';

do $$
begin
  if not exists (select 1 from public.chart_of_accounts where system_key = 'sales_discounts') then
    raise exception 'No existe la cuenta 4103 Descuentos y promociones sobre ventas';
  end if;
end $$;
