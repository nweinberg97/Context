"use server";

import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/session";
import { getPublicStatus } from "@/lib/config";
import { completeOnboarding, onboardingSchema } from "@/lib/domain/profile";

export interface OnboardingState {
  error?: string;
}

export async function completeOnboardingAction(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const viewer = await requireViewer();
  const { remindersAvailable } = getPublicStatus();
  const wantsReminders = formData.get("reminders") === "on";
  const time = String(formData.get("checkinTime") ?? "");
  const parsed = onboardingSchema.safeParse({
    timezone: formData.get("timezone"),
    // Opt-in only: unchecked (the default) means no reminders.
    remindersEnabled: remindersAvailable && wantsReminders,
    checkinTime: time ? time : undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your answers and try again." };
  await completeOnboarding(viewer.id, parsed.data);
  redirect("/import?first=1");
}
