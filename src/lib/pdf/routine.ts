/**
 * The routine sheet: one tidy PDF of the advice a person approved, grouped by when
 * they do it, in the advisor's own words, with a week of tick boxes per habit.
 */
import { groupKey, groupRank, habitDetails } from "../../components/habits/format";
import type { Habit } from "../domain/types";
import { PdfDocument, type PdfPage, hex, measure, wrap } from "./writer";

export interface RoutineSheetInput {
  title: string;
  /** Title of the message the routine came from, if any. */
  sourceTitle: string | null;
  /** Already formatted in the person's time zone, e.g. "October 9, 2026". */
  compiledOn: string;
  habits: Array<Pick<Habit, "name" | "instruction" | "timingCue" | "frequency" | "quantity" | "duration" | "sourceEvidence">>;
}

const PAGE_W = 612; // US Letter; prints fine on A4 with default "fit" scaling
const PAGE_H = 792;
const M = 54;
const CONTENT_W = PAGE_W - M * 2;
const BOX = 13;
const BOX_GAP = 5;
const DAYS = ["M", "T", "W", "T", "F", "S", "S"];
const GRID_W = BOX * 7 + BOX_GAP * 6;
const TEXT_W = CONTENT_W - GRID_W - 28;

const BOTTOM = PAGE_H - 64;

const INK = hex("#0a0d14");
const INK_2 = hex("#2b3240");
const MUTED = hex("#5a6373");
const LINE = hex("#e2e5eb");
const BOX_LINE = hex("#c3c9d4");
const BLUE = hex("#2e6bff");

const normalise = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();

function wordmark(page: PdfPage, x: number, y: number, size: number) {
  const tracking = size * 0.24;
  page.text("CON", x, y, { font: "label", size, color: INK, tracking });
  const conW = measure("label", size, "CON", tracking) + tracking;
  page.text("TEXT", x + conW, y, { font: "label", size, color: INK, tracking });
  const textW = measure("label", size, "TEXT", tracking);
  page.rect(x + conW, y + size * 0.32, textW, size * 0.13, { fill: BLUE });
}

interface HabitBlock {
  name: string[];
  meta: string | null;
  instruction: string[] | null;
  quote: string[] | null;
  missing: string | null;
  height: number;
}

function missingDetails(h: RoutineSheetInput["habits"][number]): string | null {
  const missing: string[] = [];
  // A timing cue ("before bed") is the schedule: the habit happens when the cue does.
  if (!h.timingCue && !h.frequency) missing.push("when or how often");
  if (!h.quantity && !h.duration) missing.push("how much");
  return missing.length ? `Not stated in the message: ${missing.join(", ")}.` : null;
}

function layoutHabit(h: RoutineSheetInput["habits"][number], groupLabel: string): HabitBlock {
  const d = habitDetails(h);
  const name = wrap("semibold", 12.5, h.name, TEXT_W);
  const metaParts = [d.often && d.often.toLowerCase() !== groupLabel.toLowerCase() ? d.often : null, d.amount].filter(Boolean) as string[];
  const meta = metaParts.length ? metaParts.join("   ·   ") : null;
  const evidence = h.sourceEvidence?.trim() || null;
  const sameAsEvidence = evidence !== null && normalise(evidence) === normalise(h.instruction);
  const instruction = sameAsEvidence ? null : wrap("regular", 10, h.instruction, TEXT_W);
  const quote = evidence ? wrap("italic", 9.5, `“${evidence}”`, TEXT_W - 12) : null;
  const missing = missingDetails(h);

  let height = name.length * 15;
  if (meta) height += 13;
  if (instruction) height += 3 + instruction.length * 13.5;
  if (quote) height += 6 + quote.length * 12.5;
  if (missing) height += 6 + 11;
  height = Math.max(height, BOX + 2) + 22;
  return { name, meta, instruction, quote, missing, height };
}

export function renderRoutinePdf(input: RoutineSheetInput): Uint8Array {
  const doc = new PdfDocument({ title: `${input.title} — Context`, subject: "Routine compiled from approved advice" });

  const groups = new Map<string, RoutineSheetInput["habits"]>();
  for (const h of input.habits) {
    const key = groupKey(h);
    groups.set(key, [...(groups.get(key) ?? []), h]);
  }
  const ordered = [...groups.entries()].sort((a, b) => groupRank(a[0]) - groupRank(b[0]));

  let page = doc.addPage(PAGE_W, PAGE_H);
  let y = M;

  // ---- First-page header
  wordmark(page, M, y + 8, 8.5);
  const compiled = `Compiled ${input.compiledOn}`;
  page.text(compiled, PAGE_W - M - measure("regular", 8.5, compiled), y + 8, { font: "regular", size: 8.5, color: MUTED });
  y += 58;

  const titleLines = wrap("display", 27, input.title.toUpperCase(), CONTENT_W);
  for (const line of titleLines) {
    page.text(line, M, y, { font: "display", size: 27, color: INK });
    y += 30;
  }
  y += 2;
  const count = `${input.habits.length} habit${input.habits.length === 1 ? "" : "s"}`;
  const sub = input.sourceTitle ? `From “${input.sourceTitle}”   ·   ${count}` : count;
  for (const line of wrap("regular", 10, sub, CONTENT_W)) {
    page.text(line, M, y, { font: "regular", size: 10, color: MUTED });
    y += 14;
  }
  y += 12;
  page.line(M, y, PAGE_W - M, y, LINE, 0.75);
  page.rect(M, y - 1, 44, 2, { fill: BLUE });
  y += 22;
  page.text("In your advisor\u2019s own words. Tick a box each day you do it.", M, y, { font: "regular", size: 10, color: INK_2 });
  const weekOf = "Week of";
  const lineStart = PAGE_W - M - 110;
  page.text(weekOf, lineStart - 8 - measure("regular", 9, weekOf), y, { font: "regular", size: 9, color: MUTED });
  page.line(lineStart, y + 2, PAGE_W - M, y + 2, BOX_LINE, 0.75);
  y += 30;

  const newPage = () => {
    page = doc.addPage(PAGE_W, PAGE_H);
    wordmark(page, M, M + 8, 7.5);
    const t = input.title;
    page.text(t, PAGE_W - M - measure("semibold", 8.5, t), M + 8, { font: "semibold", size: 8.5, color: MUTED });
    y = M + 44;
  };

  const groupHeader = (label: string, continued: boolean) => {
    const text = (continued ? `${label} (continued)` : label).toUpperCase();
    page.text(text, M, y, { font: "label", size: 8, color: BLUE, tracking: 1.5 });
    const gridX = PAGE_W - M - GRID_W;
    DAYS.forEach((d, i) => {
      const w = measure("label", 7, d);
      page.text(d, gridX + i * (BOX + BOX_GAP) + (BOX - w) / 2, y, { font: "label", size: 7, color: MUTED });
    });
    y += 8;
    page.line(M, y, PAGE_W - M, y, LINE, 0.75);
    y += 18;
  };

  if (input.habits.length === 0) {
    page.text("No active habits in this routine yet.", M, y, { font: "regular", size: 11, color: MUTED });
  }

  for (const [label, habits] of ordered) {
    if (y + 26 + 60 > BOTTOM) newPage();
    groupHeader(label, false);
    for (const h of habits) {
      const block = layoutHabit(h, label);
      if (y + block.height > BOTTOM) {
        newPage();
        groupHeader(label, true);
      }
      const top = y;
      // Tick boxes, aligned with the habit name.
      const gridX = PAGE_W - M - GRID_W;
      for (let i = 0; i < 7; i++) page.rect(gridX + i * (BOX + BOX_GAP), top - 10.5, BOX, BOX, { stroke: BOX_LINE, lineWidth: 0.8 });

      for (const line of block.name) {
        page.text(line, M, y, { font: "semibold", size: 12.5, color: INK });
        y += 15;
      }
      if (block.meta) {
        page.text(block.meta, M, y - 1, { font: "regular", size: 9, color: MUTED });
        y += 13;
      }
      if (block.instruction) {
        y += 3;
        for (const line of block.instruction) {
          page.text(line, M, y, { font: "regular", size: 10, color: INK_2 });
          y += 13.5;
        }
      }
      if (block.quote) {
        y += 6;
        const qTop = y - 9.5;
        for (const line of block.quote) {
          page.text(line, M + 12, y, { font: "italic", size: 9.5, color: INK_2 });
          y += 12.5;
        }
        page.rect(M, qTop, 1.6, y - qTop - 8, { fill: BLUE });
      }
      if (block.missing) {
        y += 6;
        page.text(block.missing, M, y, { font: "regular", size: 8, color: MUTED });
        y += 11;
      }
      y = Math.max(y, top + BOX + 2) + 2;
      page.line(M, y, PAGE_W - M, y, LINE, 0.5);
      y += 18;
    }
    y += 6;
  }

  // ---- Questions for the next appointment: details the message didn't state.
  const questions = input.habits
    .map((h) => ({ name: h.name, missing: missingDetails(h) }))
    .filter((q): q is { name: string; missing: string } => q.missing !== null)
    .map((q) => `${q.name}: ${q.missing.replace("Not stated in the message: ", "").replace(/\.$/, "")}?`);
  if (questions.length) {
    const lines = questions.flatMap((q) => wrap("regular", 9.5, q, CONTENT_W - 16));
    const needed = 26 + lines.length * 14 + 3 * 20;
    if (y + needed > BOTTOM) newPage();
    y += 4;
    page.text("TO ASK AT YOUR NEXT APPOINTMENT", M, y, { font: "label", size: 8, color: BLUE, tracking: 1.5 });
    y += 8;
    page.line(M, y, PAGE_W - M, y, LINE, 0.75);
    y += 18;
    for (const q of questions) {
      const qLines = wrap("regular", 9.5, q, CONTENT_W - 16);
      page.rect(M, y - 6, 3.5, 3.5, { fill: BLUE });
      for (const line of qLines) {
        page.text(line, M + 14, y, { font: "regular", size: 9.5, color: INK_2 });
        y += 14;
      }
    }
    // Writing lines for answers.
    for (let i = 0; i < 3 && y + 20 < BOTTOM; i++) {
      y += 18;
      page.line(M, y, PAGE_W - M, y, LINE, 0.75);
    }
  }

  // ---- Footers (need the final page count)
  const total = doc.pages.length;
  doc.pages.forEach((p, i) => {
    const fy = PAGE_H - 36;
    p.line(M, fy - 14, PAGE_W - M, fy - 14, LINE, 0.5);
    p.text("Compiled by Context from advice you approved. It doesn’t replace your practitioner.", M, fy, { font: "regular", size: 7.5, color: MUTED });
    const pn = `Page ${i + 1} of ${total}`;
    p.text(pn, PAGE_W - M - measure("regular", 7.5, pn), fy, { font: "regular", size: 7.5, color: MUTED });
  });

  return doc.save();
}

/** A safe download filename, e.g. "neck-and-shoulders-routine.pdf". */
export function routinePdfFilename(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug ? `${slug}-routine.pdf` : "context-routine.pdf";
}
