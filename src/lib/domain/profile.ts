import "server-only";
import { z } from "zod";
import { withSystem, withUser } from "../db";
import { isValidTimeZone } from "../notifications/schedule";
import { PREFS_COLUMNS, type Profile, type ReminderSettings } from "./types";

export const timezoneSchema = z.string().trim().refine(isValidTimeZone, "Choose a valid time zone.");
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time like 08:00.");

export async function getProfile(userId: string): Promise<Profile | null> {
  return withUser(userId, (tx) =>
    tx.one<Profile>(
      `select id, email, display_name as "displayName", timezone, onboarded_at as "onboardedAt",
              ai_notice_acknowledged_at as "aiNoticeAcknowledgedAt"
       from public.profiles where id = $1`,
      [userId],
    ),
  );
}

/** Supabase creates auth users outside our process; make sure the profile rows exist. */
export async function ensureProfile(userId: string, email: string | null): Promise<void> {
  await withSystem(async (tx) => {
    await tx.query(`insert into public.profiles (id, email) values ($1, $2) on conflict (id) do nothing`, [userId, email]);
    await tx.query(`insert into public.notification_preferences (user_id) values ($1) on conflict (user_id) do nothing`, [userId]);
  });
}

export async function getReminderSettings(userId: string): Promise<ReminderSettings | null> {
  return withUser(userId, (tx) => tx.one<ReminderSettings>(`select ${PREFS_COLUMNS} from public.notification_preferences where user_id = $1`, [userId]));
}

export const onboardingSchema = z.object({
  timezone: timezoneSchema,
  remindersEnabled: z.boolean(),
  checkinTime: localTimeSchema.optional(),
});

export async function completeOnboarding(userId: string, input: z.infer<typeof onboardingSchema>): Promise<void> {
  await withUser(userId, async (tx) => {
    await tx.query(`update public.profiles set timezone = $2, onboarded_at = coalesce(onboarded_at, now()) where id = $1`, [userId, input.timezone]);
    await tx.query(
      `update public.notification_preferences set timezone = $2, preferred_local_time = coalesce($3::time, preferred_local_time), enabled = $4
       where user_id = $1`,
      [userId, input.timezone, input.checkinTime ?? null, input.remindersEnabled],
    );
  });
}

export async function updateTimezone(userId: string, timezone: string): Promise<void> {
  const tz = timezoneSchema.parse(timezone);
  await withUser(userId, async (tx) => {
    await tx.query(`update public.profiles set timezone = $2 where id = $1`, [userId, tz]);
    await tx.query(`update public.notification_preferences set timezone = $2 where user_id = $1`, [userId, tz]);
  });
}

export async function acknowledgeAiNotice(userId: string): Promise<void> {
  await withUser(userId, (tx) =>
    tx.query(`update public.profiles set ai_notice_acknowledged_at = coalesce(ai_notice_acknowledged_at, now()) where id = $1`, [userId]),
  );
}

export const reminderSettingsSchema = z.object({
  enabled: z.boolean(),
  preferredLocalTime: localTimeSchema,
  days: z.array(z.number().int().min(1).max(7)).min(1, "Pick at least one day.").max(7),
});

export async function updateReminderSettings(userId: string, input: z.infer<typeof reminderSettingsSchema>): Promise<void> {
  const days = [...new Set(input.days)].sort();
  await withUser(userId, (tx) =>
    tx.query(
      `update public.notification_preferences set enabled = $2, preferred_local_time = $3::time, days = $4::smallint[]
       where user_id = $1`,
      [userId, input.enabled, input.preferredLocalTime, days],
    ),
  );
}

export async function setReminderPause(userId: string, pausedUntil: string | null): Promise<void> {
  await withUser(userId, (tx) =>
    tx.query(`update public.notification_preferences set paused_until = $2 where user_id = $1`, [userId, pausedUntil]),
  );
}

/** One-click unsubscribe from an email link (key is single-purpose, set via POST only). */
export async function unsubscribeByKey(key: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(key)) return false;
  return withSystem(
    async (tx) => {
      const rows = await tx.query(
        `update public.notification_preferences set enabled = false, unsubscribed_at = coalesce(unsubscribed_at, now())
         where unsubscribe_key = $1 returning user_id`,
        [key],
      );
      return rows.length === 1;
    },
    { consentSource: "email_link" },
  );
}

export async function unsubscribeKeyExists(key: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(key)) return false;
  return withSystem(async (tx) => Boolean(await tx.one(`select 1 from public.notification_preferences where unsubscribe_key = $1`, [key])));
}
