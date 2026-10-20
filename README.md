# Context

**Make good advice stick.** Context turns the advice you get from a physio, coach or tutor into a one-page routine you approve, follow and check off. You paste the part of a message that matters; Context suggests habits with the exact words they came from; nothing becomes active until you approve it.

Context is a personal organising tool. It does not diagnose, treat, or give medical or professional advice.

---

## Status — what works today

Be honest with yourself about this table before deploying.

| Area | Works locally, no credentials | Needs configuration | Not built yet |
| --- | --- | --- | --- |
| Landing page, app shell, design system | ✅ | | |
| Sign up / sign in / sign out | ✅ Local development mode (clearly labelled, refused in production unless explicitly allowed) | Supabase Auth: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Magic links, OAuth |
| Database + row-level security | ✅ Docker Postgres with a local Supabase shim | Supabase Postgres (same migrations) | |
| Onboarding (time zone, opt-in reminders) | ✅ | | |
| Paste import, parsing, de-duplication | ✅ | | `.eml` upload |
| Habit extraction | ✅ Rule-based reader (**not AI**, labelled as such) | AI extraction: `ANTHROPIC_API_KEY` | |
| Review: edit / approve / leave out / add your own | ✅ | | |
| Today one-pager, completion, corrections, history, print | ✅ | | |
| Routine PDF (designed, printable, one per routine) | ✅ Generated on demand at `/routines/:id/pdf`; no extra service | | |
| Routines: create, rename, archive, restore, delete | ✅ | | |
| Export, remove message text, delete account | ✅ | | |
| Email check-ins | ✅ `EMAIL_PROVIDER=outbox` writes emails to `.data/outbox` | Real email: `RESEND_API_KEY`, `EMAIL_FROM`; scheduler: `CRON_SECRET` + a scheduler calling `/api/cron/dispatch` | |
| Delivery webhooks | | `EMAIL_WEBHOOK_SECRET` | |
| Email forwarding address | | | Planned (interface only; the product says so) |
| Paid tier | | | Planned (landing page says "Planned") |

### What has been verified

- **58 database tests** (`db/tests/*.test.sql`) run against real PostgreSQL 16 with the exact migrations: cross-account isolation, column-level grants, approval lifecycle, consent audit, queue idempotency, deletion cascades, and every SQL statement the app issues, executed under the same role the app uses. A deliberately broken policy makes the suite fail.
- **46 unit tests** (`tests/unit`): parser, extraction schema, faithfulness guard (hallucinated quantities, prompt injection, malformed output, timeouts, retries), time-zone/DST scheduling, webhook signatures, email content.
- Strict TypeScript across `src/`, `scripts/` and `tests/unit`.
- Screens rendered and reviewed at 390px and 1440px with no horizontal overflow.

**Not yet run in this repository:** `npm install`, `next build`, ESLint, and the Playwright suite (`tests/e2e`). The environment used to write this code could not reach the npm registry. Run `npm run check` and `npm run test:e2e` before relying on a deploy — see [Run everything](#run-everything).

---

## Demo site (GitHub Pages)

A static, clickable demo (the landing page plus the main app screens, with sample data) is published to GitHub Pages by `.github/workflows/pages.yml` on every push to `main`. Nothing in the demo is saved; it shows what the product looks like, not a working account.

- One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
- Live at `https://<owner>.github.io/<repo>/` once the workflow has run.
- Build it locally with `npm run demo:build` (output in `demo-site/`). Fixtures live in `scripts/demo/pages.tsx`.

The real app needs a server and database, so it can't run on GitHub Pages; see [Production setup](#production-setup).

## Quick start (local, free)

Requirements: Node 20.18+, Docker (or any Postgres 15+), `psql` for the database tests.

```bash
npm install
cp .env.example .env.local        # defaults work as-is for local development
npm run db:up                     # Postgres 16 on localhost:54322
npm run db:migrate                # local Supabase shim + migrations
npm run dev                       # http://localhost:3000
```

You'll see a "Local development mode" banner: accounts live in your local database and are not production authentication. Extraction uses the rule-based reader; nothing leaves your machine.

To try check-in emails locally: set `EMAIL_PROVIDER=outbox` and `CRON_SECRET=<16+ chars>` in `.env.local`, turn check-ins on in Settings, then:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/dispatch
ls .data/outbox
```

## Run everything

```bash
npm run typecheck
npm run lint
npm run test:unit      # node:test via tsx — no network, no paid APIs
npm run test:db        # needs psql; uses TEST_DATABASE_ADMIN_URL (default: the docker DB)
npm run build
npm run test:e2e       # builds, starts on :3100, resets E2E_DATABASE_URL (default context_e2e)
```

`npm run check` runs typecheck, lint, unit, database tests and the build. CI (`.github/workflows/ci.yml`) runs all of it, including Playwright, against a Postgres service.

---

## Production setup

### 1. Supabase (auth + database)

1. Create a project. In **Authentication → URL configuration** set the site URL to your `APP_URL` and add `APP_URL/auth/callback` as a redirect URL.
2. Apply migrations: `supabase link` then `supabase db push`, or `DATABASE_URL=<connection string> npm run db:migrate`. The local shim is skipped automatically because Supabase already has the `auth` schema.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server only), and `DATABASE_URL` = the **transaction pooler** connection string (port 6543).
4. Leave `LOCAL_AUTH_SECRET` and `CONTEXT_ALLOW_LOCAL_AUTH` unset. Production refuses local sign-in without Supabase.

The app connects to Postgres directly and, for every request made on someone's behalf, runs `set local role authenticated` with that person's verified user id as JWT claims — the same mechanism Supabase's own API uses — so row-level security applies to every query.

### 2. AI extraction (optional)

Set `ANTHROPIC_API_KEY` (and optionally `ANTHROPIC_MODEL`, default `claude-haiku-5-5`). Before turning this on for real users, review the provider's data-retention and training terms for your account and keep Settings → Privacy accurate. People are asked to acknowledge external processing before their first import. There is no automatic fallback to another provider.

### 3. Check-in emails (optional)

1. Verify a sending domain with Resend; set `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`.
2. Schedule `POST /api/cron/dispatch` with `Authorization: Bearer $CRON_SECRET` every 5–15 minutes. Options: the included GitHub Actions workflow (`.github/workflows/checkins.yml`; set secrets `APP_URL`, `CRON_SECRET` and variable `CHECKINS_ENABLED=true`), Supabase `pg_cron` + `pg_net`, or Vercel Cron (Hobby plans only allow daily runs).
3. Optional: add a Resend webhook to `APP_URL/api/webhooks/email` and set `EMAIL_WEBHOOK_SECRET`. Bounces and complaints turn that person's check-ins off.

Without both an email provider and `CRON_SECRET`, check-ins are shown as unavailable and can't be enabled.

### 4. Hosting

Any Node host that runs Next.js works (Vercel, Render, Fly, a VPS). Set `APP_URL` to the public URL.

**Cost drivers** — none of these are unlimited on free tiers: Supabase (database size, monthly active users, pauses inactive free projects), the AI provider (per-token, roughly proportional to pasted text length; capped at 12,000 characters per import and 20 imports per person per hour), Resend (free tier has a daily cap — `MAX_EMAILS_PER_DAY` defaults to 90), and hosting function time (imports wait for extraction, up to ~40 seconds worst case).

---

## How it's built

- **Next.js 15 App Router**, TypeScript strict, Tailwind CSS 4, server actions for every mutation (POST only).
- **Postgres + RLS** via Supabase; one migration file is the source of truth (`supabase/migrations`).
- **Zod** at every boundary: environment, forms, parser output, extraction output.
- **Modules** (`src/lib`): `parser` · `extraction` (schema, guard, providers) · `domain` (imports, routines, events, profile, account) · `notifications` (schedule, dispatch, email, providers) · `auth` · `security` · `db`.
- **One typeface**, Bricolage Grotesque (SIL OFL), self-hosted in `public/fonts`.

More detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (including the data model) and [docs/SECURITY.md](docs/SECURITY.md).

## Project layout

```
src/app/                 routes: landing, (auth), (app)/{today,import,review,routines,settings,onboarding}, api/*
src/components/          design system (ui.tsx, icons.tsx), habits/*, today/*, app shell
src/lib/                 parser, extraction, domain, notifications, auth, security, db, config
supabase/migrations/     schema, RLS, triggers
db/local/                local-only Supabase shim (never applied to Supabase)
db/tests/                SQL authorization and app-query tests
tests/unit/              node:test unit tests
tests/e2e/               Playwright journeys (desktop + mobile)
scripts/                 migrate.ts, test-db.sh
```
