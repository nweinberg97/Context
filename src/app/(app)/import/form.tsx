"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { IconLock } from "@/components/icons";
import { Button, Field, Notice, cx } from "@/components/ui";
import { importAction } from "./actions";

const EXAMPLE = `Hi Jordan,

Great work today. Do the chin tucks, 2 x 10, every morning. Try the doorway stretch before bed. Walk for 20 minutes after lunch.

See you on the 24th,
Marina`;

type Processor = { kind: "local" } | { kind: "external"; model: string; acknowledged: boolean };

export function ImportForm({ maxChars, processor }: { maxChars: number; processor: Processor }) {
  const [state, formAction, pending] = useActionState(importAction, {});
  const [text, setText] = useState(state.text ?? "");
  const [lastState, setLastState] = useState(state);
  // Keep the textarea in sync with what the server echoed back after a failed attempt.
  if (state !== lastState) {
    setLastState(state);
    if (state.text !== undefined) setText(state.text);
  }
  const count = text.length;
  const over = count > maxChars;

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[1fr_18rem]" aria-busy={pending}>
      <div className="flex min-w-0 flex-col gap-5">
        {state.error ? <Notice tone="error">{state.error}</Notice> : null}
        {state.duplicate ? (
          <Notice tone="info" title="You've already added this message.">
            {state.duplicateRoutineId ? (
              <Link href={`/review/${state.duplicateRoutineId}`} className="font-semibold underline underline-offset-4">
                Open the routine it created
              </Link>
            ) : (
              "Its routine was deleted. Delete the source in Settings to add it again."
            )}
          </Notice>
        ) : null}

        <Field
          label="Message"
          htmlFor="text"
          error={over ? `That's ${(count - maxChars).toLocaleString()} characters over the limit. Paste just the part with the advice.` : null}
        >
          <textarea
            id="text"
            name="text"
            required
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={EXAMPLE}
            aria-invalid={over || undefined}
            aria-describedby="text-count"
            className="field min-h-72 resize-y leading-relaxed"
          />
        </Field>
        <p id="text-count" className={cx("-mt-3 text-sm", over ? "font-semibold text-danger" : "text-muted")}>
          {count.toLocaleString()} / {maxChars.toLocaleString()} characters
        </p>

        <Field label="Title (optional)" htmlFor="title" hint="For example: “Physio — week 3”. Otherwise we'll use the first line.">
          <input id="title" name="title" maxLength={120} defaultValue={state.title} className="field" />
        </Field>

        {processor.kind === "external" && !processor.acknowledged ? (
          <label className="flex items-start gap-3 rounded-2xl bg-mark-2 p-4 text-[0.9375rem]">
            <input type="checkbox" name="aiAck" required className="mt-0.5 size-5 accent-[var(--color-ink)]" />
            <span>
              I understand this text will be sent to the AI provider ({processor.model}) to find the habits in it.
            </span>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" size="lg" disabled={pending || over || text.trim().length === 0}>
            {pending ? "Reading the message…" : "Find the habits"}
          </Button>
          {pending ? <span role="status" className="text-muted">This usually takes a few seconds.</span> : null}
        </div>
      </div>

      <aside className="flex flex-col gap-4 text-[0.9375rem] lg:pt-8">
        <div className="rounded-[var(--radius-card)] bg-sage/70 p-5">
          <p className="flex items-center gap-2 font-bold"><IconLock size={18} /> What happens to this text</p>
          <ul className="mt-3 space-y-2 text-ink-2">
            <li>Only what you paste is used. Context never connects to your inbox.</li>
            <li>We keep a cleaned copy (no signatures or quoted replies) so you can see where each habit came from.</li>
            <li>
              {processor.kind === "external"
                ? `It's sent to ${processor.model} to find habits.`
                : "It's read on this server by a simple rule-based reader. Nothing is sent to an AI provider."}
            </li>
            <li>You can remove the text or delete everything in Settings.</li>
          </ul>
        </div>
        <p className="text-muted">Habits only become part of your routine after you approve them.</p>
      </aside>
    </form>
  );
}
