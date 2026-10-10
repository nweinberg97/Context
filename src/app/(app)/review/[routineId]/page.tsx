import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AddHabit } from "@/components/habits/add-habit";
import { ReviewCard } from "@/components/habits/review-card";
import { SourceText } from "@/components/habits/source-text";
import { IconArrowLeft } from "@/components/icons";
import { Notice, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth/session";
import { getPublicStatus } from "@/lib/config";
import { getImport } from "@/lib/domain/imports";
import { getRoutine } from "@/lib/domain/routines";
import { FinishReview } from "./finish";

export const metadata: Metadata = { title: "Review habits" };

export default async function ReviewPage({ params }: { params: Promise<{ routineId: string }> }) {
  const viewer = await requireViewer();
  const { routineId } = await params;
  const routine = await getRoutine(viewer.id, routineId);
  if (!routine) notFound();
  if (routine.status !== "draft") redirect(`/routines/${routine.id}`);

  const source = routine.sourceImportId ? await getImport(viewer.id, routine.sourceImportId) : null;
  const status = getPublicStatus();
  const habits = routine.habits;
  const approved = habits.filter((h) => h.status === "active").length;
  const pending = habits.filter((h) => h.status === "draft").length;

  return (
    <>
      <PageHeader
        back={
          <Link href="/import" className="inline-flex items-center gap-1.5 self-start text-[0.9375rem] font-semibold text-muted hover:text-ink no-print">
            <IconArrowLeft size={18} /> Add different advice
          </Link>
        }
        title={habits.length ? "Here's what we found." : "No habits found in this one."}
        lede={
          habits.length
            ? "Approve the habits you want to follow. Edit anything, leave out what doesn't fit, or add your own."
            : "The message may not include a repeatable action. You can still write the habits yourself."
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] lg:items-start">
        <section aria-labelledby="source-title" className="lg:sticky lg:top-24">
          <div className="rounded-[var(--radius-card)] bg-sage/60 p-5">
            <h2 id="source-title" className="text-lg font-bold">{source?.title ?? "The message"}</h2>
            <div className="mt-3 max-h-64 overflow-y-auto pr-1 lg:max-h-[60vh]" tabIndex={0} aria-label="Message text">
              {source?.sanitizedText ? (
                <SourceText text={source.sanitizedText} habits={habits} />
              ) : (
                <p className="text-muted">The message text has been removed. Habits keep their own details.</p>
              )}
            </div>
            <p className="mt-4 border-t border-sage-2 pt-3 text-sm text-muted">
              Read by{" "}
              {status.extractionMode === "anthropic"
                ? `${status.extractionModel} (AI). Suggestions can be wrong, so check each one.`
                : "the rule-based reader (development mode, not AI). It only catches common phrasings."}
            </p>
          </div>
        </section>

        <section aria-label="Suggested habits" className="flex min-w-0 flex-col gap-4">
          {pending > 0 && approved === 0 ? (
            <Notice tone="info">Nothing is added to your routine until you approve it.</Notice>
          ) : null}
          {habits.map((h, i) => (
            <ReviewCard key={h.id} habit={h} routineId={routine.id} index={i} />
          ))}
          <div>
            <AddHabit routineId={routine.id} />
          </div>
          <FinishReview routineId={routine.id} defaultTitle={routine.title} approvedCount={approved} pendingCount={pending} />
        </section>
      </div>
    </>
  );
}
