/**
 * Writes public/sample-routine.pdf, the example linked from the landing page.
 *   npx tsx scripts/pdf/sample.ts
 */
import { writeFileSync } from "node:fs";
import { renderRoutinePdf } from "../../src/lib/pdf/routine";

const bytes = renderRoutinePdf({
  title: "Neck & shoulders",
  sourceTitle: "Re: your home program",
  compiledOn: "October 9, 2026",
  habits: [
    { name: "Chin tucks", instruction: "Do the chin tucks, 2 x 10, every morning.", timingCue: "every morning", frequency: { kind: "daily", text: "every morning", origin: "message" }, quantity: { sets: 2, reps: 10, text: "2 x 10", origin: "message" }, duration: null, sourceEvidence: "Do the chin tucks, 2 x 10, every morning." },
    { name: "Wall angels", instruction: "Wall angels, 3 x 8, every morning when you can.", timingCue: "every morning", frequency: null, quantity: { sets: 3, reps: 8, text: "3 x 8", origin: "message" }, duration: null, sourceEvidence: "Wall angels, 3 x 8, every morning when you can." },
    { name: "Walk", instruction: "Walk for 20 minutes after lunch.", timingCue: "after lunch", frequency: null, quantity: null, duration: { seconds: 1200, text: "20 minutes", origin: "message" }, sourceEvidence: "Walk for 20 minutes after lunch." },
    { name: "Doorway stretch", instruction: "Try the doorway stretch before bed.", timingCue: "before bed", frequency: null, quantity: { text: "30 seconds", origin: "person" }, duration: null, sourceEvidence: "Try the doorway stretch before bed." },
    { name: "Breathing exercises", instruction: "Keep working on your breathing exercises.", timingCue: null, frequency: null, quantity: null, duration: null, sourceEvidence: "Keep working on your breathing exercises." },
  ],
});
writeFileSync(new URL("../../public/sample-routine.pdf", import.meta.url), bytes);
console.info(`public/sample-routine.pdf (${Math.round(bytes.length / 1024)} KB)`);
