import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inflateSync } from "node:zlib";
import { renderRoutinePdf, routinePdfFilename, type RoutineSheetInput } from "../../src/lib/pdf/routine";
import { encodeWinAnsi, measure, wrap } from "../../src/lib/pdf/writer";

const habit = (o: Partial<RoutineSheetInput["habits"][number]>): RoutineSheetInput["habits"][number] => ({
  name: "Chin tucks",
  instruction: "Do the chin tucks, 2 x 10, every morning.",
  timingCue: "every morning",
  frequency: { kind: "daily", text: "every morning", origin: "message" },
  quantity: { sets: 2, reps: 10, text: "2 x 10", origin: "message" },
  duration: null,
  sourceEvidence: "Do the chin tucks, 2 x 10, every morning.",
  ...o,
});

/** Decompresses every content stream and decodes the hex text strings drawn with Tj. */
function drawnText(pdf: Uint8Array): string {
  const buf = Buffer.from(pdf);
  const text: string[] = [];
  let at = 0;
  for (;;) {
    const start = buf.indexOf("stream\n", at);
    if (start === -1) break;
    const end = buf.indexOf("\nendstream", start);
    const dictStart = buf.lastIndexOf("<<", start);
    const dict = buf.subarray(dictStart, start).toString("latin1");
    if (!dict.includes("Length1")) {
      const content = inflateSync(buf.subarray(start + 7, end)).toString("latin1");
      for (const m of content.matchAll(/<([0-9a-f]+)> Tj/g)) {
        text.push(Buffer.from(m[1]!, "hex").toString("latin1"));
      }
    }
    at = end + 10;
  }
  return text.join("\n");
}

function pageCount(pdf: Uint8Array): number {
  const m = /\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/.exec(Buffer.from(pdf).toString("latin1"));
  return Number(m?.[1] ?? 0);
}

describe("pdf writer", () => {
  it("encodes text as WinAnsi, including smart punctuation, and replaces the rest", () => {
    assert.deepEqual(encodeWinAnsi("A’s “ok” — €"), [65, 0x92, 115, 32, 0x93, 111, 107, 0x94, 32, 0x97, 32, 0x80]);
    assert.deepEqual(encodeWinAnsi("café"), [99, 97, 102, 0xe9]);
    assert.deepEqual(encodeWinAnsi("你"), [63]);
  });

  it("wraps text within the requested width, even long words", () => {
    const lines = wrap("regular", 10, "Keep your lower back flat against the wall and move slowly. Supercalifragilisticexpialidocious", 120);
    assert.ok(lines.length > 2);
    for (const line of lines) assert.ok(measure("regular", 10, line) <= 120, `"${line}" is too wide`);
  });

  it("writes a structurally valid PDF with a correct cross-reference table", () => {
    const pdf = renderRoutinePdf({ title: "Neck & shoulders", sourceTitle: "Re: your home program", compiledOn: "October 9, 2026", habits: [habit({})] });
    const s = Buffer.from(pdf).toString("latin1");
    assert.ok(s.startsWith("%PDF-1.7"));
    assert.ok(s.trimEnd().endsWith("%%EOF"));
    const startxref = Number(/startxref\n(\d+)/.exec(s)![1]);
    assert.ok(s.slice(startxref).startsWith("xref"));
    const entries = [...s.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    entries.forEach((offset, i) => assert.ok(s.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`));
    assert.match(s, /\/FontFile2 \d+ 0 R/);
    assert.match(s, /\/Encoding \/WinAnsiEncoding/);
  });
});

describe("routine sheet", () => {
  it("includes the title, groups, habits and the advisor's words", () => {
    const text = drawnText(
      renderRoutinePdf({
        title: "Neck & shoulders",
        sourceTitle: "Re: your home program",
        compiledOn: "October 9, 2026",
        habits: [
          habit({}),
          habit({ name: "Walk", instruction: "Walk for 20 minutes after lunch.", timingCue: "after lunch", frequency: null, quantity: null, duration: { seconds: 1200, text: "20 minutes", origin: "message" }, sourceEvidence: "Walk for 20 minutes after lunch." }),
        ],
      }),
    );
    for (const expected of ["NECK & SHOULDERS", "EVERY MORNING", "AFTER LUNCH", "Chin tucks", "Walk", "2 x 10", "20 minutes", "Compiled October 9, 2026", "Page 1 of 1"]) {
      assert.ok(text.includes(expected), `missing "${expected}"`);
    }
    assert.ok(text.includes("“Do the chin tucks, 2 x 10, every morning.”".replace(/[“”]/g, (c) => (c === "“" ? "\x93" : "\x94"))));
  });

  it("never invents details: unstated timing is listed as a question instead", () => {
    const text = drawnText(
      renderRoutinePdf({
        title: "Breathing",
        sourceTitle: null,
        compiledOn: "October 9, 2026",
        habits: [habit({ name: "Breathing exercises", instruction: "Keep working on your breathing exercises.", timingCue: null, frequency: null, quantity: null, sourceEvidence: "Keep working on your breathing exercises." })],
      }),
    );
    assert.ok(text.includes("ANY TIME"));
    assert.ok(text.includes("Not stated in the message: when or how often, how much."));
    assert.ok(text.includes("TO ASK AT YOUR NEXT APPOINTMENT"));
    assert.ok(text.includes("Breathing exercises: when or how often, how much?"));
  });

  it("flows long routines onto more pages with numbered footers", () => {
    const habits = Array.from({ length: 14 }, (_, i) => habit({ name: `Exercise ${i + 1}`, instruction: `Exercise ${i + 1}, 2 x 10, every morning.`, sourceEvidence: `Exercise ${i + 1}, 2 x 10, every morning.` }));
    const pdf = renderRoutinePdf({ title: "Long program", sourceTitle: null, compiledOn: "October 9, 2026", habits });
    const pages = pageCount(pdf);
    assert.ok(pages >= 2);
    const text = drawnText(pdf);
    assert.ok(text.includes(`Page ${pages} of ${pages}`));
    assert.ok(text.includes("EVERY MORNING (CONTINUED)"));
    assert.ok(text.includes("Exercise 14"));
  });

  it("renders an empty routine without failing", () => {
    const text = drawnText(renderRoutinePdf({ title: "Empty", sourceTitle: null, compiledOn: "October 9, 2026", habits: [] }));
    assert.ok(text.includes("No active habits in this routine yet."));
  });

  it("makes safe filenames", () => {
    assert.equal(routinePdfFilename("Neck & shoulders"), "neck-and-shoulders-routine.pdf");
    assert.equal(routinePdfFilename("Piano: Week 3 / café"), "piano-week-3-cafe-routine.pdf");
    assert.equal(routinePdfFilename("\u{1F600}"), "context-routine.pdf");
  });
});
