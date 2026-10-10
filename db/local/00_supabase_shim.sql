-- LOCAL DEVELOPMENT ONLY. Never apply this file to a Supabase project.
--
-- Supabase provides the `auth` schema, the anon/authenticated/service_role roles and the
-- auth.uid() helper. This shim recreates the minimum surface the Context migrations rely
-- on so that the exact same migrations and RLS policies run on a plain Postgres 15+
-- (Docker, CI, or a local install). RLS behaves identically because the application
-- uses the same mechanism Supabase's API layer uses: `set local role authenticated`
-- plus `request.jwt.claims` inside a transaction.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- Local development credentials and sessions (used only when Supabase is not configured).
create schema if not exists local_auth;
revoke all on schema local_auth from public;

create table if not exists local_auth.credentials (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  password_hash text not null,
  created_at    timestamptz not null default now()
);

create table if not exists local_auth.sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists local_auth_sessions_user_idx on local_auth.sessions (user_id);
