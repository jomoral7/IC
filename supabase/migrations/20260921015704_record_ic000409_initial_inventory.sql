-- Corrige la primera referencia creada manualmente despues de la importacion.
-- Se creo con una unidad a L 250 y luego se vendio, pero le faltaba la entrada
-- contable inicial que si tuvieron las referencias del Excel.
do $$
declare
  v_product_id uuid;
  v_location_id uuid;
  v_entry_id uuid;
  v_inventory_id uuid;
  v_capital_id uuid;
begin
  select id into v_product_id
  from public.products
  where internal_code = 'IC-000409';

  if v_product_id is null then
    return;
  end if;

  select location_id into v_location_id
  from public.stock_levels
  where product_id = v_product_id
  limit 1;

  select id into v_inventory_id from public.chart_of_accounts where system_key = 'inventory';
  select id into v_capital_id from public.chart_of_accounts where system_key = 'capital';

  if not exists (
    select 1 from public.inventory_movements
    where product_id = v_product_id and notes = 'Inventario inicial al crear producto'
  ) then
    insert into public.inventory_movements (
      product_id, location_id, movement_type, quantity, unit_cost, unit_price, notes, created_at
    ) values (
      v_product_id, v_location_id, 'adjustment_in', 1, 250, 500,
      'Inventario inicial al crear producto', '2026-09-20 07:48:40.278609+00'
    );
  end if;

  if not exists (select 1 from public.journal_entries where memo = 'Inventario inicial IC-000409') then
    insert into public.journal_entries (entry_date, memo, source)
    values ('2026-09-20', 'Inventario inicial IC-000409', 'manual')
    returning id into v_entry_id;

    insert into public.journal_lines (entry_id, account_id, debit, credit, description)
    values
      (v_entry_id, v_inventory_id, 250, 0, 'Inventario inicial'),
      (v_entry_id, v_capital_id, 0, 250, 'Capital inicial');
  end if;
end;
$$;
