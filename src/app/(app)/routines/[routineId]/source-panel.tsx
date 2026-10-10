import { deleteSourceAction, removeSourceContentAction } from "@/app/(app)/source-actions";
import { ConfirmSubmit } from "@/components/habits/confirm-button";
import { IconMessage } from "@/components/icons";
import type { SourceImport } from "@/lib/domain/types";

export function SourcePanel({ source }: { source: SourceImport }) {
  const added = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(source.createdAt));
  return (
    <section aria-labelledby="source-title" className="no-print mt-12 rounded-[var(--radius-card)] bg-sage/50 p-5 sm:p-6">
      <h2 id="source-title" className="flex items-center gap-2 text-lg font-bold">
        <IconMessage size={20} /> Where this came from
      </h2>
      <p className="mt-1 text-[0.9375rem] text-muted">
        {source.title ?? "Pasted message"} · added {added}
      </p>
      {source.sanitizedText ? (
        <details className="mt-4">
          <summary className="cursor-pointer font-semibold underline underline-offset-4">Show the message text</summary>
          <div className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-paper p-4 text-[0.9375rem] text-ink-2">
            {source.sanitizedText}
          </div>
        </details>
      ) : (
        <p className="mt-4 text-[0.9375rem]">The message text has been removed. Your habits are unchanged.</p>
      )}
      <div className="mt-5 flex flex-wrap gap-2">
        {source.sanitizedText ? (
          <form action={removeSourceContentAction.bind(null, source.id)}>
            <ConfirmSubmit label="Remove message text" confirmLabel="Remove text" question="Remove the stored text? Habits stay." />
          </form>
        ) : null}
        <form action={deleteSourceAction.bind(null, source.id)}>
          <ConfirmSubmit label="Delete source" confirmLabel="Delete source" question="Delete the source record? Habits stay." />
        </form>
      </div>
    </section>
  );
}
