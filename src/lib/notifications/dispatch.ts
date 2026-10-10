import "server-only";
import { getConfig } from "../config";
import { withSystem } from "../db";
import { log } from "../log";
import { buildCheckinEmail } from "./email";
import type { EmailProvider } from "./providers";
import { isSendable, planCheckin, type ReminderPreferences } from "./schedule";

/**
 * Durable check-in pipeline, driven by an external scheduler hitting /api/cron/dispatch.
 * Safe to run any number of times: jobs are unique per person per local day, claimed
 * with SKIP LOCKED, and sent with an idempotency key.
 */

interface PrefRow {
  userId: string;
  enabled: boolean;
  unsubscribedAt: string | null;
  pausedUntil: string | null;
  preferredLocalTime: string;
  timezone: string;
  days: number[];
}

export async function enqueueDueCheckins(now: Date): Promise<number> {
  const prefs = await withSystem((tx) =>
    tx.query<PrefRow>(
      `select np.user_id as "userId", np.enabled, np.unsubscribed_at as "unsubscribedAt", np.paused_until as "pausedUntil",
              to_char(np.preferred_local_time, 'HH24:MI') as "preferredLocalTime", np.timezone, np.days
       from public.notification_preferences np
       where np.enabled and np.unsubscribed_at is null
         and exists (select 1 from public.habits h where h.user_id = np.user_id and h.status = 'active')`,
    ),
  );
  let created = 0;
  for (const p of prefs) {
    const plan = planCheckin(
      { ...p, unsubscribedAt: p.unsubscribedAt ? new Date(p.unsubscribedAt) : null } satisfies ReminderPreferences,
      now,
    );
    if (!plan || isSendable(plan.runAt, now) === "expired") continue;
    const rows = await withSystem((tx) =>
      tx.query(
        `insert into public.scheduled_jobs (user_id, kind, local_date, run_at) values ($1, 'checkin_email', $2, $3)
         on conflict (user_id, kind, local_date) do update set status = 'pending', run_at = excluded.run_at, attempts = 0
           where public.scheduled_jobs.status = 'cancelled'
         returning id`,
        [p.userId, plan.localDate, plan.runAt.toISOString()],
      ),
    );
    created += rows.length;
  }
  return created;
}

interface ClaimedJob {
  id: string;
  userId: string;
  runAt: string;
  attempts: number;
  maxAttempts: number;
  email: string | null;
  unsubscribeKey: string;
  enabled: boolean;
  pausedUntil: string | null;
  localDate: string;
}

export async function dispatchDueCheckins(now: Date, provider: EmailProvider, batchSize = 25) {
  const config = getConfig();
  const summary = { sent: 0, skipped: 0, failed: 0, retried: 0 };

  const sentToday = await withSystem((tx) =>
    tx.one<{ n: number }>(`select count(*)::int as n from public.scheduled_jobs where status = 'sent' and updated_at > now() - interval '24 hours'`),
  );
  let budget = Math.max(0, config.email.maxPerDay - (sentToday?.n ?? 0));

  // Claim due jobs; release stale claims from crashed runs after 10 minutes.
  const jobs = await withSystem((tx) =>
    tx.query<ClaimedJob>(
      `with due as (
         select j.id from public.scheduled_jobs j
         where (j.status = 'pending' or (j.status = 'processing' and j.locked_at < now() - interval '10 minutes'))
           and j.run_at <= $1
         order by j.run_at
         limit $2
         for update skip locked
       )
       update public.scheduled_jobs j set status = 'processing', locked_at = now(), attempts = j.attempts + 1
       from due, public.notification_preferences np, public.profiles p
       where j.id = due.id and np.user_id = j.user_id and p.id = j.user_id
       returning j.id, j.user_id as "userId", j.run_at as "runAt", j.attempts, j.max_attempts as "maxAttempts",
                 p.email, np.unsubscribe_key as "unsubscribeKey", np.enabled, np.paused_until as "pausedUntil",
                 j.local_date as "localDate"`,
      [now.toISOString(), batchSize],
    ),
  );

  for (const job of jobs) {
    const finish = (status: string, fields: { category?: string; messageId?: string } = {}) =>
      withSystem((tx) =>
        tx.query(
          `update public.scheduled_jobs set status = $2, locked_at = null, last_error_category = $3,
             provider_message_id = coalesce($4, provider_message_id),
             delivery_status = case when $2 = 'sent' then 'sent' else delivery_status end
           where id = $1`,
          [job.id, status, fields.category ?? null, fields.messageId ?? null],
        ),
      );

    if (!job.enabled || (job.pausedUntil && job.pausedUntil >= job.localDate) || !job.email) {
      await finish("skipped", { category: !job.email ? "no_email" : "not_enabled" });
      summary.skipped++;
      continue;
    }
    if (isSendable(new Date(job.runAt), now) === "expired") {
      await finish("skipped", { category: "window_expired" });
      summary.skipped++;
      continue;
    }
    if (budget <= 0) {
      // Leave it for the next run inside the send window.
      await finish("pending", { category: "daily_limit" });
      summary.skipped++;
      continue;
    }

    const email = buildCheckinEmail({ appUrl: config.appUrl, unsubscribeKey: job.unsubscribeKey });
    const result = await provider.send(job.email, email, `checkin-${job.id}`);
    if (result.ok) {
      budget--;
      await finish("sent", { messageId: result.messageId });
      summary.sent++;
    } else if (result.retryable && job.attempts < job.maxAttempts) {
      await finish("pending", { category: result.category });
      summary.retried++;
    } else {
      await finish("failed", { category: result.category });
      summary.failed++;
    }
  }
  if (jobs.length) log.info("checkins.dispatched", { count: jobs.length, ...summary });
  return summary;
}

/** Applies delivery events from the email provider's webhook (already verified). */
export async function applyDeliveryEvent(providerMessageId: string, type: string): Promise<void> {
  const map: Record<string, string> = {
    "email.delivered": "delivered",
    "email.delivery_delayed": "delayed",
    "email.bounced": "bounced",
    "email.complained": "complained",
  };
  const status = map[type];
  if (!status) return;
  await withSystem(async (tx) => {
    const rows = await tx.query<{ userId: string }>(
      `update public.scheduled_jobs set delivery_status = $2 where provider_message_id = $1 returning user_id as "userId"`,
      [providerMessageId, status],
    );
    // A complaint or hard bounce turns reminders off for that person.
    if ((status === "complained" || status === "bounced") && rows[0]) {
      await tx.query(`select set_config('context.consent_source', 'system', true)`);
      await tx.query(`update public.notification_preferences set enabled = false where user_id = $1`, [rows[0].userId]);
    }
  });
}
