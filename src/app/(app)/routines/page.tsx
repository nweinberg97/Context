import type { Metadata } from "next";
import Link from "next/link";
import { setRoutineStatusAction } from "@/app/(app)/habit-actions";
import { SubmitButton } from "@/components/habits/confirm-button";
import { IconAdd } from "@/components/icons";
import { LinkButton, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { listRoutines } from "@/lib/domain/routines";
import type { RoutineWithHabits } from "@/lib/domain/types";
import { NewRoutine } from "./new-routine";

export const metadata: Metadata = { title: "Routines" };

export default async function RoutinesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const all = await listRoutines(viewer.id, { statuses: ["draft", "active", "archived"], habitStatuses: ["draft", "active"] });
  const active = all.filter((r) => r.status === "active");
  const drafts = all.filter((r) => r.status === "draft");
  const archived = all.filter((r) => r.status === "archived");

  return (
    <>
      <PageHeader
        title="Routines"
        lede="Each routine holds the habits from one piece of advice — or ones you wrote yourself."
        actions={<LinkButton href="/import"><IconAdd size={18} /> Add advice</LinkButton>}
      />

      {drafts.length ? (
        <section aria-labelledby="drafts-title" className="mb-12">
          <h2 id="drafts-title" className="mb-4 text-heading">Waiting for review</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {drafts.map((r) => (
              <li key={r.id}>
                <Link href={`/review/${r.id}`} className="card flex items-center justify-between gap-4 border-[#ecd27a] bg-mark-2/40 p-5 hover:border-ink">
                  <span className="min-w-0">
                    <span className="block truncate text-lg font-bold">{r.title}</span>
                    <span className="block text-[0.9375rem] text-muted">{r.habits.length} suggestion{r.habits.length === 1 ? "" : "s"} to review</span>
                  </span>
                  <span className="shrink-0 font-semibold underline underline-offset-4">Review</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="active-title" className="mb-12">
        <h2 id="active-title" className="mb-4 text-heading">Active</h2>
        {active.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {active.map((r) => (
              <RoutineCard key={r.id} routine={r} />
            ))}
          </ul>
        ) : (
          <p className="text-muted">No active routines yet. Add advice, or write one yourself below.</p>
        )}
        <div className="mt-6">
          <NewRoutine startOpen={params.new === "1"} />
        </div>
      </section>

      {archived.length ? (
        <section aria-labelledby="archived-title">
          <h2 id="archived-title" className="mb-4 text-heading">Archived</h2>
          <ul className="flex flex-col gap-2">
            {archived.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line px-5 py-3">
                <Link href={`/routines/${r.id}`} className="min-w-0 truncate font-semibold hover:underline">{r.title}</Link>
                <form action={setRoutineStatusAction.bind(null, r.id, "active")}>
                  <SubmitButton size="sm" variant="secondary" pendingLabel="Restoring…">Restore</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function RoutineCard({ routine }: { routine: RoutineWithHabits }) {
  const habits = routine.habits.filter((h) => h.status === "active");
  return (
    <li>
      <Link href={`/routines/${routine.id}`} className="card flex h-full flex-col gap-3 p-5 hover:border-ink">
        <span className="text-lg font-bold leading-snug break-words">{routine.title}</span>
        <ul className="flex flex-col gap-1 text-[0.9375rem] text-ink-2">
          {habits.slice(0, 4).map((h) => (
            <li key={h.id} className="truncate">{h.name}</li>
          ))}
          {habits.length > 4 ? <li className="text-muted">+{habits.length - 4} more</li> : null}
          {habits.length === 0 ? <li className="text-muted">No habits yet</li> : null}
        </ul>
      </Link>
    </li>
  );
}
