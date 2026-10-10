import "server-only";
import { getConfig } from "../config";
import { createSupabaseAdmin } from "../auth/supabase";
import { withSystem, withUser } from "../db";
import { log } from "../log";
import { HABIT_COLUMNS, IMPORT_COLUMNS, PREFS_COLUMNS, ROUTINE_COLUMNS } from "./types";

export const EXPORT_FORMAT_VERSION = 1;

/** Everything Context stores about a person, read under their own RLS context. */
export async function exportPersonalData(userId: string) {
  return withUser(userId, async (tx) => {
    const profile = await tx.one(
      `select id, email, display_name as "displayName", timezone, onboarded_at as "onboardedAt",
              ai_notice_acknowledged_at as "aiNoticeAcknowledgedAt", created_at as "createdAt" from public.profiles`,
    );
    const sources = await tx.query(`select ${IMPORT_COLUMNS} from public.source_imports order by created_at`);
    const routines = await tx.query(`select ${ROUTINE_COLUMNS} from public.routines order by created_at`);
    const habits = await tx.query(`select ${HABIT_COLUMNS}, created_at as "createdAt" from public.habits order by created_at`);
    const events = await tx.query(
      `select habit_id as "habitId", occurred_on as "occurredOn", state, count, duration_seconds as "durationSeconds",
              created_at as "createdAt", updated_at as "updatedAt" from public.habit_events order by occurred_on`,
    );
    const reminders = await tx.one(`select ${PREFS_COLUMNS} from public.notification_preferences`);
    const consent = await tx.query(`select kind, source, created_at as "createdAt" from public.consent_events order by created_at`);
    return {
      format: "context-export",
      version: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      profile,
      reminders,
      sources,
      routines,
      habits,
      habitEvents: events,
      consentEvents: consent,
    };
  });
}

/**
 * Account deletion as a durable workflow:
 *   1. record a deletion job (survives crashes; the scheduler retries it),
 *   2. delete all application data (cascades from the profile),
 *   3. delete the authentication identity,
 *   4. mark the job complete.
 * Application data is gone after step 2 even if step 3 needs a retry.
 */
export async function requestAccountDeletion(userId: string): Promise<"completed" | "pending"> {
  await withSystem((tx) =>
    tx.query(`insert into public.deletion_jobs (user_id) values ($1) on conflict do nothing`, [userId]),
  );
  return runDeletionJob(userId);
}

export async function runDeletionJob(userId: string): Promise<"completed" | "pending"> {
  await withSystem((tx) => tx.query(`delete from public.profiles where id = $1`, [userId]));

  let identityDeleted = false;
  try {
    const config = getConfig();
    if (config.auth.mode === "supabase") {
      const admin = createSupabaseAdmin();
      if (!admin) throw new Error("service role key missing");
      const { error } = await admin.auth.admin.deleteUser(userId);
      identityDeleted = !error || error.status === 404;
    } else {
      await withSystem((tx) => tx.query(`delete from auth.users where id = $1`, [userId]));
      identityDeleted = true;
    }
  } catch {
    identityDeleted = false;
  }

  await withSystem((tx) =>
    identityDeleted
      ? tx.query(`update public.deletion_jobs set status = 'completed', completed_at = now(), attempts = attempts + 1 where user_id = $1 and status = 'pending'`, [userId])
      : tx.query(`update public.deletion_jobs set attempts = attempts + 1, last_error_category = 'identity_delete_failed' where user_id = $1 and status = 'pending'`, [userId]),
  );
  log.info("account.deletion", { userId, status: identityDeleted ? "completed" : "pending" });
  return identityDeleted ? "completed" : "pending";
}

export async function retryPendingDeletions(limit = 20): Promise<number> {
  const pending = await withSystem((tx) =>
    tx.query<{ userId: string }>(
      `select user_id as "userId" from public.deletion_jobs where status = 'pending' and attempts < 20 order by requested_at limit $1`,
      [limit],
    ),
  );
  let completed = 0;
  for (const { userId } of pending) {
    if ((await runDeletionJob(userId)) === "completed") completed++;
  }
  return completed;
}
