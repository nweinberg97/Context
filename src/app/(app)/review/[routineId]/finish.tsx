"use client";

import { useActionState } from "react";
import { finishReviewAction } from "@/app/(app)/habit-actions";
import { SubmitButton } from "@/components/habits/confirm-button";
import { Notice } from "@/components/ui";

export function FinishReview({ routineId, defaultTitle, approvedCount, pendingCount }: { routineId: string; defaultTitle: string; approvedCount: number; pendingCount: number }) {
  const [state, action] = useActionState(finishReviewAction.bind(null, routineId), {});
  return (
    <form action={action} className="card no-print z-10 flex flex-col gap-3 border-ink/20 p-4 shadow-[var(--shadow-lift)] sm:p-5 md:sticky md:bottom-4">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="routine-title" className="text-sm font-semibold">Routine name</label>
          <input
            id="routine-title"
            name="title"
            required
            maxLength={120}
            defaultValue={defaultTitle}
            className="field"
            aria-invalid={Boolean(state.fieldErrors?.title) || undefined}
          />
        </div>
        <SubmitButton size="lg" disabled={approvedCount === 0} pendingLabel="Saving…" className="sm:w-auto">
          Save routine{approvedCount ? ` · ${approvedCount} habit${approvedCount === 1 ? "" : "s"}` : ""}
        </SubmitButton>
      </div>
      <p className="text-sm text-muted" aria-live="polite">
        {approvedCount === 0
          ? "Approve at least one habit to save."
          : pendingCount > 0
            ? `${pendingCount} suggestion${pendingCount === 1 ? " is" : "s are"} still waiting. Saving leaves ${pendingCount === 1 ? "it" : "them"} out.`
            : "Everything's reviewed."}
      </p>
    </form>
  );
}
