-- Database authorization & lifecycle tests.
-- Run against a disposable database that has the local shim and all migrations applied:
--   npm run test:db
-- Every assertion raises on failure, and psql runs with ON_ERROR_STOP, so the script
-- exits non-zero on the first broken guarantee.

create schema if not exists test;
grant usage on schema test to authenticated, anon;

create or replace function test.ok(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition is not true then
    raise exception 'FAIL: %', label;
  end if;
  raise notice 'ok - %', label;
end $$;

-- Asserts that a statement fails. Runs with the caller's role, so RLS/grants apply.
create or replace function test.fails(stmt text, label text)
returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    raise notice 'ok - % (%)', label, sqlstate;
    return;
  end;
  raise exception 'FAIL: % — statement succeeded: %', label, stmt;
end $$;

-- Switches the current transaction to a signed-in person, the way the app's
-- withUser() helper and Supabase's API layer do.
create or replace function test.as_user(uid uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

grant execute on all functions in schema test to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures (system role)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'a@example.test'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'b@example.test');

insert into public.source_imports (id, user_id, source_type, title, sanitized_text, content_fingerprint, status, parser_version)
values
  ('aaaaaaaa-1111-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'paste', 'Physio', 'Do the stretch.', repeat('a', 64), 'ready_for_review', 'parser@1'),
  ('bbbbbbbb-1111-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'paste', 'Tutor',  'Read nightly.',   repeat('b', 64), 'ready_for_review', 'parser@1');

insert into public.routines (id, user_id, source_import_id, title, status) values
  ('aaaaaaaa-2222-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001', 'A routine', 'active'),
  ('bbbbbbbb-2222-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-1111-4000-8000-000000000002', 'B routine', 'active');

insert into public.habits (id, user_id, routine_id, name, instruction, origin, status) values
  ('aaaaaaaa-3333-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-000000000001', 'Stretch', 'Do the stretch.', 'manual', 'active'),
  ('bbbbbbbb-3333-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-2222-4000-8000-000000000002', 'Read', 'Read nightly.', 'manual', 'active');

select test.ok((select count(*) = 2 from public.profiles), 'signup trigger creates profiles');
select test.ok((select bool_and(not enabled) from public.notification_preferences), 'reminders default to off for every new person');

-- ---------------------------------------------------------------------------
-- Cross-account isolation
-- ---------------------------------------------------------------------------
begin;
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select test.ok((select count(*) = 1 from public.routines), 'A sees only their own routines');
select test.ok((select count(*) = 0 from public.routines where id = 'bbbbbbbb-2222-4000-8000-000000000002'), 'A cannot read B''s routine by id');
select test.ok((select count(*) = 0 from public.habits where user_id = 'bbbbbbbb-0000-4000-8000-000000000002'), 'A cannot read B''s habits');
select test.ok((select count(*) = 0 from public.source_imports where id = 'bbbbbbbb-1111-4000-8000-000000000002'), 'A cannot read B''s source content');
select test.ok((select count(*) = 1 from public.profiles), 'A sees only their own profile');
rollback;

begin;
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
with u as (update public.habits set name = 'pwned' where id = 'bbbbbbbb-3333-4000-8000-000000000002' returning 1)
select test.ok((select count(*) = 0 from u), 'A cannot modify B''s habit');
with d as (delete from public.routines where id = 'bbbbbbbb-2222-4000-8000-000000000002' returning 1)
select test.ok((select count(*) = 0 from d), 'A cannot delete B''s routine');
with d as (delete from public.source_imports where id = 'bbbbbbbb-1111-4000-8000-000000000002' returning 1)
select test.ok((select count(*) = 0 from d), 'A cannot delete B''s source');
rollback;

begin;
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select test.fails($$insert into public.habit_events (habit_id, occurred_on, state)
                    values ('bbbbbbbb-3333-4000-8000-000000000002', current_date, 'done')$$,
                  'A cannot submit a completion event for B''s habit');
rollback;

begin;
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select test.fails($$insert into public.habits (routine_id, name, instruction)
                    values ('bbbbbbbb-2222-4000-8000-000000000002', 'x', 'x')$$,
                  'A cannot attach a habit to B''s routine');
rollback;

begin;
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select test.fails($$insert into public.routines (user_id, title) values ('bbbbbbbb-0000-4000-8000-000000000002', 'x')$$,
                  'A cannot create a routine owned by B');
rollback;

begin;
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select test.fails($$insert into public.routines (title, source_import_id) values ('x', 'bbbbbbbb-1111-4000-8000-000000000002')$$,
                  'A cannot link a routine to B''s source');
rollback;

-- ---------------------------------------------------------------------------
-- Sessions: no claims (invalid, expired or revoked session) means no data
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', '', true);
select test.ok((select count(*) = 0 from public.routines), 'authenticated role without a subject sees nothing');
select test.fails($$insert into public.routines (title) values ('x')$$, 'authenticated role without a subject cannot write');
rollback;

begin;
set local role anon;
select test.fails('select * from public.routines', 'anonymous callers have no table access');
select test.fails('select * from public.habit_events', 'anonymous callers cannot read events');
rollback;

-- ---------------------------------------------------------------------------
-- Trusted metadata cannot be forged through the client role
-- ---------------------------------------------------------------------------
begin;
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select test.fails($$insert into public.source_imports (source_type, content_fingerprint, parser_version)
                    values ('email_forward', repeat('c', 64), 'forged')$$,
                  'clients cannot create imports directly (server pipeline only)');
select test.fails($$update public.source_imports set status = 'reviewed' where id = 'aaaaaaaa-1111-4000-8000-000000000001'$$,
                  'clients cannot change import status');
select test.fails($$update public.source_imports set content_fingerprint = repeat('d', 64)$$,
                  'clients cannot change fingerprints');
select test.fails($$update public.habits set user_id = 'bbbbbbbb-0000-4000-8000-000000000002'$$,
                  'clients cannot reassign ownership');
select test.fails($$update public.habits set approved_at = '2000-01-01'$$,
                  'clients cannot write approved_at');
select test.fails('select unsubscribe_key from public.notification_preferences',
                  'clients cannot read the unsubscribe key');
select test.fails('select * from public.scheduled_jobs', 'clients cannot read the job queue');
select test.fails('select * from public.deletion_jobs', 'clients cannot read deletion jobs');
select test.fails($$insert into public.consent_events (user_id, kind) values (auth.uid(), 'reminders_opt_in')$$,
                  'clients cannot forge consent events');
rollback;

-- ---------------------------------------------------------------------------
-- Habit lifecycle
-- ---------------------------------------------------------------------------
begin;
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.habits (routine_id, name, instruction, origin, status)
  values ('aaaaaaaa-2222-4000-8000-000000000001',
          'Mobility', 'Try the mobility exercise before work.', 'extracted', 'active')
  returning id as habit_id \gset
select set_config('test.habit', :'habit_id', true);
select test.ok((select status = 'draft' and approved_at is null from public.habits where id = :'habit_id'),
               'extracted habits are forced to draft even if inserted as active');
select test.fails($$insert into public.habit_events (habit_id, occurred_on, state)
                    values (current_setting('test.habit')::uuid, current_date, 'done')$$,
                  'draft habits cannot receive completion events');

update public.habits set status = 'active' where id = :'habit_id';
select test.ok((select status = 'active' and approved_at is not null and approved_at <= now()
                from public.habits where id = :'habit_id'),
               'approving stamps approved_at from the server clock');

update public.habits set name = 'Mobility drill', timing_cue = 'Before work' where id = :'habit_id';
select test.ok((select name = 'Mobility drill' and status = 'active' and approved_at is not null
                from public.habits where id = :'habit_id'),
               'approved habits can be edited and stay approved');

select test.fails($$update public.habits set status = 'draft' where id = current_setting('test.habit')::uuid$$,
                  'approved habits cannot silently return to draft');

insert into public.habit_events (habit_id, occurred_on, state)
  values (:'habit_id', current_date, 'done');
select test.fails($$insert into public.habit_events (habit_id, occurred_on, state)
                    values (current_setting('test.habit')::uuid, current_date, 'done')$$,
                  'a second plain insert for the same day is rejected (no duplicate events)');
insert into public.habit_events (habit_id, occurred_on, state)
  values (:'habit_id', current_date, 'partial')
  on conflict (habit_id, occurred_on) do update set state = excluded.state;
select test.ok((select count(*) = 1 and min(state) = 'partial' from public.habit_events
                where habit_id = :'habit_id'),
               'correcting a report updates the single event for that day');
delete from public.habit_events where habit_id = :'habit_id' and occurred_on = current_date;
select test.ok((select count(*) = 0 from public.habit_events where habit_id = :'habit_id'),
               'an accidental report can be removed, returning the day to unreported');
select test.fails($$insert into public.habit_events (habit_id, occurred_on, state)
                    values (current_setting('test.habit')::uuid, current_date + 30, 'done')$$,
                  'events far in the future are rejected');
rollback;

begin;
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
insert into public.habits (routine_id, name, instruction, origin)
  values ('aaaaaaaa-2222-4000-8000-000000000001', 'Noise', 'Thanks for coming in.', 'extracted')
  returning id as habit_id \gset
select set_config('test.habit', :'habit_id', true);
update public.habits set status = 'rejected' where id = :'habit_id';
select test.ok((select status = 'rejected' and approved_at is null from public.habits where id = :'habit_id'),
               'rejected habits never become active');
select test.fails($$update public.habits set status = 'archived' where id = current_setting('test.habit')::uuid$$,
                  'a never-approved habit cannot be archived into the active set');
rollback;

-- ---------------------------------------------------------------------------
-- Consent audit
-- ---------------------------------------------------------------------------
begin;
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
update public.notification_preferences set enabled = true, preferred_local_time = '07:30';
select test.ok((select count(*) = 1 from public.consent_events where kind = 'reminders_opt_in'),
               'opting in records a consent event');
update public.notification_preferences set paused_until = current_date + 7;
update public.notification_preferences set enabled = false;
select test.ok((select array_agg(kind order by created_at, kind) @> array['reminders_paused', 'reminders_opt_out']
                from public.consent_events),
               'pausing and opting out are audited');
rollback;

begin;
select test.as_user('bbbbbbbb-0000-4000-8000-000000000002');
select test.ok((select count(*) = 0 from public.consent_events), 'B cannot see A''s consent events');
rollback;

-- ---------------------------------------------------------------------------
-- Check-in queue
-- ---------------------------------------------------------------------------
begin;
update public.notification_preferences set enabled = true where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into public.scheduled_jobs (user_id, kind, local_date, run_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'checkin_email', current_date, now());
select test.fails($$insert into public.scheduled_jobs (user_id, kind, local_date, run_at)
                    values ('aaaaaaaa-0000-4000-8000-000000000001', 'checkin_email', current_date, now())$$,
                  'a second check-in for the same local day cannot be queued');
-- The scheduler's idempotent upsert leaves an existing pending job untouched.
insert into public.scheduled_jobs (user_id, kind, local_date, run_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'checkin_email', current_date, now() + interval '1 hour')
  on conflict (user_id, kind, local_date) do update set status = 'pending', run_at = excluded.run_at
  where scheduled_jobs.status = 'cancelled';
select test.ok((select count(*) = 1 and bool_and(run_at <= now()) from public.scheduled_jobs), 'scheduler re-runs do not duplicate or move a pending job');

select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
update public.notification_preferences set paused_until = current_date + 3;
reset role;
select test.ok((select status = 'cancelled' from public.scheduled_jobs where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
               'pausing reminders cancels pending check-ins');
rollback;

begin;
update public.notification_preferences set enabled = true where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into public.scheduled_jobs (user_id, kind, local_date, run_at)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'checkin_email', current_date, now());
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
update public.notification_preferences set enabled = false;
reset role;
select test.ok((select status = 'cancelled' from public.scheduled_jobs where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
               'turning reminders off cancels pending check-ins');
rollback;

-- ---------------------------------------------------------------------------
-- Deletion
-- ---------------------------------------------------------------------------
begin;
select test.as_user('aaaaaaaa-0000-4000-8000-000000000001');
delete from public.source_imports where id = 'aaaaaaaa-1111-4000-8000-000000000001';
select test.ok((select source_import_id is null and status = 'active' from public.routines
                where id = 'aaaaaaaa-2222-4000-8000-000000000001'),
               'deleting a source keeps the approved routine and clears the link');
rollback;

begin;
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-000000000001';
select test.ok((select count(*) = 0 from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001')
           and (select count(*) = 0 from public.routines where user_id = 'aaaaaaaa-0000-4000-8000-000000000001')
           and (select count(*) = 0 from public.habits where user_id = 'aaaaaaaa-0000-4000-8000-000000000001')
           and (select count(*) = 0 from public.source_imports where user_id = 'aaaaaaaa-0000-4000-8000-000000000001')
           and (select count(*) = 0 from public.notification_preferences where user_id = 'aaaaaaaa-0000-4000-8000-000000000001'),
               'deleting an account removes every row it owns');
select test.ok((select count(*) = 1 from public.routines), 'deleting one account leaves other accounts intact');
rollback;

select 'ALL DATABASE TESTS PASSED' as result;
