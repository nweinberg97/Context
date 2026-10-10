import "server-only";
import { z } from "zod";
import { withSystem, withUser } from "../db";
import { ExtractionError, runExtraction, type GuardNotice } from "../extraction";
import { getExtractionProvider } from "../extraction/provider";
import { log } from "../log";
import { ParseError, buildParsedInput, parseSelectedText, PARSER_VERSION } from "../parser";
import { IMPORT_COLUMNS, storedDurationSchema, storedFrequencySchema, storedQuantitySchema, type SourceImport } from "./types";

export type ImportOutcome =
  | { status: "ready"; routineId: string; candidateCount: number; notices: GuardNotice[] }
  | { status: "duplicate"; routineId: string | null; importId: string }
  | { status: "error"; category: string; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  empty: "There's no message text to work with. Paste the part of the email with the advice.",
  too_large: "That's longer than 12,000 characters. Paste just the part with the advice.",
  unparseable: "That doesn't look like text. Copy the message text and paste it again.",
  provider_unavailable: "Couldn't reach the extraction service. Your text is still here — try again in a minute.",
  provider_timeout: "Reading the message took too long. Try again, or paste a shorter excerpt.",
  invalid_output: "The extraction service returned something unusable. Try again — nothing was saved as a habit.",
  rate_limited: "Too many imports in a short time. Wait a few minutes and try again.",
  internal: "Something went wrong while reading the message. Your text is still here — try again.",
};

function deriveTitle(title: string | null, body: string): string {
  if (title) return title.slice(0, 120);
  const firstLine = body.split("\n").find((l) => l.trim().length > 0) ?? "New routine";
  const words = firstLine.replace(/^(hi|hello|hey|dear)\b[^,]*,?\s*/i, "").split(/\s+/).slice(0, 6).join(" ");
  return (words || "New routine").replace(/[.,;:!?]+$/, "").slice(0, 120);
}

/**
 * Selected-text import pipeline:
 *   parse → fingerprint/dedupe → record import (system) → extract (bounded) →
 *   guard → store draft routine + draft habits (as the person, under RLS).
 * Nothing becomes active here; the person approves each habit on the review screen.
 */
export async function importSelectedText(userId: string, rawText: string, rawTitle: string | null): Promise<ImportOutcome> {
  let parsed;
  try {
    parsed = parseSelectedText(rawText, rawTitle);
  } catch (error) {
    const category = error instanceof ParseError ? error.category : "unparseable";
    return { status: "error", category, message: ERROR_MESSAGES[category]! };
  }

  // Idempotency: the same content imported twice points to the existing routine.
  const existing = await withUser(userId, (tx) =>
    tx.one<{ importId: string; routineId: string | null; status: string }>(
      `select si.id as "importId", r.id as "routineId", si.status
       from public.source_imports si left join public.routines r on r.source_import_id = si.id
       where si.content_fingerprint = $1 limit 1`,
      [parsed.fingerprint],
    ),
  );
  if (existing && existing.status !== "failed") {
    return { status: "duplicate", routineId: existing.routineId, importId: existing.importId };
  }

  const provider = getExtractionProvider();

  // Trusted pipeline write: ownership comes from the verified session, never the form.
  const sourceId = await withSystem(async (tx) => {
    if (existing) await tx.query(`delete from public.source_imports where id = $1 and user_id = $2`, [existing.importId, userId]);
    const row = await tx.one<{ id: string }>(
      `insert into public.source_imports
         (user_id, source_type, title, sanitized_text, content_fingerprint, status, parser_version, extraction_provider, parse_flags)
       values ($1, 'paste', $2, $3, $4, 'extracting', $5, $6, $7) returning id`,
      [userId, parsed.title, parsed.body, parsed.fingerprint, PARSER_VERSION, provider.id, parsed.flags],
    );
    return row!.id;
  });

  const input = buildParsedInput({ sourceId, userId, sourceType: "paste", parsed });
  const started = Date.now();
  let result;
  try {
    result = await runExtraction(provider, input);
  } catch (error) {
    const category = error instanceof ExtractionError ? error.category : "internal";
    await withSystem((tx) =>
      tx.query(`update public.source_imports set status = 'failed', error_category = $2 where id = $1`, [sourceId, category]),
    );
    log.warn("import.extraction_failed", { userId, importId: sourceId, category, provider: provider.id, durationMs: Date.now() - started });
    return { status: "error", category, message: ERROR_MESSAGES[category] ?? ERROR_MESSAGES.internal! };
  }

  const routineId = await withUser(userId, async (tx) => {
    const routine = await tx.one<{ id: string }>(
      `insert into public.routines (title, status, source_import_id) values ($1, 'draft', $2) returning id`,
      [deriveTitle(parsed.title, parsed.body), sourceId],
    );
    let position = 0;
    for (const c of result.candidates) {
      await tx.query(
        `insert into public.habits (routine_id, name, instruction, timing_cue, frequency, quantity, duration,
           source_evidence, clarification_status, clarification_notes, origin, status, position)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'extracted', 'draft', $11)`,
        [
          routine!.id,
          c.name,
          c.instruction,
          c.timingCue,
          c.frequency ? storedFrequencySchema.parse({ ...c.frequency, origin: "message" }) : null,
          c.quantity ? storedQuantitySchema.parse({ ...c.quantity, origin: "message" }) : null,
          c.duration ? storedDurationSchema.parse({ ...c.duration, origin: "message" }) : null,
          c.evidence,
          c.clarificationRequired ? "needs_input" : "none",
          c.uncertainty,
          position++,
        ],
      );
    }
    return routine!.id;
  });

  await withSystem((tx) =>
    tx.query(`update public.source_imports set status = 'ready_for_review', extraction_version = $2 where id = $1`, [
      sourceId,
      result.providerVersion,
    ]),
  );
  log.info("import.ready", { userId, importId: sourceId, count: result.candidates.length, provider: provider.id, attempts: result.attempts, durationMs: Date.now() - started });
  return { status: "ready", routineId, candidateCount: result.candidates.length, notices: result.notices };
}

export async function getImport(userId: string, importId: string): Promise<SourceImport | null> {
  if (!z.string().uuid().safeParse(importId).success) return null;
  return withUser(userId, (tx) => tx.one<SourceImport>(`select ${IMPORT_COLUMNS} from public.source_imports where id = $1`, [importId]));
}

export async function listImports(userId: string): Promise<SourceImport[]> {
  return withUser(userId, (tx) => tx.query<SourceImport>(`select ${IMPORT_COLUMNS} from public.source_imports order by created_at desc`));
}

export async function markImportReviewed(userId: string, importId: string): Promise<void> {
  await withSystem((tx) =>
    tx.query(`update public.source_imports set status = 'reviewed' where id = $1 and user_id = $2`, [importId, userId]),
  );
}

/** Removes the stored message text but keeps the import record and approved routines. */
export async function removeSourceContent(userId: string, importId?: string): Promise<number> {
  return withSystem(async (tx) => {
    const rows = await tx.query(
      `update public.source_imports set sanitized_text = null, content_removed_at = now()
       where user_id = $1 and ($2::uuid is null or id = $2::uuid) and content_removed_at is null returning id`,
      [userId, importId ?? null],
    );
    // Source evidence quotes on habits are part of the source content too.
    await tx.query(
      `update public.habits h set source_evidence = null
       from public.routines r where h.routine_id = r.id and h.user_id = $1
         and ($2::uuid is null or r.source_import_id = $2::uuid)`,
      [userId, importId ?? null],
    );
    return rows.length;
  });
}

/** Deletes a source import. Approved routines are kept; their link is cleared. */
export async function deleteSource(userId: string, importId: string): Promise<boolean> {
  if (!z.string().uuid().safeParse(importId).success) return false;
  const kept = await withUser(userId, async (tx) => {
    // Unreviewed draft routines from this source have no value without it.
    await tx.query(`delete from public.routines where source_import_id = $1 and status = 'draft'`, [importId]);
    const linked = await tx.query<{ id: string }>(`select id from public.routines where source_import_id = $1`, [importId]);
    const rows = await tx.query(`delete from public.source_imports where id = $1 returning id`, [importId]);
    return rows.length === 1 ? linked.map((r) => r.id) : null;
  });
  if (kept === null) return false;
  if (kept.length) {
    // Evidence quotes are source content: remove them along with the source.
    await withSystem((tx) =>
      tx.query(`update public.habits set source_evidence = null where user_id = $1 and routine_id = any($2::uuid[])`, [userId, kept]),
    );
  }
  return true;
}
