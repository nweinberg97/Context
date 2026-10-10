import { z } from "zod";
import { durationSchema, frequencySchema, quantitySchema } from "../extraction/schema";

/**
 * Stored habit details. The `origin` says whether a detail was stated in the message
 * ("message", verified by the extraction guard) or written by the person ("person").
 */
const origin = z.enum(["message", "person"]).default("message");
export const storedFrequencySchema = frequencySchema.extend({ origin });
export const storedQuantitySchema = quantitySchema.extend({ origin });
export const storedDurationSchema = durationSchema.extend({ origin });
export type StoredFrequency = z.infer<typeof storedFrequencySchema>;
export type StoredQuantity = z.infer<typeof storedQuantitySchema>;
export type StoredDuration = z.infer<typeof storedDurationSchema>;

export type HabitStatus = "draft" | "active" | "archived" | "rejected";
export type RoutineStatus = "draft" | "active" | "archived";
export type CompletionState = "done" | "partial" | "skipped";

export interface Habit {
  id: string;
  routineId: string;
  name: string;
  instruction: string;
  timingCue: string | null;
  frequency: StoredFrequency | null;
  quantity: StoredQuantity | null;
  duration: StoredDuration | null;
  sourceEvidence: string | null;
  clarificationStatus: "none" | "needs_input" | "resolved";
  clarificationNotes: string[];
  origin: "extracted" | "manual";
  status: HabitStatus;
  approvedAt: string | null;
  trackingType: "check" | "count" | "duration";
  position: number;
}

export interface Routine {
  id: string;
  title: string;
  status: RoutineStatus;
  sourceImportId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoutineWithHabits extends Routine {
  habits: Habit[];
}

export interface SourceImport {
  id: string;
  title: string | null;
  sourceType: "paste" | "email_forward";
  sanitizedText: string | null;
  status: "received" | "extracting" | "ready_for_review" | "reviewed" | "failed";
  parseFlags: string[];
  extractionProvider: string | null;
  errorCategory: string | null;
  contentRemovedAt: string | null;
  createdAt: string;
}

export interface HabitEvent {
  habitId: string;
  occurredOn: string;
  state: CompletionState;
  count: number | null;
  durationSeconds: number | null;
}

export interface Profile {
  id: string;
  email: string | null;
  displayName: string | null;
  timezone: string;
  onboardedAt: string | null;
  aiNoticeAcknowledgedAt: string | null;
}

export interface ReminderSettings {
  enabled: boolean;
  preferredLocalTime: string;
  timezone: string;
  days: number[];
  pausedUntil: string | null;
  unsubscribedAt: string | null;
}

/** Shared SQL column lists (explicit: some columns are deliberately not readable). */
export const HABIT_COLUMNS = `id, routine_id as "routineId", name, instruction, timing_cue as "timingCue",
  frequency, quantity, duration, source_evidence as "sourceEvidence",
  clarification_status as "clarificationStatus", clarification_notes as "clarificationNotes",
  origin, status, approved_at as "approvedAt", tracking_type as "trackingType", position`;

export const ROUTINE_COLUMNS = `id, title, status, source_import_id as "sourceImportId",
  created_at as "createdAt", updated_at as "updatedAt"`;

export const IMPORT_COLUMNS = `id, title, source_type as "sourceType", sanitized_text as "sanitizedText", status,
  parse_flags as "parseFlags", extraction_provider as "extractionProvider", error_category as "errorCategory",
  content_removed_at as "contentRemovedAt", created_at as "createdAt"`;

export const PREFS_COLUMNS = `enabled, to_char(preferred_local_time, 'HH24:MI') as "preferredLocalTime", timezone, days,
  paused_until as "pausedUntil", unsubscribed_at as "unsubscribedAt"`;
