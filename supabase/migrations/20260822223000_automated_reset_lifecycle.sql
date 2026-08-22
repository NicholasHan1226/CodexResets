-- Fully automated reset lifecycle: strong direct-source discoveries wait one
-- scheduled interval, are cancelled by a later correction, then are promoted
-- and delivered without a human database action.

begin;

alter table public.reset_records
  add column if not exists automated boolean not null default false,
  add column if not exists auto_state text not null default 'manual',
  add column if not exists auto_confirm_after timestamptz,
  add column if not exists retracted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reset_records_auto_state_check'
  ) then
    alter table public.reset_records
      add constraint reset_records_auto_state_check
      check (auto_state in ('manual', 'observed', 'confirmed', 'retracted'));
  end if;
end $$;

create index if not exists reset_records_automation_idx
  on public.reset_records (auto_confirm_after)
  where automated and not verified and auto_state = 'observed';

-- Prior pending rows were inserted only by the strong-announcement detector.
-- Enroll them once so no manual verification step remains after this release.
update public.reset_records
  set automated = true,
      auto_state = 'observed',
      auto_confirm_after = created_at + interval '30 minutes'
  where not verified
    and source_url is not null
    and auto_state = 'manual';

commit;
