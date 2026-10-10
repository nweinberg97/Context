/**
 * Rule-based extractor — the deterministic development and test provider.
 *
 * It is NOT AI and is labelled as such everywhere it surfaces. It recognises common
 * instruction shapes ("Try X before work", "3 sets of 10", "twice a day") so the full
 * product can be explored locally without sending anything to a third party. Its
 * output passes through the same schema validation and faithfulness guard as any
 * model provider.
 */

import type { Candidate, Duration, Frequency, ProviderOutput, Quantity } from "../schema";
import { wordToNumber } from "../text";
import type { ExtractionProvider } from "./types";

export const RULES_PROVIDER_ID = "rules";
export const RULES_PROVIDER_VERSION = "rules@1.0.0";

const DISCOURSE = String.raw`(?:(?:actually|instead|also|and|then|now|finally|next|lastly|first|second|third|after that|ok|okay),?\s+)?`;
const LEAD_INS = DISCOURSE + String.raw`(?:please\s+|try\s+to\s+|make\s+sure\s+(?:to\s+|you\s+)?|remember\s+to\s+|i'?d\s+like\s+you\s+to\s+|you\s+should\s+|aim\s+to\s+|keep\s+|continue\s+(?:to\s+)?|start\s+|don'?t\s+forget\s+to\s+|be\s+sure\s+to\s+)?`;

const ACTION_VERBS = [
  "try", "do", "keep", "take", "walk", "stretch", "review", "read", "practice", "practise",
  "drink", "avoid", "use", "apply", "ice", "heat", "perform", "complete", "repeat", "hold",
  "aim", "spend", "write", "journal", "go", "run", "jog", "cycle", "swim", "eat", "sleep",
  "rest", "focus", "continue", "start", "add", "work", "breathe", "meditate", "call",
  "check", "record", "track", "log", "plan", "prepare", "study", "listen", "watch",
  "schedule", "set", "remember", "foam", "roll", "massage", "lift", "squat", "lunge",
  "bridge", "plank", "brush", "floss", "wear", "elevate", "sit", "stand", "lie", "bring",
  "drill", "rehearse", "revise", "memorise", "memorize", "reflect", "note", "limit",
  "reduce", "increase", "switch", "pause", "stop", "warm", "cool", "finish",
];

const IMPERATIVE = new RegExp(String.raw`^${LEAD_INS}(${ACTION_VERBS.join("|")})\b`, "i");
const SOFT_DIRECTIVE = /\b(you should|make sure (to|you)|try to|i'?d like you to|please|remember to|aim to|be sure to)\b/i;
const NOT_ACTIONABLE = /^(thanks|thank you|great (session|job|work)|good (session|job|work)|nice work|hi\b|hello\b|hey\b|dear\b|see you|let me know|any questions|feel free|it was|looking forward|hope\b)/i;

const CUE_PATTERNS: RegExp[] = [
  /\b(?:before|after) (?:work|school|class|breakfast|lunch|dinner|meals?|bed(?:time)?|practice|training|(?:your|each|every) (?:run|walk|workout|session|shift|lesson))\b/i,
  /\b(?:first thing in the morning|first thing|when you wake up|on waking|as soon as you wake up|before you go to (?:bed|sleep))\b/i,
  /\b(?:each|every|in the) (?:morning|afternoon|evening|night)\b/i,
  /\b(?:at|during) (?:night|bedtime|lunch(?:time)?|your (?:lunch )?break|work)\b/i,
  /\b(?:nightly|mornings|evenings)\b/i,
  /\bat \d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i,
];

const NUM = String.raw`(\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|a|an)`;

function num(word: string | undefined): number | null {
  return word ? wordToNumber(word) : null;
}

function findCue(sentence: string): string | null {
  for (const re of CUE_PATTERNS) {
    const m = re.exec(sentence);
    if (m) return m[0];
  }
  return null;
}

function findFrequency(sentence: string): Frequency | null {
  let m: RegExpExecArray | null;
  if ((m = /\b(once|twice|thrice|(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten) times) (a|per|each) day\b/i.exec(sentence))) {
    const count = num(m[2] ?? m[1]!);
    return { kind: "times_per_day", count, text: m[0] };
  }
  if ((m = /\b(once|twice|thrice|(\d{1,2}|one|two|three|four|five|six|seven) times) (a|per|each) week\b/i.exec(sentence))) {
    const count = num(m[2] ?? m[1]!);
    return { kind: "times_per_week", count, text: m[0] };
  }
  if ((m = /\b(\d)\s?x\s?(?:\/\s?|per |a )(?:week|wk)\b/i.exec(sentence))) {
    return { kind: "times_per_week", count: Number(m[1]), text: m[0] };
  }
  if ((m = /\bevery other day\b/i.exec(sentence))) return { kind: "every_n_days", count: 2, text: m[0] };
  if ((m = /\bevery (\d|two|three|four|five|six|seven) days\b/i.exec(sentence))) {
    return { kind: "every_n_days", count: num(m[1]), text: m[0] };
  }
  if ((m = /\b(weekly|once a week)\b/i.exec(sentence))) return { kind: "times_per_week", count: 1, text: m[0] };
  if ((m = /\b(daily|every ?day|each day|every single day|nightly|every (?:morning|evening|night)|each (?:morning|evening|night))\b/i.exec(sentence))) {
    return { kind: "daily", count: null, text: m[0] };
  }
  if ((m = /\bon (mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|weekdays|weekends)((?:,? (?:and )?(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?))*)/i.exec(sentence))) {
    const text = m[0];
    const days = (["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).filter((d) => {
      const full = { mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday", fri: "friday", sat: "saturday", sun: "sunday" }[d];
      const lower = text.toLowerCase();
      return lower.includes(full) ||
        (lower.includes("weekday") && ["mon", "tue", "wed", "thu", "fri"].includes(d)) ||
        (lower.includes("weekend") && ["sat", "sun"].includes(d));
    });
    return { kind: "specific_days", count: null, days, text };
  }
  if ((m = /\b(as needed|when needed|if needed|whenever (?:it|you)[^,.;]{0,30})\b/i.exec(sentence))) {
    return { kind: "as_needed", count: null, text: m[0] };
  }
  return null;
}

function findQuantity(sentence: string): Quantity | null {
  let m: RegExpExecArray | null;
  const perSide = /\b(per|each|on each|on both) (side|leg|arm)\b|\bboth sides\b/i.test(sentence) ? true : null;
  if ((m = /\b(\d{1,3})\s?[x\u00D7]\s?(\d{1,4})\b(?:\s?(?:reps|repetitions))?(?:\s?(?:per|each|\/) ?(?:side|leg|arm))?/i.exec(sentence))) {
    return { sets: Number(m[1]), reps: Number(m[2]), count: null, unit: "reps", perSide, text: m[0] };
  }
  if ((m = new RegExp(String.raw`\b${NUM} sets? of ${NUM}(?: (?:reps|repetitions))?(?: (?:per|each|on each) (?:side|leg|arm))?`, "i").exec(sentence))) {
    return { sets: num(m[1]), reps: num(m[2]), count: null, unit: "reps", perSide, text: m[0] };
  }
  if ((m = new RegExp(String.raw`\b${NUM} (reps|repetitions)(?: (?:per|each|on each) (?:side|leg|arm))?`, "i").exec(sentence))) {
    return { sets: null, reps: num(m[1]), count: null, unit: "reps", perSide, text: m[0] };
  }
  if ((m = /\b(\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty) (pages|glasses|steps|breaths|chapters|problems|questions|exercises|words|scales|laps|cups|litres|liters)\b/i.exec(sentence))) {
    return { sets: null, reps: null, count: num(m[1]), unit: m[2]!.toLowerCase(), perSide, text: m[0] };
  }
  return null;
}

function findDuration(sentence: string): Duration | null {
  const m = /\b(?:for (?:about |around |at least )?)?(\d{1,4}|one|two|three|five|ten|fifteen|twenty|thirty|sixty)[\s-](seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i.exec(sentence);
  if (!m) return null;
  const n = num(m[1]);
  if (n === null) return null;
  const unit = m[2]!.toLowerCase();
  const seconds = unit.startsWith("s") ? n : unit.startsWith("m") ? n * 60 : n * 3600;
  if (seconds < 1 || seconds > 86_400) return null;
  // Use only the number and unit as the verbatim text, so the guard can match it exactly.
  return { seconds, text: `${m[1]}${m[0].includes("-") ? "-" : " "}${m[2]}` };
}

function splitSentences(body: string): string[] {
  const out: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.replace(/^\s*(?:[-*\u2022\u00B7]|\d{1,2}[.)])\s+/, "").trim();
    if (!line) continue;
    // Split on sentence punctuation followed by a space and a capital letter or digit.
    const parts = line.split(/(?<=[.!?;])\s+(?=[A-Z0-9"'(])/);
    for (const p of parts) {
      const s = p.trim();
      if (s.length >= 4) out.push(s);
    }
  }
  return out;
}

function makeName(sentence: string, cue: string | null, freq: Frequency | null, qty: Quantity | null, dur: Duration | null): string {
  let s = sentence.replace(new RegExp(`^${LEAD_INS}`, "i"), "");
  // "Try the X" → "the X"
  s = s.replace(/^try\s+(?=(the|a|an|your|some)\b)/i, "");
  for (const part of [cue, freq?.text, qty?.text, dur?.text]) {
    if (part) s = s.replace(part, " ");
  }
  s = s
    .replace(/\b(for|of)\s*(?=[,.;!?]|$)/gi, "")
    .replace(/[,.;:!?]+.*$/, "")
    .replace(/^(the|a|an|some)\s+/i, "")
    .replace(/\byour\s+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const words = s.split(" ").filter(Boolean).slice(0, 6);
  const name = words.join(" ");
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : sentence.slice(0, 60);
}

export function extractWithRules(body: string): ProviderOutput {
  const candidates: Candidate[] = [];
  let index = 0;

  for (const sentence of splitSentences(body)) {
    if (sentence.endsWith("?")) continue;
    if (NOT_ACTIONABLE.test(sentence)) continue;
    if (!IMPERATIVE.test(sentence) && !SOFT_DIRECTIVE.test(sentence)) continue;

    const timingCue = findCue(sentence);
    const frequency = findFrequency(sentence);
    const quantity = findQuantity(sentence);
    const duration = findDuration(sentence);

    const uncertainty: string[] = [];
    if (!frequency && !timingCue) uncertainty.push("The message doesn't say when or how often.");
    if (!quantity && !duration && /\b(exercise|stretch|reps?|sets?|drill|squat|lunge|bridge|plank)\b/i.test(sentence)) {
      uncertainty.push("The amount isn't stated.");
    }

    index += 1;
    candidates.push({
      candidateId: `r${index}`,
      name: makeName(sentence, timingCue, frequency, quantity, duration),
      instruction: sentence.slice(0, 500),
      timingCue,
      frequency,
      quantity,
      duration,
      evidence: sentence.slice(0, 500),
      clarificationRequired: uncertainty.length > 0 && !frequency && !timingCue,
      uncertainty,
    });
  }

  // Conflicting instructions: the same habit stated with different frequencies or amounts.
  const byName = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const key = c.name.toLowerCase().replace(/\b(the|again|instead|actually)\b/g, "").replace(/\s+/g, " ").trim();
    byName.set(key, [...(byName.get(key) ?? []), c]);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const variants = new Set(group.map((c) => `${c.frequency?.text ?? ""}|${c.quantity?.text ?? ""}|${c.duration?.text ?? ""}`));
    if (variants.size > 1) {
      for (const c of group) {
        c.clarificationRequired = true;
        c.uncertainty = [...c.uncertainty, "This conflicts with another instruction in the message."].slice(0, 4);
      }
    }
  }

  return { candidates };
}

export const rulesProvider: ExtractionProvider = {
  id: RULES_PROVIDER_ID,
  version: RULES_PROVIDER_VERSION,
  label: "Rule-based extractor (development, not AI)",
  external: false,
  async extract(input) {
    return extractWithRules(input.body);
  },
};
