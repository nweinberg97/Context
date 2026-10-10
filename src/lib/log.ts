/**
 * Content-free structured logging. Callers pass an event name and a small set of
 * identifiers/categories; message text, habit names, emails and tokens are never
 * logged. Unknown keys are dropped rather than printed.
 */

const ALLOWED_KEYS = new Set([
  "userId", "importId", "routineId", "habitId", "jobId", "category", "status", "provider",
  "attempts", "count", "durationMs", "reason", "route", "mode", "code",
]);

type Fields = Partial<Record<string, string | number | boolean | null | undefined>>;

function emit(level: "info" | "warn" | "error", event: string, fields: Fields = {}) {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (ALLOWED_KEYS.has(k) && v !== undefined) safe[k] = typeof v === "string" ? v.slice(0, 80) : v;
  }
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (process.env.NODE_ENV !== "test") console.info(line);
}

export const log = {
  info: (event: string, fields?: Fields) => emit("info", event, fields),
  warn: (event: string, fields?: Fields) => emit("warn", event, fields),
  error: (event: string, fields?: Fields) => emit("error", event, fields),
};
