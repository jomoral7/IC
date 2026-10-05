-- Each material keeps its own asset account, so purchases and consumption use the same account.
alter table public.packaging_materials add column inventory_account_id uuid references public.chart_of_accounts(id);

update public.packaging_materials material
set inventory_account_id = account.id
from public.chart_of_accounts account
where material.inventory_account_id is null and account.system_key = 'packaging_inventory';

alter table public.packaging_materials alter column inventory_account_id set not null;

create function private.validate_packaging_material_account() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and old.inventory_account_id is distinct from new.inventory_account_id
    and (exists(select 1 from public.packaging_stock_levels where material_id=old.id and quantity>0)
      or exists(select 1 from public.packaging_movements where material_id=old.id)) then
    raise exception 'No se puede cambiar la cuenta de un material con existencias o historial';
  end if;
  if not exists (
    select 1 from public.chart_of_accounts
    where id=new.inventory_account_id and active and is_postable and type='asset'
      and coalesce(system_key,'') not in ('bank','cash')
  ) then
    raise exception 'Selecciona una cuenta de activo vigente para el material de empaque';
  end if;
  return new;
end $$;
revoke all on function private.validate_packaging_material_account() from public, anon, authenticated;
create trigger validate_packaging_material_account
before insert or update of inventory_account_id on public.packaging_materials
for each row execute function private.validate_packaging_material_account();
