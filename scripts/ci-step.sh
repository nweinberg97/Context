#!/usr/bin/env bash
# Runs a CI step and, on failure, turns the last lines of its output into GitHub
# annotations so failures are readable from the checks API.
set -uo pipefail
name="$1"; shift
log="$(mktemp)"
"$@" >"$log" 2>&1
rc=$?
cat "$log"
if [ "$rc" != "0" ]; then
  grep -vE '^\s*$' "$log" | tail -n 40 | sed "s/%/%25/g; s/^/::error title=${name}::/"
  echo "$name" >> "${RUNNER_TEMP:-/tmp}/ci-failed-steps"
fi
exit 0
