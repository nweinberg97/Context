/**
 * Demo pages: the real landing page and app components rendered with sample data.
 * Nothing here talks to a server; scripts/demo/demo.js adds the clickable bits.
 */
import LandingPage from "@/app/page";
import { FinishReview } from "@/app/(app)/review/[routineId]/finish";
import { ImportForm } from "@/app/(app)/import/form";
import { DeleteAccountForm, RemindersForm, TimezoneForm } from "@/app/(app)/settings/forms";
import { AuthForm } from "@/app/(auth)/auth-form";
import { AppShell } from "@/components/app/shell";
import { HabitRow } from "@/components/habits/habit-row";
import { ReviewCard } from "@/components/habits/review-card";
import { SourceText } from "@/components/habits/source-text";
import { TodayView } from "@/components/today/today-view";
import { IconDownload } from "@/components/icons";
import { Notice, PageHeader, Wordmark, buttonClass } from "@/components/ui";
import type { Habit, HabitEvent, RoutineWithHabits } from "@/lib/domain/types";
import Link from "next/link";
import type { ReactNode } from "react";

let seq = 0;
const h = (o: Partial<Habit>): Habit => ({
  id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`,
  routineId: "r1",
  name: "",
  instruction: "",
  timingCue: null,
  frequency: null,
  quantity: null,
  duration: null,
  sourceEvidence: null,
  clarificationStatus: "none",
  clarificationNotes: [],
  origin: "extracted",
  status: "active",
  approvedAt: "2026-10-01T00:00:00.000Z",
  trackingType: "check",
  position: 0,
  ...o,
});

const TODAY = "2026-10-09";
const days = ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", TODAY];

const habits = [
  h({ name: "Chin tucks", instruction: "Do the chin tucks, 2 x 10, every morning.", timingCue: "every morning", frequency: { kind: "daily", text: "every morning", origin: "message" }, quantity: { sets: 2, reps: 10, text: "2 x 10", origin: "message" } }),
  h({ name: "Wall angels", instruction: "Wall angels, 3 x 8, every morning when you can.", timingCue: "every morning", quantity: { sets: 3, reps: 8, text: "3 x 8", origin: "message" } }),
  h({ name: "Walk", instruction: "Walk for 20 minutes after lunch.", timingCue: "after lunch", duration: { seconds: 1200, text: "20 minutes", origin: "message" } }),
  h({ name: "Doorway stretch", instruction: "Try the doorway stretch before bed.", timingCue: "before bed", quantity: { text: "30 seconds", origin: "person" } }),
];
const routines: RoutineWithHabits[] = [
  { id: "r1", title: "Neck & shoulders", status: "active", sourceImportId: null, createdAt: "", updatedAt: "", habits },
];
const ev = (habitId: string, occurredOn: string, state: HabitEvent["state"]): HabitEvent => ({ habitId, occurredOn, state, count: null, durationSeconds: null });
const events: HabitEvent[] = [
  ev(habits[0]!.id, "2026-10-04", "done"),
  ev(habits[0]!.id, "2026-10-05", "done"),
  ev(habits[0]!.id, "2026-10-06", "partial"),
  ev(habits[0]!.id, "2026-10-07", "done"),
  ev(habits[0]!.id, "2026-10-08", "done"),
  ev(habits[2]!.id, "2026-10-05", "done"),
  ev(habits[2]!.id, "2026-10-07", "skipped"),
  ev(habits[2]!.id, "2026-10-08", "done"),
  ev(habits[3]!.id, "2026-10-06", "done"),
  ev(habits[3]!.id, "2026-10-08", "partial"),
];
const status = { authMode: "supabase" as const, extractionMode: "anthropic" as const };

const SOURCE = `Hi Jordan,

Great work today. Do the chin tucks, 2 x 10, every morning. Your posture is already better.
Try the doorway stretch before bed. Keep working on your breathing exercises.

Walk for 20 minutes after lunch.

See you on the 24th,
Marina`;

const draft = [
  h({ status: "draft", approvedAt: null, name: "Chin tucks", instruction: "Do the chin tucks, 2 x 10, every morning.", timingCue: "every morning", frequency: { kind: "daily", text: "every morning", origin: "message" }, quantity: { sets: 2, reps: 10, text: "2 x 10", origin: "message" }, sourceEvidence: "Do the chin tucks, 2 x 10, every morning." }),
  h({ status: "draft", approvedAt: null, name: "Doorway stretch", instruction: "Try the doorway stretch before bed.", timingCue: "before bed", sourceEvidence: "Try the doorway stretch before bed.", clarificationNotes: ["The amount isn't stated."] }),
  h({ status: "draft", approvedAt: null, name: "Breathing exercises", instruction: "Keep working on your breathing exercises.", sourceEvidence: "Keep working on your breathing exercises.", clarificationStatus: "needs_input", clarificationNotes: ["The message doesn't say when or how often."] }),
  h({ status: "draft", approvedAt: null, name: "Walk", instruction: "Walk for 20 minutes after lunch.", timingCue: "after lunch", duration: { seconds: 1200, text: "20 minutes", origin: "message" }, sourceEvidence: "Walk for 20 minutes after lunch." }),
];

function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <aside className="on-dark relative hidden flex-col justify-between overflow-hidden bg-forest p-12 text-paper lg:flex">
        <Link href="/" aria-label="Context home" className="text-[1.25rem]"><Wordmark tone="paper" /></Link>
        <p className="text-title max-w-[14ch] font-extrabold">
          The advice you paid for, <span className="mark">on one page.</span>
        </p>
        <p className="max-w-sm text-paper/70">Paste what your physio, coach or tutor sent. Approve the habits. Check in each day.</p>
      </aside>
      <main id="main" tabIndex={-1} className="flex flex-col px-4 py-8 sm:px-10">
        <Link href="/" aria-label="Context home" className="text-[1.15rem] lg:hidden"><Wordmark /></Link>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="text-title">{mode === "sign-up" ? "Start your first routine." : "Welcome back."}</h1>
          <p className="mb-8 mt-3 text-muted">
            {mode === "sign-up" ? "Free while Context is in early access." : "Sign in to see today’s routine."}
          </p>
          <AuthForm mode={mode} action={async () => ({})} />
        </div>
      </main>
    </div>
  );
}

const routineDays = ["2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", ...days];

export interface DemoPage {
  file: string;
  title: string;
  /** The app path this page stands in for (drives the active nav item). */
  path: string;
  element: ReactNode;
}

export async function demoPages(): Promise<DemoPage[]> {
  return [
    { file: "index.html", title: "Context — Make good advice stick", path: "/", element: await LandingPage({ searchParams: Promise.resolve({}) }) },
    { file: "sign-up.html", title: "Create your account · Context", path: "/sign-up", element: <AuthScreen mode="sign-up" /> },
    { file: "sign-in.html", title: "Sign in · Context", path: "/sign-in", element: <AuthScreen mode="sign-in" /> },
    {
      file: "import.html",
      title: "Add advice · Context",
      path: "/import",
      element: (
        <AppShell status={status}>
          <PageHeader title="Paste your first piece of advice." lede="Paste the part of an email, message or note with the advice in it. Context suggests habits; you decide which to keep." />
          <ImportForm maxChars={12000} processor={{ kind: "external", model: "claude-haiku-5-5", acknowledged: true }} />
        </AppShell>
      ),
    },
    {
      file: "review.html",
      title: "Review habits · Context",
      path: "/review/r1",
      element: (
        <AppShell status={status}>
          <PageHeader title="Here's what we found." lede="Approve the habits you want to follow. Edit anything, leave out what doesn't fit, or add your own." />
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start">
            <section aria-labelledby="source-title" className="lg:sticky lg:top-24">
              <div className="rounded-[var(--radius-card)] bg-sage/60 p-5">
                <h2 id="source-title" className="text-lg font-bold">Re: your home program</h2>
                <div className="mt-3 max-h-64 overflow-y-auto pr-1 lg:max-h-[60vh]">
                  <SourceText text={SOURCE} habits={draft} />
                </div>
                <p className="mt-4 border-t border-sage-2 pt-3 text-sm text-muted">
                  Read by claude-haiku-5-5 (AI). Suggestions can be wrong, so check each one.
                </p>
              </div>
            </section>
            <section aria-label="Suggested habits" className="flex min-w-0 flex-col gap-4">
              {draft.map((d, i) => (
                <ReviewCard key={d.id} habit={d} routineId="r1" index={i} />
              ))}
              <FinishReview routineId="r1" defaultTitle="Neck & shoulders" approvedCount={0} pendingCount={draft.length} />
            </section>
          </div>
        </AppShell>
      ),
    },
    {
      file: "today.html",
      title: "Today · Context",
      path: "/today",
      element: (
        <AppShell status={status}>
          <TodayView date={TODAY} today={TODAY} days={days} routines={routines} events={events} banner="saved" savedRoutineId="r1" remindersOn={false} />
        </AppShell>
      ),
    },
    {
      file: "routines.html",
      title: "Neck & shoulders · Context",
      path: "/routines/r1",
      element: (
        <AppShell status={status}>
          <h1 className="text-title">Neck &amp; shoulders</h1>
          <p className="mt-3 text-muted">From Marina Chen, Northside Physio</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link href="/routines/r1/pdf" className={buttonClass("primary")}>
              <IconDownload size={18} /> Download PDF
            </Link>
            <span className="text-sm text-muted">One page with your approved habits, in the advisor&rsquo;s words, ready to print.</span>
          </div>
          <div className="mb-4 mt-10 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-heading">Habits</h2>
            <p className="text-sm text-muted">Last 14 days · blank means not reported</p>
          </div>
          <ul className="flex flex-col gap-3">
            {habits.map((x) => (
              <HabitRow key={x.id} habit={x} routineId="r1" days={routineDays} events={events.filter((e) => e.habitId === x.id)} />
            ))}
          </ul>
        </AppShell>
      ),
    },
    {
      file: "settings.html",
      title: "Settings · Context",
      path: "/settings",
      element: (
        <AppShell status={status}>
          <PageHeader title="Settings" />
          <div className="flex flex-col gap-6">
            <section className="card p-5 sm:p-7">
              <h2 className="mb-5 text-heading">Account</h2>
              <dl className="mb-6 grid gap-1 text-[0.9375rem]">
                <dt className="font-semibold text-muted">Email</dt>
                <dd className="text-lg font-semibold">jordan@example.com</dd>
              </dl>
              <TimezoneForm timezone="America/Vancouver" />
            </section>
            <section className="card p-5 sm:p-7">
              <h2 className="mb-5 text-heading">Check-ins</h2>
              <RemindersForm settings={{ enabled: false, preferredLocalTime: "08:00", timezone: "America/Vancouver", days: [1, 2, 3, 4, 5], pausedUntil: null, unsubscribedAt: null }} available />
            </section>
            <section className="card p-5 sm:p-7">
              <h2 className="mb-5 text-heading">Privacy and your data</h2>
              <Notice tone="info">
                Text you paste is sent to claude-haiku-5-5 (Anthropic) to find habits. Context stores a cleaned copy so you can see where each habit came from.
              </Notice>
            </section>
            <section className="rounded-[var(--radius-card)] border border-[#e7c4bb] bg-white p-5 sm:p-7">
              <h2 className="mb-5 text-heading">Delete account</h2>
              <DeleteAccountForm />
            </section>
          </div>
        </AppShell>
      ),
    },
  ];
}
