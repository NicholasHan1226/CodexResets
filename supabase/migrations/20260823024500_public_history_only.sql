-- The browser's publishable Supabase key may read confirmed public history,
-- but must never bypass the Worker-owned stabilization lifecycle.

begin;

drop policy if exists "public read reset records" on public.reset_records;

create policy "public read verified reset records"
  on public.reset_records for select to anon, authenticated
  using (verified is true);

commit;
