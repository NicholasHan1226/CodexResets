-- The earlier confirmation-era migration marked every pre-existing record as
-- delivered. A record that was pending at that point can now be automatically
-- confirmed, so clear that inherited marker exactly once and let the normal
-- Worker fan-out deliver it on the next scheduled run.

begin;

update public.reset_records
  set notified_at = null
  where automated
    and auto_state = 'confirmed'
    and notified_at is not null;

commit;
