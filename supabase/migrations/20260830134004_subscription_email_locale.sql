-- Expand-only: existing addresses keep NULL (bilingual); no subscriber backfill.
-- Deploy before the Worker that selects locale. Rollback code first and leave
-- this optional column intact so saved preferences are not destroyed.
set lock_timeout = '5s';
alter table public.subscriptions add column locale text
  constraint subscriptions_locale_check check (locale in ('zh', 'en'));
comment on column public.subscriptions.locale is
  'Website language captured at confirmed opt-in: zh or en; NULL retains bilingual mail.';
