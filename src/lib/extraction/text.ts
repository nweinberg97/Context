/** Text utilities shared by the guard and the rule-based extractor. */

const NUMBER_WORDS: Record<string, number> = {
  once: 1, one: 1, a: 1, an: 1, single: 1,
  twice: 2, two: 2, couple: 2, both: 2,
  thrice: 3, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40,
  fifty: 50, sixty: 60, ninety: 90, hundred: 100,
};

/** Lowercase, unify quotes/dashes/multiplication signs, collapse whitespace. */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u2032`]/g, "'")
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\u00D7/g, "x")
    .replace(/\s+/g, " ")
    .replace(/\s*([.,;:!?])\s*$/g, "")
    .trim();
}

export function appearsIn(needle: string, haystack: string): boolean {
  const n = normalizeForMatch(needle);
  if (!n) return false;
  return normalizeForMatch(haystack).includes(n);
}

export function wordToNumber(word: string): number | null {
  const w = word.toLowerCase();
  if (/^\d{1,6}$/.test(w)) return Number(w);
  return NUMBER_WORDS[w] ?? null;
}

/** Every number stated in a piece of text, as digits or (some) words. */
export function numbersIn(text: string): number[] {
  const found: number[] = [];
  const re = /\b(\d{1,6}(?:\.\d+)?|once|twice|thrice|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|ninety|hundred|couple|single|both)\b/gi;
  for (const m of text.matchAll(re)) {
    const raw = m[1]!;
    const value = /^\d/.test(raw) ? Number(raw) : wordToNumber(raw);
    if (value !== null && Number.isFinite(value)) found.push(value);
  }
  return found;
}

const UNIT_SECONDS: Array<[RegExp, number]> = [
  [/^(s|sec|secs|second|seconds)$/i, 1],
  [/^(m|min|mins|minute|minutes)$/i, 60],
  [/^(h|hr|hrs|hour|hours)$/i, 3600],
];

/** Parse durations like "30 seconds", "five minutes", "1.5 hours", "30-second". */
export function durationSecondsFromText(text: string): number | null {
  const m = /\b(\d{1,4}(?:\.\d+)?|[a-z]+)[\s-]?(s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)\b/i.exec(text);
  if (!m) return null;
  const n = /^\d/.test(m[1]!) ? Number(m[1]) : wordToNumber(m[1]!);
  if (n === null) return null;
  const unit = UNIT_SECONDS.find(([re]) => re.test(m[2]!));
  if (!unit) return null;
  const seconds = Math.round(n * unit[1]);
  return seconds > 0 && seconds <= 86_400 ? seconds : null;
}

const STOPWORDS = new Set([
  "the", "and", "your", "you", "for", "with", "each", "every", "this", "that", "from",
  "into", "onto", "about", "please", "then", "them", "they", "some", "will", "would",
  "should", "could", "just", "also", "make", "sure", "remember",
]);

export function contentWords(text: string): string[] {
  return normalizeForMatch(text)
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}
