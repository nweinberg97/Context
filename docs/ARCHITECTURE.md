# Architecture

Context is a modular monolith: one Next.js app, one Postgres database, and two optional external providers (an AI model and an email service) behind small interfaces.

```
 browser ──► Next.js (server components + server actions)
               │
               ├─ auth/        verify session (Supabase getUser, or local signed session)
               ├─ domain/      routines, habits, events, imports, profile, account
               │     └─ db.withUser(userId)   → set local role authenticated + JWT claims → RLS
               │     └─ db.withSystem()       → trusted pipeline/queue work only
               ├─ parser/      deterministic cleaning, limits, fingerprint
               ├─ extraction/  provider → strict schema → faithfulness guard
               └─ notifications/ plan (pure) → queue (Postgres) → send (provider)

 scheduler ──► POST /api/cron/dispatch (bearer secret)
 email provider ──► POST /api/webhooks/email (signed, replay-protected)
```

## The import pipeline

1. **Parse** (`src/lib/parser`) — bounded input (50k raw, 12k cleaned), Unicode/whitespace normalisation, HTML → text with a small tokenizer, header/forward/quoted-history/signature removal (conservative: quoted text is only removed when real content precedes it). Output carries flags describing what was removed. A SHA-256 fingerprint of the normalised body makes imports idempotent.
2. **Record** — the server inserts the `source_imports` row with the verified user id (system role). Clients cannot insert or alter imports.
3. **Extract** (`src/lib/extraction`) — one configured provider, hard timeout per attempt, at most two attempts for retryable failures, no cross-provider fallback. Providers return raw, untrusted output.
4. **Validate and guard** — strict Zod schema (unknown fields rejected), then `guard.ts`:
   - evidence must appear in the source, or the candidate is dropped;
   - instructions must be source wording, else the evidence is used;
   - timing cues, frequencies, amounts and durations must appear in that candidate's own evidence, and their numbers must match the text — unsupported details are removed and the person is told;
   - candidates echoing instructions aimed at the software are discarded;
   - de-duplication and a 12-candidate cap.
5. **Store drafts** — a draft routine and draft habits, written as the person (RLS). A database trigger forces extracted habits to `draft` whatever the caller sends.
6. **Review** — the person approves, edits, leaves out, or adds habits. Approval stamps `approved_at` in the database. Saving requires at least one approved habit; unreviewed drafts are left out, never activated.

## Data model

| Table | Purpose | Notes |
| --- | --- | --- |
| `profiles` | one row per person | FK to `auth.users`, cascades on deletion |
| `source_imports` | a pasted message | sanitized text only (no raw input), fingerprint unique per person, parser/extraction versions, status, error category; text can be removed independently |
| `routines` | a group of habits | optional link to a source; `on delete set null (source_import_id)` keeps approved routines when a source is deleted |
| `habits` | one action | structured `frequency`/`quantity`/`duration` JSON, each marked as from the message or the person; evidence; clarification notes; lifecycle `draft → active ↔ archived`, `rejected` |
| `habit_events` | a self-report for a day | unique per habit per day (`done`/`partial`/`skipped`); no row = not reported, never a failure |
| `notification_preferences` | check-in settings | off by default; single-purpose unsubscribe key not readable by clients |
| `consent_events` | append-only audit | written by triggers (opt-in/out, pause/resume, unsubscribe, AI notice) |
| `scheduled_jobs` | durable check-in queue | unique per person per local day; claimed with `FOR UPDATE SKIP LOCKED`; delivery status from webhooks |
| `deletion_jobs` | account deletion workflow | retried by the scheduler until the auth identity is gone |
| `rate_limit_buckets`, `webhook_events` | system tables | no client access |

Key decisions:

- **Composite foreign keys** (`(routine_id, user_id)`, `(habit_id, user_id)`) make cross-account references impossible at the schema level, independent of RLS.
- **Column-level grants** limit what a client role can change to fields a person legitimately edits. Pipeline metadata and `approved_at` cannot be written by clients — including through Supabase's public REST API with a valid user token.
- **Triggers own invariants** that must hold no matter which code path runs: approval stamping, draft-only extraction, events only on active habits, consent auditing, cancelling queued check-ins when reminders are paused or turned off.
- **Dates are local calendar dates** (`date`), computed from the person's time zone on the server, so "today" is never the server's today.

## Retention and deletion

- Raw input is never stored. The cleaned text is kept so people can see where habits came from, until they remove it (per source or all at once). Removing text also clears evidence quotes on habits; approved habits remain.
- Deleting a source deletes unreviewed draft routines from it and keeps approved routines.
- Deleting an account records a deletion job, deletes all application data (cascade from `profiles`), deletes the auth identity, then completes the job. If the identity deletion fails, the scheduler retries; the data is already gone.

## Scheduling

`planCheckin()` is pure: given preferences and "now" it returns the local date and the UTC instant for today's check-in (DST gaps resolve forward, ambiguous times to the earlier instant). The dispatcher enqueues with an idempotent upsert, claims due jobs with `SKIP LOCKED`, respects a daily send budget and a 6-hour send window, retries transient failures up to five attempts, and sends with an idempotency key. Nothing depends on in-process timers.

## Extending

- **Email forwarding**: add an inbound provider that verifies the sender, calls `parseSelectedText` (or a MIME parser for full messages), and sets `trusted.senderVerified`. `source_type = 'email_forward'` already exists.
- **Another model provider**: implement `ExtractionProvider` (`src/lib/extraction/providers/types.ts`). The guard and schema apply automatically.
