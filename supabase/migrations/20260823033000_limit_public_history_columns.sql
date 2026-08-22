-- Public history needs dates only. Keep source links, original announcement
-- text, lifecycle state, and delivery fields service-role-only even for rows
-- that are allowed through the verified-history RLS policy.

begin;

revoke all privileges on table public.reset_records from anon, authenticated;
grant select (id, reset_date, verified) on table public.reset_records to anon, authenticated;

commit;
