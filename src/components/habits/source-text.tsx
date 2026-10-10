import type { Habit } from "@/lib/domain/types";
import { cx } from "../ui";

interface Range {
  start: number;
  end: number;
  status: Habit["status"];
}

/** Finds each habit's evidence in the source and returns non-overlapping ranges. */
export function evidenceRanges(text: string, habits: Pick<Habit, "sourceEvidence" | "status">[]): Range[] {
  const lower = text.toLowerCase();
  const ranges: Range[] = [];
  for (const h of habits) {
    if (!h.sourceEvidence) continue;
    const needle = h.sourceEvidence.toLowerCase();
    const start = lower.indexOf(needle);
    if (start === -1) continue;
    const end = start + needle.length;
    if (ranges.some((r) => start < r.end && end > r.start)) continue;
    ranges.push({ start, end, status: h.status });
  }
  return ranges.sort((a, b) => a.start - b.start);
}

/**
 * The cleaned message with the advice highlighted. Rendered as text nodes only —
 * imported content is never interpreted as HTML.
 */
export function SourceText({ text, habits }: { text: string; habits: Pick<Habit, "sourceEvidence" | "status">[] }) {
  const ranges = evidenceRanges(text, habits);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  ranges.forEach((r, i) => {
    if (r.start > cursor) parts.push(text.slice(cursor, r.start));
    parts.push(
      <mark
        key={i}
        className={cx(
          "mark",
          r.status === "draft" && "mark-soft",
          r.status === "rejected" && "bg-transparent bg-none text-muted line-through",
        )}
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <div className="whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-ink-2">{parts}</div>;
}
