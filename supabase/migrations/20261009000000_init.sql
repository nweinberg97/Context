-- Context — initial schema
--
-- Design notes (see docs/SCHEMA.md for the long version):
--   * Every user-owned row carries user_id and is protected by RLS keyed on auth.uid().
--   * Child tables reference parents through composite (id, user_id) foreign keys, so a
--     row can never point at another user's parent even if an id is guessed.
--   * Privileges are granted per column: clients can only change the fields a person
--     legitimately edits. Pipeline metadata (fingerprints, parser versions, statuses)
--     is written by server-only code and cannot be forged through the public API.
--   * Extracted habits always start as drafts. Approval is a database-enforced
--     transition, and approved_at is stamped by the database, never by the client.
--   * Consent changes for reminders are audited by trigger, so the audit trail exists
--     no matter which code path changed the preference.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  display_name  text check (display_name is null or char_length(display_name) between 1 and 80),
  timezone      text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  onboarded_at  timestamptz,
  ai_notice_acknowledged_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Source imports
-- ---------------------------------------------------------------------------

create table public.source_imports (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  source_type         text not null check (source_type in ('paste', 'email_forward')),
  title               text check (title is null or char_length(title) between 1 and 120),
  -- Sanitized body only (headers, signatures and quoted history stripped). Raw input is
  -- never stored. Set to null when the person removes source content.
  sanitized_text      text check (sanitized_text is null or char_length(sanitized_text) <= 20000),
  content_fingerprint text not null check (content_fingerprint ~ '^[0-9a-f]{64}$'),
  status              text not null default 'received'
                      check (status in ('received', 'extracting', 'ready_for_review', 'reviewed', 'failed')),
  parser_version      text not null,
  extraction_version  text,
  extraction_provider text,
  parse_flags         text[] not null default '{}',
  error_category      text check (error_category is null or error_category in
                        ('empty', 'too_large', 'unparseable', 'provider_unavailable',
                         'provider_timeout', 'invalid_output', 'rate_limited', 'internal')),
  content_removed_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, user_id),
  -- Idempotent imports: the same sanitized content is only imported once per person.
  unique (user_id, content_fingerprint),
  check ((content_removed_at is null) or (sanitized_text is null))
);

create index source_imports_user_created_idx on public.source_imports (user_id, created_at desc);

create trigger source_imports_updated_at before update on public.source_imports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Routines
-- ---------------------------------------------------------------------------

create table public.routines (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  source_import_id uuid,
  title            text not null check (char_length(title) between 1 and 120),
  status           text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  -- Deleting a source keeps the routine the person approved; only the link is cleared.
  foreign key (source_import_id, user_id)
    references public.source_imports (id, user_id) on delete set null (source_import_id)
);

create index routines_user_status_idx on public.routines (user_id, status);
create index routines_source_idx on public.routines (source_import_id) where source_import_id is not null;

create trigger routines_updated_at before update on public.routines
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Habits
-- ---------------------------------------------------------------------------

create table public.habits (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid(),
  routine_id           uuid not null,
  name                 text not null check (char_length(name) between 1 and 80),
  instruction          text not null check (char_length(instruction) between 1 and 500),
  timing_cue           text check (timing_cue is null or char_length(timing_cue) between 1 and 80),
  -- Structured details are validated by the application schema; the database checks shape.
  frequency            jsonb check (frequency is null or jsonb_typeof(frequency) = 'object'),
  quantity             jsonb check (quantity is null or jsonb_typeof(quantity) = 'object'),
  duration             jsonb check (duration is null or jsonb_typeof(duration) = 'object'),
  source_evidence      text check (source_evidence is null or char_length(source_evidence) <= 500),
  clarification_status text not null default 'none'
                       check (clarification_status in ('none', 'needs_input', 'resolved')),
  clarification_notes  text[] not null default '{}'
                       check (cardinality(clarification_notes) <= 6),
  origin               text not null default 'manual' check (origin in ('extracted', 'manual')),
  status               text not null default 'draft'
                       check (status in ('draft', 'active', 'archived', 'rejected')),
  approved_at          timestamptz,
  tracking_type        text not null default 'check' check (tracking_type in ('check', 'count', 'duration')),
  position             integer not null default 0 check (position between 0 and 1000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, user_id),
  foreign key (routine_id, user_id) references public.routines (id, user_id) on delete cascade,
  -- A habit can never be active (or archived after being active) without an approval.
  check (status not in ('active', 'archived') or approved_at is not null)
);

create index habits_routine_idx on public.habits (routine_id, position);
create index habits_user_status_idx on public.habits (user_id, status);

create trigger habits_updated_at before update on public.habits
  for each row execute function public.set_updated_at();

-- Approval is a state transition owned by the database:
--   * extracted habits are always inserted as drafts, whatever the caller sends;
--   * approved_at is stamped with the server clock when a draft is approved;
--   * approved_at cannot be forged, backdated or cleared by a client.
create or replace function public.enforce_habit_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.origin = 'extracted' then
      new.status := 'draft';
      new.approved_at := null;
    elsif new.status = 'active' then
      -- Manually written habits are approved by the act of writing them.
      new.approved_at := now();
    else
      new.approved_at := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.status = 'active' and old.status in ('draft', 'rejected') then
    new.approved_at := now();
  elsif new.status in ('draft', 'rejected') then
    if old.status in ('active', 'archived') then
      raise exception 'An approved habit cannot return to review' using errcode = 'check_violation';
    end if;
    new.approved_at := null;
  else
    new.approved_at := old.approved_at;
  end if;
  return new;
end;
$$;

create trigger habits_lifecycle before insert or update on public.habits
  for each row execute function public.enforce_habit_lifecycle();

-- ---------------------------------------------------------------------------
-- Habit events (self-reported completion; absence of a row means "not reported")
-- ---------------------------------------------------------------------------

create table public.habit_events (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid(),
  habit_id         uuid not null,
  occurred_on      date not null,
  state            text not null check (state in ('done', 'partial', 'skipped')),
  count            integer check (count is null or count between 0 and 10000),
  duration_seconds integer check (duration_seconds is null or duration_seconds between 0 and 86400),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- One report per habit per day: duplicate submissions upsert instead of duplicating.
  unique (habit_id, occurred_on),
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);

create index habit_events_user_date_idx on public.habit_events (user_id, occurred_on desc);

create trigger habit_events_updated_at before update on public.habit_events
  for each row execute function public.set_updated_at();

create or replace function public.enforce_event_on_active_habit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  habit_status text;
begin
  select h.status into habit_status from public.habits h where h.id = new.habit_id;
  if habit_status is distinct from 'active' then
    raise exception 'Progress can only be recorded for approved, active habits'
      using errcode = 'check_violation';
  end if;
  if new.occurred_on > (current_date + 1) or new.occurred_on < (current_date - 400) then
    raise exception 'Event date out of range' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger habit_events_active_habit before insert or update on public.habit_events
  for each row execute function public.enforce_event_on_active_habit();

-- ---------------------------------------------------------------------------
-- Notification preferences (reminders are off until the person opts in)
-- ---------------------------------------------------------------------------

create table public.notification_preferences (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  enabled              boolean not null default false,
  preferred_local_time time not null default '08:00',
  timezone             text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  days                 smallint[] not null default '{1,2,3,4,5,6,7}'
                       check (days <@ '{1,2,3,4,5,6,7}'::smallint[] and cardinality(days) between 1 and 7),
  paused_until         date,
  unsubscribed_at      timestamptz,
  -- Single-purpose capability used only by the one-click unsubscribe page (POST).
  unsubscribe_key      text not null unique
                       default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  updated_at           timestamptz not null default now()
);

create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Consent events (append-only audit trail)
-- ---------------------------------------------------------------------------

create table public.consent_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in (
               'reminders_opt_in', 'reminders_opt_out', 'reminders_paused', 'reminders_resumed',
               'reminders_unsubscribed', 'ai_processing_acknowledged')),
  source     text not null default 'app' check (source in ('app', 'email_link', 'system')),
  created_at timestamptz not null default now()
);

create index consent_events_user_idx on public.consent_events (user_id, created_at desc);

create or replace function public.audit_notification_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  src text := coalesce(nullif(current_setting('context.consent_source', true), ''), 'app');
begin
  if new.enabled and not old.enabled then
    insert into public.consent_events (user_id, kind, source) values (new.user_id, 'reminders_opt_in', src);
    new.unsubscribed_at := null;
  elsif old.enabled and not new.enabled then
    insert into public.consent_events (user_id, kind, source)
      values (new.user_id, case when new.unsubscribed_at is not null and old.unsubscribed_at is null
                                then 'reminders_unsubscribed' else 'reminders_opt_out' end, src);
  end if;
  if new.paused_until is distinct from old.paused_until then
    insert into public.consent_events (user_id, kind, source)
      values (new.user_id, case when new.paused_until is null then 'reminders_resumed' else 'reminders_paused' end, src);
  end if;
  return new;
end;
$$;

create trigger notification_preferences_consent before update on public.notification_preferences
  for each row execute function public.audit_notification_consent();

create or replace function public.audit_ai_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ai_notice_acknowledged_at is not null and old.ai_notice_acknowledged_at is null then
    insert into public.consent_events (user_id, kind) values (new.id, 'ai_processing_acknowledged');
  end if;
  return new;
end;
$$;

create trigger profiles_ai_notice after update on public.profiles
  for each row execute function public.audit_ai_notice();

-- ---------------------------------------------------------------------------
-- Scheduled jobs (durable queue for check-in emails)
-- ---------------------------------------------------------------------------

create table public.scheduled_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  kind                text not null check (kind in ('checkin_email')),
  local_date          date not null,
  run_at              timestamptz not null,
  status              text not null default 'pending'
                      check (status in ('pending', 'processing', 'sent', 'skipped', 'failed', 'cancelled')),
  attempts            integer not null default 0 check (attempts >= 0),
  max_attempts        integer not null default 5 check (max_attempts between 1 and 10),
  locked_at           timestamptz,
  last_error_category text,
  provider_message_id text,
  delivery_status     text check (delivery_status is null or delivery_status in
                        ('sent', 'delivered', 'delayed', 'bounced', 'complained')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Idempotency: at most one check-in per person per local day, however often the
  -- scheduler runs.
  unique (user_id, kind, local_date)
);

create index scheduled_jobs_due_idx on public.scheduled_jobs (run_at) where status = 'pending';
create unique index scheduled_jobs_provider_msg_idx on public.scheduled_jobs (provider_message_id)
  where provider_message_id is not null;

create trigger scheduled_jobs_updated_at before update on public.scheduled_jobs
  for each row execute function public.set_updated_at();

-- Turning reminders off, pausing them, or changing when they arrive cancels any
-- check-in that is queued but not yet sent. Enforced here so no code path can forget.
create or replace function public.cancel_pending_checkins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.enabled or new.unsubscribed_at is not null then
    update public.scheduled_jobs set status = 'cancelled'
      where user_id = new.user_id and status = 'pending';
  elsif new.paused_until is not null and new.paused_until is distinct from old.paused_until then
    update public.scheduled_jobs set status = 'cancelled'
      where user_id = new.user_id and status = 'pending' and local_date <= new.paused_until;
  elsif new.preferred_local_time is distinct from old.preferred_local_time
     or new.timezone is distinct from old.timezone
     or new.days is distinct from old.days then
    update public.scheduled_jobs set status = 'cancelled'
      where user_id = new.user_id and status = 'pending';
  end if;
  return new;
end;
$$;

create trigger notification_preferences_cancel_jobs after update on public.notification_preferences
  for each row execute function public.cancel_pending_checkins();

-- ---------------------------------------------------------------------------
-- System tables (no client access)
-- ---------------------------------------------------------------------------

create table public.deletion_jobs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,          -- no FK: the user row is what gets deleted
  status              text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  attempts            integer not null default 0,
  last_error_category text,
  requested_at        timestamptz not null default now(),
  completed_at        timestamptz
);

create unique index deletion_jobs_one_open_idx on public.deletion_jobs (user_id) where status = 'pending';

create table public.rate_limit_buckets (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);

create table public.webhook_events (
  provider    text not null,
  message_id  text not null,
  received_at timestamptz not null default now(),
  primary key (provider, message_id)
);

-- ---------------------------------------------------------------------------
-- New-user bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
    on conflict (id) do nothing;
  insert into public.notification_preferences (user_id) values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.profiles                 enable row level security;
alter table public.source_imports           enable row level security;
alter table public.routines                 enable row level security;
alter table public.habits                   enable row level security;
alter table public.habit_events             enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.consent_events           enable row level security;
alter table public.scheduled_jobs           enable row level security;
alter table public.deletion_jobs            enable row level security;
alter table public.rate_limit_buckets       enable row level security;
alter table public.webhook_events           enable row level security;

-- Start from zero: Supabase grants broad default privileges on new public tables.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated, public;

-- profiles
grant select on public.profiles to authenticated;
grant update (display_name, timezone, onboarded_at, ai_notice_acknowledged_at) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- source_imports: created by the server pipeline; people can read, rename and delete.
grant select, delete on public.source_imports to authenticated;
grant update (title) on public.source_imports to authenticated;
create policy source_imports_select_own on public.source_imports for select to authenticated
  using ((select auth.uid()) = user_id);
create policy source_imports_update_own on public.source_imports for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy source_imports_delete_own on public.source_imports for delete to authenticated
  using ((select auth.uid()) = user_id);

-- routines
grant select, delete on public.routines to authenticated;
grant insert (title, status, source_import_id) on public.routines to authenticated;
grant update (title, status) on public.routines to authenticated;
create policy routines_select_own on public.routines for select to authenticated
  using ((select auth.uid()) = user_id);
create policy routines_insert_own on public.routines for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy routines_update_own on public.routines for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy routines_delete_own on public.routines for delete to authenticated
  using ((select auth.uid()) = user_id);

-- habits
grant select, delete on public.habits to authenticated;
grant insert (routine_id, name, instruction, timing_cue, frequency, quantity, duration,
              source_evidence, clarification_status, clarification_notes, origin, status,
              tracking_type, position) on public.habits to authenticated;
grant update (name, instruction, timing_cue, frequency, quantity, duration,
              clarification_status, clarification_notes, status, tracking_type, position)
  on public.habits to authenticated;
create policy habits_select_own on public.habits for select to authenticated
  using ((select auth.uid()) = user_id);
create policy habits_insert_own on public.habits for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy habits_update_own on public.habits for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy habits_delete_own on public.habits for delete to authenticated
  using ((select auth.uid()) = user_id);

-- habit_events
grant select, delete on public.habit_events to authenticated;
grant insert (habit_id, occurred_on, state, count, duration_seconds) on public.habit_events to authenticated;
grant update (state, count, duration_seconds) on public.habit_events to authenticated;
create policy habit_events_select_own on public.habit_events for select to authenticated
  using ((select auth.uid()) = user_id);
create policy habit_events_insert_own on public.habit_events for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy habit_events_update_own on public.habit_events for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy habit_events_delete_own on public.habit_events for delete to authenticated
  using ((select auth.uid()) = user_id);

-- notification_preferences (the unsubscribe key is never readable by clients)
grant select (user_id, enabled, preferred_local_time, timezone, days, paused_until, unsubscribed_at, updated_at)
  on public.notification_preferences to authenticated;
grant update (enabled, preferred_local_time, timezone, days, paused_until)
  on public.notification_preferences to authenticated;
create policy notification_preferences_select_own on public.notification_preferences for select to authenticated
  using ((select auth.uid()) = user_id);
create policy notification_preferences_update_own on public.notification_preferences for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- consent_events: readable by the person, written only by triggers and the server.
grant select on public.consent_events to authenticated;
create policy consent_events_select_own on public.consent_events for select to authenticated
  using ((select auth.uid()) = user_id);

-- scheduled_jobs, deletion_jobs, rate_limit_buckets, webhook_events: RLS enabled with
-- no policies and no grants — reachable only by server-side system code.
