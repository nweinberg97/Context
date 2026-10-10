"use client";

import { useOptimistic, useState, useTransition } from "react";
import { recordCompletionAction } from "@/app/(app)/today/actions";
import type { CompletionState } from "@/lib/domain/types";
import { IconCheck, IconHalf, IconSkip } from "../icons";
import { cx } from "../ui";

const OPTIONS: Array<{ state: CompletionState; label: string; icon: typeof IconCheck }> = [
  { state: "done", label: "Done", icon: IconCheck },
  { state: "partial", label: "Partly", icon: IconHalf },
  { state: "skipped", label: "Skipped", icon: IconSkip },
];

/**
 * Self-report for one habit on one day. Pressing the selected option again clears it
 * back to "not reported" — which is never counted as a miss.
 */
export function CompletionControl({ habitId, habitName, date, current }: { habitId: string; habitName: string; date: string; current: CompletionState | null }) {
  const [optimistic, setOptimistic] = useOptimistic(current);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function choose(next: CompletionState) {
    const target = optimistic === next ? "clear" : next;
    setError(null);
    startTransition(async () => {
      setOptimistic(target === "clear" ? null : target);
      const result = await recordCompletionAction(habitId, date, target);
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <div role="group" aria-label={`How did "${habitName}" go?`} className="inline-flex rounded-full bg-paper p-1 ring-1 ring-line">
        {OPTIONS.map(({ state, label, icon: Icon }) => {
          const selected = optimistic === state;
          return (
            <button
              key={state}
              type="button"
              aria-pressed={selected}
              onClick={() => choose(state)}
              className={cx(
                "inline-flex h-10 min-w-11 items-center justify-center gap-1.5 rounded-full px-2.5 text-[0.9375rem] font-semibold transition-colors sm:px-3",
                selected && state === "done" && "bg-ink text-paper",
                selected && state === "partial" && "bg-mark text-forest",
                selected && state === "skipped" && "bg-sage-2 text-forest",
                !selected && "text-muted hover:bg-white hover:text-ink",
              )}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>
      <p className="min-h-5 text-sm" aria-live="polite">
        {error ? <span className="font-semibold text-danger">{error}</span> : optimistic ? <span className="sr-only">Saved: {optimistic}</span> : null}
      </p>
    </div>
  );
}
