/**
 * Faithfulness guard. The prompt asks the model to stay grounded; this module is
 * what actually enforces it. Every provider's output — including the rule-based
 * development extractor — passes through here before anything is stored.
 *
 * Rules:
 *  - Each candidate needs evidence that appears in the source, or it is dropped.
 *  - Instructions must be source wording; otherwise the evidence is used instead.
 *  - Timing cues and every structured detail must be stated in the source, and the
 *    numbers inside them must match what the source says. Unsupported details are
 *    removed (never "corrected") and the person is told what was removed.
 *  - Candidates that echo instructions aimed at the software are discarded.
 *  - Output is capped, de-duplicated and has no approval state of any kind.
 */

import {
  EXTRACTION_LIMITS,
  type Candidate,
  type Duration,
  type Frequency,
  type ProviderOutput,
  type Quantity,
} from "./schema";
import {
  appearsIn,
  contentWords,
  durationSecondsFromText,
  normalizeForMatch,
  numbersIn,
} from "./text";

export interface GuardedCandidate {
  name: string;
  instruction: string;
  timingCue: string | null;
  frequency: Frequency | null;
  quantity: Quantity | null;
  duration: Duration | null;
  evidence: string;
  clarificationRequired: boolean;
  uncertainty: string[];
}

export type GuardNotice =
  | "candidates_truncated"
  | "unsupported_details_removed"
  | "ungrounded_candidates_dropped"
  | "suspicious_instructions_ignored"
  | "duplicates_merged";

export interface GuardResult {
  candidates: GuardedCandidate[];
  notices: GuardNotice[];
}

const INJECTION_PATTERNS = [
  /\bignore (all |any |the )?(previous|prior|above|earlier|preceding) (instructions|messages|rules|prompts?)\b/i,
  /\b(system|developer) prompt\b/i,
  /\byou are (now )?(an? |the )?(ai|assistant|language model|model|chatbot)\b/i,
  /\b(mark|set) (all|every|each|these|this|them)\b.{0,40}\b(approved|active|complete|done)\b/i,
  /\bapprove (all|every|each)\b/i,
  /<\/?(script|iframe|img|svg|style)\b/i,
  /\bjavascript:/i,
  /\b(disregard|override) (the |all |any )?(rules|instructions|guidelines)\b/i,
];

export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

const FREQUENCY_KEYWORDS: Record<Frequency["kind"], RegExp> = {
  daily: /\b(daily|every ?day|each day|a day|per day|every (morning|evening|night|afternoon)|each (morning|evening|night|afternoon)|nightly|every single day)\b/i,
  times_per_day: /\b(a|per|each|every) day\b|\bdaily\b/i,
  times_per_week: /\b(a|per|each|every) week\b|\bweekly\b|\/\s?week\b|\bx\/wk\b/i,
  every_n_days: /\bevery (other|second|third|\d+|two|three|four|five|six|seven) days?\b/i,
  specific_days: /\b(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day)?s?\b|\bweekends?\b|\bweekdays?\b/i,
  as_needed: /\b(as needed|when needed|if needed|as required|whenever|when (it|you) (hurts?|feels?))\b/i,
  other: /./,
};

const DAY_PATTERNS: Record<string, RegExp> = {
  mon: /\bmon(day)?s?\b|\bweekdays?\b/i,
  tue: /\btues?(day)?s?\b|\bweekdays?\b/i,
  wed: /\bwed(nesday)?s?\b|\bweekdays?\b/i,
  thu: /\bthu(r|rs|rsday|rsdays)?\b|\bthursdays?\b|\bweekdays?\b/i,
  fri: /\bfri(day)?s?\b|\bweekdays?\b/i,
  sat: /\bsat(urday)?s?\b|\bweekends?\b/i,
  sun: /\bsun(day)?s?\b|\bweekends?\b/i,
};

type Check<T> = { value: T | null; removed: boolean };

function checkFrequency(f: Frequency | null, source: string): Check<Frequency> {
  if (!f) return { value: null, removed: false };
  if (!appearsIn(f.text, source)) return { value: null, removed: true };
  if (!FREQUENCY_KEYWORDS[f.kind].test(f.text)) return { value: null, removed: true };

  const stated = numbersIn(f.text);
  if (f.count != null) {
    // "every other day" states an interval of 2 without a digit.
    const implied = f.kind === "every_n_days" && /\bother\b/i.test(f.text) ? [2] : [];
    const dailyImplied = f.kind === "daily" ? [1] : [];
    if (![...stated, ...implied, ...dailyImplied].includes(f.count)) return { value: null, removed: true };
  } else if (f.kind === "times_per_day" || f.kind === "times_per_week") {
    // A "times per" frequency without a stated count is not a structured frequency.
    if (stated.length === 0) return { value: { ...f, kind: "other", count: null }, removed: false };
  }
  if (f.days && f.days.length) {
    if (!f.days.every((d) => DAY_PATTERNS[d]!.test(f.text))) return { value: null, removed: true };
  }
  return { value: f, removed: false };
}

function checkQuantity(q: Quantity | null, source: string): Check<Quantity> {
  if (!q) return { value: null, removed: false };
  if (!appearsIn(q.text, source)) return { value: null, removed: true };
  const stated = numbersIn(q.text);
  for (const n of [q.sets, q.reps, q.count]) {
    if (n != null && !stated.includes(n)) return { value: null, removed: true };
  }
  if (q.sets == null && q.reps == null && q.count == null && stated.length === 0) {
    return { value: null, removed: true };
  }
  if (q.perSide && !/\b(per|each|every|on (each|both)) (side|leg|arm)\b|\bboth sides\b/i.test(q.text)) {
    return { value: { ...q, perSide: null }, removed: true };
  }
  return { value: q, removed: false };
}

function checkDuration(d: Duration | null, source: string): Check<Duration> {
  if (!d) return { value: null, removed: false };
  if (!appearsIn(d.text, source)) return { value: null, removed: true };
  const parsed = durationSecondsFromText(d.text);
  if (parsed === null || parsed !== d.seconds) return { value: null, removed: true };
  return { value: d, removed: false };
}

function deriveName(instruction: string): string {
  const words = instruction
    .replace(/^(please |try to |try |make sure (to |you )?|remember to |i'?d like you to |you should |aim to )/i, "")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ")
    .replace(/[.,;:!?]+$/, "");
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, EXTRACTION_LIMITS.maxNameChars) || "Habit";
}

/** A label may paraphrase, but at least half of its meaningful words must come from the source. */
function groundedName(name: string, source: string, instruction: string): string {
  const words = contentWords(name);
  if (words.length === 0) return name;
  const sourceNorm = normalizeForMatch(source);
  const grounded = words.filter((w) => sourceNorm.includes(w.slice(0, Math.max(4, w.length - 2))));
  return grounded.length * 2 >= words.length ? name : deriveName(instruction);
}

export function guardCandidates(output: ProviderOutput, sourceBody: string): GuardResult {
  const notices = new Set<GuardNotice>();
  const seen = new Set<string>();
  const result: GuardedCandidate[] = [];

  for (const c of output.candidates) {
    if (looksLikeInjection(c.evidence) || looksLikeInjection(c.instruction) || looksLikeInjection(c.name)) {
      notices.add("suspicious_instructions_ignored");
      continue;
    }

    // Evidence must come from the source. Fall back to the instruction if that is verbatim.
    let evidence = c.evidence;
    if (!appearsIn(evidence, sourceBody)) {
      if (appearsIn(c.instruction, sourceBody)) {
        evidence = c.instruction;
      } else {
        notices.add("ungrounded_candidates_dropped");
        continue;
      }
    }

    const key = normalizeForMatch(evidence);
    if (seen.has(key)) {
      notices.add("duplicates_merged");
      continue;
    }
    seen.add(key);

    const uncertainty = [...c.uncertainty];
    let clarificationRequired = c.clarificationRequired;

    const instruction = appearsIn(c.instruction, sourceBody) ? c.instruction : evidence;
    // Details must be stated in this candidate's own supporting text, not merely
    // somewhere in the message (which would let numbers leak between instructions).
    const grounding = `${evidence}\n${instruction}`;

    let timingCue = c.timingCue;
    if (timingCue && !appearsIn(timingCue, grounding)) {
      timingCue = null;
      uncertainty.push("Removed a timing cue that isn't in this instruction.");
      notices.add("unsupported_details_removed");
    }

    const frequency = checkFrequency(c.frequency, grounding);
    if (frequency.removed) uncertainty.push("Removed a frequency that isn't stated in the message.");
    const quantity = checkQuantity(c.quantity, grounding);
    if (quantity.removed) uncertainty.push("Removed an amount that isn't stated in the message.");
    const duration = checkDuration(c.duration, grounding);
    if (duration.removed) uncertainty.push("Removed a duration that isn't stated in the message.");

    if (frequency.removed || quantity.removed || duration.removed) {
      notices.add("unsupported_details_removed");
      clarificationRequired = true;
    }
    if (!frequency.value && !timingCue && !clarificationRequired) {
      clarificationRequired = true;
      uncertainty.push("The message doesn't say when or how often.");
    }

    result.push({
      name: groundedName(c.name, sourceBody, instruction),
      instruction,
      timingCue,
      frequency: frequency.value,
      quantity: quantity.value,
      duration: duration.value,
      evidence,
      clarificationRequired,
      uncertainty: [...new Set(uncertainty)].slice(0, EXTRACTION_LIMITS.maxUncertaintyItems),
    });
  }

  if (result.length > EXTRACTION_LIMITS.maxCandidates) {
    notices.add("candidates_truncated");
    result.length = EXTRACTION_LIMITS.maxCandidates;
  }

  return { candidates: result, notices: [...notices] };
}

export type { Candidate };
