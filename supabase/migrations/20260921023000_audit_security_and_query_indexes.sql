-- Baseline de seguridad y rendimiento detectado durante la auditoria operativa.
-- Las funciones siguen disponibles para usuarios autenticados; anon no debe invocarlas.
revoke execute on function public.log_action(text, text) from anon;
revoke execute on function public.ensure_month_bonus(uuid) from anon;

-- Indices para las consultas que sostienen POS, facturas, Kardex y bitacora.
create index if not exists audit_log_user_id_idx on public.audit_log(user_id);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);
create index if not exists documents_kind_created_at_idx on public.documents(kind, created_at desc);
create index if not exists documents_party_id_idx on public.documents(party_id);
create index if not exists documents_location_id_idx on public.documents(location_id);
create index if not exists document_items_document_id_idx on public.document_items(document_id);
create index if not exists document_items_product_id_idx on public.document_items(product_id);
create index if not exists inventory_movements_product_location_created_at_idx
  on public.inventory_movements(product_id, location_id, created_at desc);
create index if not exists inventory_movements_document_id_idx on public.inventory_movements(document_id);
create index if not exists journal_entries_source_source_id_idx on public.journal_entries(source, source_id);
create index if not exists journal_entries_entry_date_idx on public.journal_entries(entry_date desc);
create index if not exists journal_lines_entry_id_idx on public.journal_lines(entry_id);
