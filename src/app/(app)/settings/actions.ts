"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LOCAL_SESSION_COOKIE } from "@/lib/auth/local";
import { requireViewer } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { getConfig, getPublicStatus } from "@/lib/config";
import { requestAccountDeletion } from "@/lib/domain/account";
import { shiftDate } from "@/lib/domain/events";
import { getProfile, reminderSettingsSchema, setReminderPause, updateReminderSettings, updateTimezone } from "@/lib/domain/profile";
import { localDateIn } from "@/lib/notifications/schedule";

export interface SettingsState {
  error?: string;
  saved?: boolean;
}

export async function updateTimezoneAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const viewer = await requireViewer();
  try {
    await updateTimezone(viewer.id, String(formData.get("timezone") ?? ""));
  } catch {
    return { error: "Choose a valid time zone." };
  }
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function saveRemindersAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const viewer = await requireViewer();
  const wantsOn = formData.get("enabled") === "on";
  if (wantsOn && !getPublicStatus().remindersAvailable) {
    return { error: "Email check-ins aren't set up on this server, so they can't be turned on yet." };
  }
  const parsed = reminderSettingsSchema.safeParse({
    enabled: wantsOn,
    preferredLocalTime: formData.get("time"),
    days: formData.getAll("days").map(Number),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await updateReminderSettings(viewer.id, parsed.data);
  revalidatePath("/settings");
  return { saved: true };
}

export async function pauseRemindersAction(days: number | null): Promise<void> {
  const viewer = await requireViewer();
  const profile = await getProfile(viewer.id);
  const today = localDateIn(new Date(), profile?.timezone ?? "UTC");
  const until = days === null ? null : shiftDate(today, Math.min(Math.max(days, 1), 90) - 1);
  await setReminderPause(viewer.id, until);
  revalidatePath("/settings");
}

export async function deleteAccountAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const viewer = await requireViewer();
  if (String(formData.get("confirm") ?? "").trim().toLowerCase() !== "delete") {
    return { error: "Type delete to confirm." };
  }
  await requestAccountDeletion(viewer.id);
  // End the session whether or not the identity deletion needs a retry.
  const config = getConfig();
  if (config.auth.mode === "supabase") {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut().catch(() => {});
  } else {
    (await cookies()).delete(LOCAL_SESSION_COOKIE);
  }
  redirect("/?deleted=1");
}
