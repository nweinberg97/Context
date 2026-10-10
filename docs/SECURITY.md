# Privacy and security

## Principles

1. People choose exactly what is processed. There is no mailbox access.
2. Imported content is untrusted data. It is never executed, never rendered as HTML, and never trusted to set state.
3. Nothing becomes active without the person's approval.
4. Authorization is enforced by the database, not just the application.
5. Logs carry identifiers and categories, never content.

## Controls

| Concern | Control | Where |
| --- | --- | --- |
| Authentication | Supabase Auth, verified server-side with `getUser()`; local development mode uses scrypt + server-side sessions + HMAC-signed httpOnly cookies, and is refused in production unless explicitly allowed | `src/lib/auth` |
| Authorization | RLS on every user-owned table; composite FKs; column-level grants; system tables have no client grants | `supabase/migrations` |
| Server-side ownership | Every request on someone's behalf runs as role `authenticated` with their verified id; ids from forms are never trusted | `src/lib/db` |
| Input validation | Zod for env, forms, parsed input and model output; size limits on raw text, cleaned text, titles and fields | `src/lib/*/schema`, actions |
| Output escaping | React text rendering only; no `dangerouslySetInnerHTML`; email HTML escapes interpolated values | components, `notifications/email.ts` |
| Prompt injection | Content delimited as data; strict output schema; faithfulness guard drops injection-shaped candidates and ungrounded details; no tool use beyond structured output | `src/lib/extraction` |
| CSRF | All mutations are server actions (POST with Next's origin checks); email links never mutate on GET — the unsubscribe page requires a button press | `app/unsubscribe` |
| Rate limiting | Postgres fixed windows: sign-in attempts per IP and email, imports, exports, writes | `src/lib/security/ratelimit.ts` |
| Webhooks | Svix-style HMAC signatures, 5-minute timestamp tolerance, message-id replay table | `api/webhooks/email` |
| Scheduler | Constant-time bearer-secret check | `api/cron/dispatch` |
| Secrets | Server-only env; nothing secret in `NEXT_PUBLIC_*` besides the Supabase anon key (safe by design with RLS) | `.env.example` |
| Headers | CSP (self only), HSTS, frame denial, nosniff, referrer and permissions policies | `next.config.ts`, `middleware.ts` |
| URLs | No source text, tokens or personal data in URLs. The one exception is the single-purpose unsubscribe key, which can only turn check-ins off and only via POST | |
| Consent | Reminders off by default; changes audited by trigger with their source; AI processing acknowledged before first external import | migration, import action |
| Export / deletion | JSON export of everything stored; per-source text removal; durable account deletion | `domain/account.ts` |

## Processors

| Processor | When | Data sent |
| --- | --- | --- |
| Supabase | when configured | account and all app data (database host) |
| Anthropic | only when `ANTHROPIC_API_KEY` is set | the cleaned text a person pasted, plus its title |
| Resend | only when configured | the person's email address and a fixed, content-free message |

Verify each provider's retention, training and region settings before production use and keep the in-app explanation accurate.

## What this project does not claim

No HIPAA compliance, no end-to-end encryption, no zero-retention guarantee. Context is not an EHR, clinical decision-support system, or medical advice service. If you onboard clinics or handle data under specific regulations, get a legal review first.

## Known limitations

- Single-region Postgres; no field-level encryption beyond the provider's at-rest encryption.
- Rate limits are per window, not sliding; adequate for abuse prevention, not billing.
- The rule-based development reader recognises common English phrasings only.
- Local development auth has no password reset or email verification (by design — it is not for production).
