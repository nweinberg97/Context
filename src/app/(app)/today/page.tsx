import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TodayView } from "@/components/today/today-view";
import { requireViewer } from "@/lib/auth/session";
import { eventsBetween, shiftDate } from "@/lib/domain/events";
import { getProfile, getReminderSettings } from "@/lib/domain/profile";
import { listRoutines } from "@/lib/domain/routines";
import { localDateIn } from "@/lib/notifications/schedule";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string; saved?: string }> }) {
  const viewer = await requireViewer();
  const profile = await getProfile(viewer.id);
  if (!profile?.onboardedAt) redirect("/onboarding");

  const params = await searchParams;
  const today = localDateIn(new Date(), profile.timezone);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(today, i - 6));
  const earliest = shiftDate(today, -13);
  const requested = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const date = requested > today || requested < earliest ? today : requested;
  if (date !== today && !days.includes(date)) days.unshift(date);

  const [routines, events, reminders] = await Promise.all([
    listRoutines(viewer.id),
    eventsBetween(viewer.id, earliest, today),
    getReminderSettings(viewer.id),
  ]);

  return (
    <TodayView
      date={date}
      today={today}
      days={days}
      routines={routines.filter((r) => r.habits.length > 0)}
      events={events}
      banner={params.saved ? "saved" : null}
      remindersOn={Boolean(reminders?.enabled)}
    />
  );
}
