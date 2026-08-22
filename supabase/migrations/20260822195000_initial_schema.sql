-- Codex Resets managed Supabase baseline. It is safe to run against the
-- existing project: it creates any missing resources without opening public
-- subscription or push write access.

begin;

create table if not exists public.reset_records (
  id uuid primary key default gen_random_uuid(),
  reset_date timestamptz not null,
  source_url text,
  description text,
  verified boolean not null default false,
  automated boolean not null default false,
  auto_state text not null default 'manual' check (auto_state in ('manual', 'observed', 'confirmed', 'retracted')),
  auto_confirm_after timestamptz,
  retracted_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reset_records_reset_date_idx on public.reset_records (reset_date desc);
create index if not exists reset_records_automation_idx on public.reset_records (auto_confirm_after)
  where automated and not verified and auto_state = 'observed';

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);
create index if not exists subscriptions_active_email_idx on public.subscriptions (email) where is_active;

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.reset_records enable row level security;
alter table public.subscriptions enable row level security;
alter table public.push_subscriptions enable row level security;

-- Public history is non-sensitive; all subscription and push state stays
-- service-role-only. There are deliberately no public write policies or RPCs.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'reset_records'
      and policyname = 'public read reset records'
  ) then
    create policy "public read reset records"
      on public.reset_records for select to anon, authenticated using (true);
  end if;
end $$;

revoke execute on all functions in schema public from anon, authenticated;
grant select on public.reset_records to anon, authenticated;
grant all privileges on public.reset_records, public.subscriptions, public.push_subscriptions to service_role;

commit;
