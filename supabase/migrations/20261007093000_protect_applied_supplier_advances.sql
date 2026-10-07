-- Once an advance backs a purchase, its original journal lines must remain immutable.
create function private.protect_applied_supplier_advance_lines()
returns trigger language plpgsql security invoker set search_path = '' as $fn$
declare v_entry uuid;
begin
  v_entry:=case when tg_op='INSERT' then new.entry_id else old.entry_id end;
  if exists(select 1 from public.purchase_funding where advance_entry_id=v_entry) then
    raise exception 'La partida de anticipo ya fue aplicada a una compra y no se puede modificar';
  end if;
  if tg_op='UPDATE' and new.entry_id is distinct from old.entry_id
    and exists(select 1 from public.purchase_funding where advance_entry_id=new.entry_id) then
    raise exception 'La partida de anticipo ya fue aplicada a una compra y no se puede modificar';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $fn$;
revoke all on function private.protect_applied_supplier_advance_lines() from public,anon,authenticated;
create trigger protect_applied_supplier_advance_lines
before insert or update or delete on public.journal_lines
for each row execute function private.protect_applied_supplier_advance_lines();

create function private.protect_applied_supplier_advance_entry()
returns trigger language plpgsql security invoker set search_path = '' as $fn$
begin
  if exists(select 1 from public.purchase_funding where advance_entry_id=old.id) then
    raise exception 'La partida de anticipo ya fue aplicada a una compra y no se puede modificar';
  end if;
  return old;
end $fn$;
revoke all on function private.protect_applied_supplier_advance_entry() from public,anon,authenticated;
create trigger protect_applied_supplier_advance_entry
before update of entry_date, source or delete on public.journal_entries
for each row execute function private.protect_applied_supplier_advance_entry();
