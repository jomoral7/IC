revoke all on function public.post_journal_entry(date, text, text, uuid, jsonb) from public;
revoke execute on function public.post_journal_entry(date, text, text, uuid, jsonb) from anon;
grant execute on function public.post_journal_entry(date, text, text, uuid, jsonb) to authenticated;

drop policy if exists "coa_write" on public.chart_of_accounts;
drop policy if exists "je_write" on public.journal_entries;
drop policy if exists "jl_write" on public.journal_lines;
drop policy if exists "manage seller goals" on public.seller_goals;
drop policy if exists "manage seller bonus" on public.seller_bonus_payments;

create policy "coa_insert" on public.chart_of_accounts for insert to authenticated
  with check (public.current_app_role() in ('admin','manager'));
create policy "coa_update" on public.chart_of_accounts for update to authenticated
  using (public.current_app_role() in ('admin','manager'))
  with check (public.current_app_role() in ('admin','manager'));
create policy "coa_delete" on public.chart_of_accounts for delete to authenticated
  using (public.current_app_role() in ('admin','manager'));

create policy "je_insert" on public.journal_entries for insert to authenticated
  with check (public.current_app_role() in ('admin','manager'));
create policy "je_update" on public.journal_entries for update to authenticated
  using (public.current_app_role() in ('admin','manager'))
  with check (public.current_app_role() in ('admin','manager'));
create policy "je_delete" on public.journal_entries for delete to authenticated
  using (public.current_app_role() in ('admin','manager'));

create policy "jl_insert" on public.journal_lines for insert to authenticated
  with check (public.current_app_role() in ('admin','manager'));
create policy "jl_update" on public.journal_lines for update to authenticated
  using (public.current_app_role() in ('admin','manager'))
  with check (public.current_app_role() in ('admin','manager'));
create policy "jl_delete" on public.journal_lines for delete to authenticated
  using (public.current_app_role() in ('admin','manager'));

create policy "manage seller goals insert" on public.seller_goals for insert to authenticated
  with check (public.current_app_role() in ('admin','manager'));
create policy "manage seller goals update" on public.seller_goals for update to authenticated
  using (public.current_app_role() in ('admin','manager'))
  with check (public.current_app_role() in ('admin','manager'));
create policy "manage seller goals delete" on public.seller_goals for delete to authenticated
  using (public.current_app_role() in ('admin','manager'));

create policy "manage seller bonus insert" on public.seller_bonus_payments for insert to authenticated
  with check (public.current_app_role() in ('admin','manager'));
create policy "manage seller bonus update" on public.seller_bonus_payments for update to authenticated
  using (public.current_app_role() in ('admin','manager'))
  with check (public.current_app_role() in ('admin','manager'));
create policy "manage seller bonus delete" on public.seller_bonus_payments for delete to authenticated
  using (public.current_app_role() in ('admin','manager'));
