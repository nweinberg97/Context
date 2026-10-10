#!/usr/bin/env bash
# Runs the database authorization/lifecycle tests against a throwaway database.
#
#   TEST_DATABASE_ADMIN_URL  connection URL for a role that can create databases
#                            (default: the docker compose database)
#
# The test database is created from scratch, receives the local Supabase shim and every
# migration in supabase/migrations, runs db/tests/*.test.sql, and is dropped afterwards.
set -euo pipefail

ADMIN_URL="${TEST_DATABASE_ADMIN_URL:-postgres://postgres:postgres@localhost:54322/postgres}"
DB_NAME="context_test_$$"
TEST_URL="${ADMIN_URL%/*}/${DB_NAME}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required (install the PostgreSQL client, or run inside the db container)." >&2
  exit 1
fi

cleanup() { psql "$ADMIN_URL" -q -c "drop database if exists ${DB_NAME}" >/dev/null 2>&1 || true; }
trap cleanup EXIT

psql "$ADMIN_URL" -q -v ON_ERROR_STOP=1 -c "create database ${DB_NAME}"
psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f db/local/00_supabase_shim.sql
for migration in supabase/migrations/*.sql; do
  psql "$TEST_URL" -q -v ON_ERROR_STOP=1 -f "$migration"
done

status=0
for test_file in db/tests/*.test.sql; do
  echo "# ${test_file}"
  output="$(mktemp)"
  set +e
  psql "$TEST_URL" -q -At -v ON_ERROR_STOP=1 -f "$test_file" >"$output" 2>&1
  rc=$?
  set -e
  sed -n -e 's/^psql:[^ ]* NOTICE:  //p' -e '/ERROR\|PASSED/p' "$output"
  rm -f "$output"
  if [ "$rc" != "0" ]; then status=1; fi
done
exit $status
