import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { deleteRoutineAction, setRoutineStatusAction } from "@/app/(app)/habit-actions";
import { AddHabit } from "@/components/habits/add-habit";
import { ConfirmSubmit, SubmitButton } from "@/components/habits/confirm-button";
import { HabitRow } from "@/components/habits/habit-row";
import { IconArchive, IconArrowLeft, IconTrash } from "@/components/icons";
import { Notice } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { eventsBetween, shiftDate } from "@/lib/domain/events";
import { getImport } from "@/lib/domain/imports";
import { getProfile } from "@/lib/domain/profile";
import { getRoutine } from "@/lib/domain/routines";
import { localDateIn } from "@/lib/notifications/schedule";
import { RenameRoutine } from "./rename";
import { SourcePanel } from "./source-panel";

export const metadata: Metadata = { title: "Routine" };

export default async function RoutinePage({ params }: { params: Promise<{ routineId: string }> }) {
  const viewer = await requireViewer();
  const { routineId } = await params;
  const routine = await getRoutine(viewer.id, routineId);
  if (!routine) notFound();
  if (routine.status === "draft") redirect(`/review/${routine.id}`);

  const profile = await getProfile(viewer.id);
  const today = localDateIn(new Date(), profile?.timezone ?? "UTC");
  const days = Array.from({ length: 14 }, (_, i) => shiftDate(today, i - 13));
  const [events, source] = await Promise.all([
    eventsBetween(viewer.id, days[0]!, today),
    routine.sourceImportId ? getImport(viewer.id, routine.sourceImportId) : Promise.resolve(null),
  ]);
  const active = routine.habits.filter((h) => h.status === "active");
  const archived = routine.habits.filter((h) => h.status === "archived");
  const isArchived = routine.status === "archived";

  return (
    <>
      <Link href="/routines" className="no-print mb-6 inline-flex items-center gap-1.5 text-[0.9375rem] font-semibold text-muted hover:text-ink">
        <IconArrowLeft size={18} /> All routines
      </Link>
      <RenameRoutine routineId={routine.id} title={routine.title} />

      {isArchived ? (
        <Notice tone="warning" className="mt-6" title="This routine is archived.">
          Its habits are hidden from today&rsquo;s page. Restore it to bring them back.
        </Notice>
      ) : null}

      <section aria-labelledby="habits-title" className="mt-10">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="habits-title" className="text-heading">Habits</h2>
          <p className="text-sm text-muted">Last 14 days · blank means not reported</p>
        </div>
        {active.length ? (
          <ul className="flex flex-col gap-3">
            {active.map((h) => (
              <HabitRow key={h.id} habit={h} routineId={routine.id} days={days} events={events.filter((e) => e.habitId === h.id)} />
            ))}
          </ul>
        ) : (
          <p className="text-muted">No active habits. Add one below.</p>
        )}
        <div className="mt-5">
          <AddHabit routineId={routine.id} label="Add a habit" />
        </div>
      </section>

      {archived.length ? (
        <section aria-labelledby="archived-habits" className="mt-12">
          <h2 id="archived-habits" className="mb-4 text-heading">Archived habits</h2>
          <ul className="flex flex-col gap-3">
            {archived.map((h) => (
              <HabitRow key={h.id} habit={h} routineId={routine.id} days={days} events={events.filter((e) => e.habitId === h.id)} />
            ))}
          </ul>
        </section>
      ) : null}

      {source ? <SourcePanel source={source} /> : null}

      <section aria-labelledby="manage-title" className="mt-12 border-t border-line pt-8">
        <h2 id="manage-title" className="text-lg font-bold">Manage routine</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <form action={setRoutineStatusAction.bind(null, routine.id, isArchived ? "active" : "archived")}>
            <SubmitButton variant="secondary" pendingLabel="Saving…">
              <IconArchive size={18} /> {isArchived ? "Restore routine" : "Archive routine"}
            </SubmitButton>
          </form>
          <form action={deleteRoutineAction.bind(null, routine.id)}>
            <ConfirmSubmit
              size="md"
              label="Delete routine"
              confirmLabel="Delete permanently"
              question="Delete this routine and its history?"
              icon={<IconTrash size={18} />}
            />
          </form>
        </div>
      </section>
    </>
  );
}
