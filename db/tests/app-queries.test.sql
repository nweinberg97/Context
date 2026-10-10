-- Runs the application's own SQL (as written in src/lib) against the real schema, under
-- the same roles the app uses. Catches column-grant or syntax drift between code and
-- migrations. Parameters are inlined with psql variables.

create schema if not exists test;
create or replace function test.ok(condition boolean, label text) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL: %', label; end if;
  raise notice 'ok - %', label;
end $$;
grant usage on schema test to authenticated;
grant execute on all functions in schema test to authenticated;

insert into auth.users (id, email) values ('cccccccc-0000-4000-8000-000000000003', 'c@example.test');

-- imports.ts: trusted pipeline insert (system role)
insert into public.source_imports
  (user_id, source_type, title, sanitized_text, content_fingerprint, status, parser_version, extraction_provider, parse_flags)
values ('cccccccc-0000-4000-8000-000000000003', 'paste', 'Physio', 'Do the chin tucks, 2 x 10, every morning.', repeat('e', 64), 'extracting', 'parser@1.0.0', 'rules', '{html_converted}')
returning id as import_id \gset

begin;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

-- imports.ts: duplicate check
select si.id as "importId", r.id as "routineId", si.status
from public.source_imports si left join public.routines r on r.source_import_id = si.id
where si.content_fingerprint = repeat('e', 64) limit 1;

-- imports.ts: draft routine + extracted habit
insert into public.routines (title, status, source_import_id) values ('Physio', 'draft', :'import_id') returning id as routine_id \gset
insert into public.habits (routine_id, name, instruction, timing_cue, frequency, quantity, duration,
  source_evidence, clarification_status, clarification_notes, origin, status, position)
values (:'routine_id', 'Chin tucks', 'Do the chin tucks, 2 x 10, every morning.', 'every morning',
  '{"kind":"daily","text":"every morning","origin":"message"}', '{"sets":2,"reps":10,"text":"2 x 10","origin":"message"}', null,
  'Do the chin tucks, 2 x 10, every morning.', 'none', '{}', 'extracted', 'draft', 0)
returning id as habit_id \gset

-- routines.ts: reads with the shared column lists
select id, routine_id as "routineId", name, instruction, timing_cue as "timingCue",
  frequency, quantity, duration, source_evidence as "sourceEvidence",
  clarification_status as "clarificationStatus", clarification_notes as "clarificationNotes",
  origin, status, approved_at as "approvedAt", tracking_type as "trackingType", position
from public.habits where routine_id = any(array[:'routine_id']::uuid[]) and status = any('{draft,active}'::text[]) order by position, created_at;
select id, title, source_type as "sourceType", sanitized_text as "sanitizedText", status,
  parse_flags as "parseFlags", extraction_provider as "extractionProvider", error_category as "errorCategory",
  content_removed_at as "contentRemovedAt", created_at as "createdAt" from public.source_imports;
select enabled, to_char(preferred_local_time, 'HH24:MI') as "preferredLocalTime", timezone, days,
  paused_until as "pausedUntil", unsubscribed_at as "unsubscribedAt" from public.notification_preferences;

-- routines.ts: updateHabit, setHabitStatus, finishReview
update public.habits set name = 'Chin tucks', instruction = 'Do the chin tucks, 2 x 10, every morning.', timing_cue = 'every morning',
  frequency = '{"kind":"other","text":"daily","origin":"person"}', quantity = null, duration = null, clarification_status = 'resolved'
where id = :'habit_id' returning id;
update public.habits set status = 'active' where id = :'habit_id' returning id;
update public.habits set status = 'rejected' where routine_id = :'routine_id' and status = 'draft';
update public.routines set status = 'active', title = 'Neck routine' where id = :'routine_id';

-- routines.ts: addManualHabit
select coalesce(max(position), -1) + 1 as next from public.habits where routine_id = :'routine_id';
insert into public.habits (routine_id, name, instruction, timing_cue, frequency, quantity, duration, origin, status, position)
values (:'routine_id', 'Walk', 'Walk after lunch', 'after lunch', null, '{"text":"20 minutes","origin":"person"}', null, 'manual', 'active', 1);

-- events.ts: record, correct, clear
insert into public.habit_events (habit_id, occurred_on, state) values (:'habit_id', current_date, 'done')
  on conflict (habit_id, occurred_on) do update set state = excluded.state;
insert into public.habit_events (habit_id, occurred_on, state) values (:'habit_id', current_date, 'skipped')
  on conflict (habit_id, occurred_on) do update set state = excluded.state;
select test.ok((select count(*) = 1 and min(state) = 'skipped' from public.habit_events), 'completion upsert corrects in place');

-- profile.ts
update public.profiles set timezone = 'America/Vancouver', onboarded_at = coalesce(onboarded_at, now()) where id = auth.uid();
update public.notification_preferences set timezone = 'America/Vancouver', preferred_local_time = coalesce('07:30'::time, preferred_local_time), enabled = false
  where user_id = auth.uid();
update public.notification_preferences set enabled = true, preferred_local_time = '08:15'::time, days = '{1,2,3,4,5}'::smallint[] where user_id = auth.uid();
update public.profiles set ai_notice_acknowledged_at = coalesce(ai_notice_acknowledged_at, now()) where id = auth.uid();

-- account.ts: export queries
select id, email, display_name as "displayName", timezone, onboarded_at as "onboardedAt",
  ai_notice_acknowledged_at as "aiNoticeAcknowledgedAt", created_at as "createdAt" from public.profiles;
select habit_id as "habitId", occurred_on as "occurredOn", state, count, duration_seconds as "durationSeconds",
  created_at as "createdAt", updated_at as "updatedAt" from public.habit_events order by occurred_on;
select kind, source, created_at as "createdAt" from public.consent_events order by created_at;
select test.ok((select count(*) >= 2 from public.consent_events), 'consent trail visible to its owner in export');

-- imports.ts: deleteSource (user part)
select id from public.routines where source_import_id = :'import_id';
commit;

-- dispatch.ts: enqueue (system)
insert into public.scheduled_jobs (user_id, kind, local_date, run_at) values ('cccccccc-0000-4000-8000-000000000003', 'checkin_email', current_date, now() - interval '1 minute')
  on conflict (user_id, kind, local_date) do update set status = 'pending', run_at = excluded.run_at, attempts = 0
  where public.scheduled_jobs.status = 'cancelled' returning id;

-- dispatch.ts: claim (twice: the second run must claim nothing)
with due as (
  select j.id from public.scheduled_jobs j
  where (j.status = 'pending' or (j.status = 'processing' and j.locked_at < now() - interval '10 minutes'))
    and j.run_at <= now()
  order by j.run_at limit 25 for update skip locked
)
update public.scheduled_jobs j set status = 'processing', locked_at = now(), attempts = j.attempts + 1
from due, public.notification_preferences np, public.profiles p
where j.id = due.id and np.user_id = j.user_id and p.id = j.user_id
returning j.id, j.user_id as "userId", j.run_at as "runAt", j.attempts, j.max_attempts as "maxAttempts",
  p.email, np.unsubscribe_key as "unsubscribeKey", np.enabled, np.paused_until as "pausedUntil", j.local_date as "localDate";
select test.ok((select count(*) = 1 from public.scheduled_jobs where status = 'processing' and attempts = 1), 'claim marks the job processing');
with due as (
  select j.id from public.scheduled_jobs j
  where (j.status = 'pending' or (j.status = 'processing' and j.locked_at < now() - interval '10 minutes')) and j.run_at <= now()
  for update skip locked
) select test.ok((select count(*) = 0 from due), 'a second dispatcher run cannot claim the same job');

update public.scheduled_jobs set status = 'sent', locked_at = null, last_error_category = null,
  provider_message_id = coalesce('msg_123', provider_message_id),
  delivery_status = case when 'sent' = 'sent' then 'sent' else delivery_status end
where user_id = 'cccccccc-0000-4000-8000-000000000003';

-- dispatch.ts: webhook delivery + complaint turns reminders off
insert into public.webhook_events (provider, message_id) values ('email', 'wh_1') on conflict do nothing;
with x as (insert into public.webhook_events (provider, message_id) values ('email', 'wh_1') on conflict do nothing returning 1)
select test.ok((select count(*) = 0 from x), 'replayed webhook ids are detected');
update public.scheduled_jobs set delivery_status = 'complained' where provider_message_id = 'msg_123';

-- ratelimit.ts
insert into public.rate_limit_buckets (key, window_start, count)
values ('import:test', date_bin(make_interval(secs => 3600), now(), timestamptz '2000-01-01'), 1)
on conflict (key, window_start) do update set count = public.rate_limit_buckets.count + 1 returning count;
insert into public.rate_limit_buckets (key, window_start, count)
values ('import:test', date_bin(make_interval(secs => 3600), now(), timestamptz '2000-01-01'), 1)
on conflict (key, window_start) do update set count = public.rate_limit_buckets.count + 1 returning count;
select test.ok((select count = 2 from public.rate_limit_buckets where key = 'import:test'), 'rate limit counter increments within a window');

-- profile.ts: unsubscribe by key (system, email_link source)
begin;
select set_config('context.consent_source', 'email_link', true);
update public.notification_preferences set enabled = false, unsubscribed_at = coalesce(unsubscribed_at, now())
  where unsubscribe_key = (select unsubscribe_key from public.notification_preferences where user_id = 'cccccccc-0000-4000-8000-000000000003');
commit;
select test.ok((select kind = 'reminders_unsubscribed' and source = 'email_link' from public.consent_events
                where user_id = 'cccccccc-0000-4000-8000-000000000003' order by created_at desc limit 1),
               'one-click unsubscribe is audited with its source');

-- imports.ts: removeSourceContent (system)
update public.source_imports set sanitized_text = null, content_removed_at = now()
  where user_id = 'cccccccc-0000-4000-8000-000000000003' and (null::uuid is null) and content_removed_at is null;
update public.habits h set source_evidence = null from public.routines r
  where h.routine_id = r.id and h.user_id = 'cccccccc-0000-4000-8000-000000000003';
select test.ok((select count(*) = 0 from public.habits where source_evidence is not null and user_id = 'cccccccc-0000-4000-8000-000000000003')
           and (select count(*) = 1 from public.habits where status = 'active' and user_id = 'cccccccc-0000-4000-8000-000000000003' and name = 'Chin tucks'),
               'removing source content keeps approved habits');

-- account.ts: deletion workflow
insert into public.deletion_jobs (user_id) values ('cccccccc-0000-4000-8000-000000000003') on conflict do nothing;
delete from public.profiles where id = 'cccccccc-0000-4000-8000-000000000003';
delete from auth.users where id = 'cccccccc-0000-4000-8000-000000000003';
update public.deletion_jobs set status = 'completed', completed_at = now(), attempts = attempts + 1
  where user_id = 'cccccccc-0000-4000-8000-000000000003' and status = 'pending';
select test.ok((select count(*) = 0 from public.scheduled_jobs where user_id = 'cccccccc-0000-4000-8000-000000000003')
           and (select count(*) = 0 from public.consent_events where user_id = 'cccccccc-0000-4000-8000-000000000003')
           and (select status = 'completed' from public.deletion_jobs where user_id = 'cccccccc-0000-4000-8000-000000000003'),
               'account deletion removes queued jobs and audit rows, and the job completes');

select 'ALL APP QUERY TESTS PASSED' as result;
