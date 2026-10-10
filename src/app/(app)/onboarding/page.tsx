import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth/session";
import { getPublicStatus } from "@/lib/config";
import { ensureProfile, getProfile } from "@/lib/domain/profile";
import { OnboardingFlow } from "./flow";

export const metadata: Metadata = { title: "Welcome" };

export default async function OnboardingPage() {
  const viewer = await requireViewer();
  let profile = await getProfile(viewer.id);
  if (!profile) {
    await ensureProfile(viewer.id, viewer.email);
    profile = await getProfile(viewer.id);
  }
  const status = getPublicStatus();
  return (
    <OnboardingFlow
      remindersAvailable={status.remindersAvailable}
      savedTimezone={profile?.onboardedAt ? profile.timezone : null}
    />
  );
}
