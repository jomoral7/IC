-- Use the account chosen by the business for all internal bags and packaging.
update public.chart_of_accounts set system_key = null where system_key = 'packaging_inventory';
update public.chart_of_accounts
set system_key = 'packaging_inventory', active = true, is_postable = true
where code = '1107' and type = 'asset';

do $$
declare v_packaging_account uuid;
begin
  select id into v_packaging_account from public.chart_of_accounts where system_key = 'packaging_inventory';
  if v_packaging_account is null then raise exception 'No existe la cuenta 1107 para inventario de bolsas y empaque'; end if;
  update public.packaging_materials set inventory_account_id = v_packaging_account;
end $$;
