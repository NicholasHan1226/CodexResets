-- Separate automatic discovery from human-confirmed reset history. Existing
-- records predate this release, so mark them delivered to avoid a historical
-- notification replay when the Worker begins polling confirmations.

begin;

alter table public.reset_records
  add column if not exists notified_at timestamptz;

update public.reset_records
  set notified_at = now()
  where notified_at is null;

-- The product's retention promise is that an address exists only while it is
-- actively subscribed. This is a one-time cleanup of old inactive rows.
delete from public.subscriptions where is_active = false;

commit;
