import { z } from "zod";

export const EXTRACTION_LIMITS = {
  maxCandidates: 12,
  maxNameChars: 80,
  maxInstructionChars: 500,
  maxEvidenceChars: 500,
  maxCueChars: 80,
  maxDetailTextChars: 80,
  maxUncertaintyItems: 4,
  maxUncertaintyChars: 200,
  maxOutputTokens: 2_000,
  timeoutMs: 20_000,
  maxAttempts: 2,
} as const;

const detailText = z.string().trim().min(1).max(EXTRACTION_LIMITS.maxDetailTextChars);

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const frequencySchema = z
  .object({
    kind: z.enum([
      "daily",
      "times_per_day",
      "times_per_week",
      "every_n_days",
      "specific_days",
      "as_needed",
      "other",
    ]),
    count: z.number().int().min(1).max(50).nullable().optional(),
    days: z.array(z.enum(WEEKDAYS)).max(7).nullable().optional(),
    /** The words in the source that state the frequency, verbatim. */
    text: detailText,
  })
  .strict();
export type Frequency = z.infer<typeof frequencySchema>;

export const quantitySchema = z
  .object({
    sets: z.number().int().min(1).max(100).nullable().optional(),
    reps: z.number().int().min(1).max(1000).nullable().optional(),
    count: z.number().int().min(1).max(10000).nullable().optional(),
    unit: z.string().trim().min(1).max(24).nullable().optional(),
    perSide: z.boolean().nullable().optional(),
    text: detailText,
  })
  .strict();
export type Quantity = z.infer<typeof quantitySchema>;

export const durationSchema = z
  .object({
    seconds: z.number().int().min(1).max(86_400),
    text: detailText,
  })
  .strict();
export type Duration = z.infer<typeof durationSchema>;

export const candidateSchema = z
  .object({
    candidateId: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(EXTRACTION_LIMITS.maxNameChars),
    instruction: z.string().trim().min(1).max(EXTRACTION_LIMITS.maxInstructionChars),
    timingCue: z.string().trim().min(1).max(EXTRACTION_LIMITS.maxCueChars).nullable(),
    frequency: frequencySchema.nullable(),
    quantity: quantitySchema.nullable(),
    duration: durationSchema.nullable(),
    evidence: z.string().trim().min(1).max(EXTRACTION_LIMITS.maxEvidenceChars),
    clarificationRequired: z.boolean(),
    uncertainty: z
      .array(z.string().trim().min(1).max(EXTRACTION_LIMITS.maxUncertaintyChars))
      .max(EXTRACTION_LIMITS.maxUncertaintyItems),
  })
  .strict();
export type Candidate = z.infer<typeof candidateSchema>;

/**
 * What a provider must return. `.strict()` everywhere: unknown fields (for example a
 * model inventing `approved: true`) make the whole output invalid.
 */
export const providerOutputSchema = z
  .object({
    candidates: z.array(candidateSchema).max(EXTRACTION_LIMITS.maxCandidates * 2),
  })
  .strict();
export type ProviderOutput = z.infer<typeof providerOutputSchema>;

/** JSON Schema mirror of providerOutputSchema, used as the model's tool input schema. */
export const providerOutputJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["candidates"],
  properties: {
    candidates: {
      type: "array",
      maxItems: EXTRACTION_LIMITS.maxCandidates,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "candidateId", "name", "instruction", "timingCue", "frequency", "quantity",
          "duration", "evidence", "clarificationRequired", "uncertainty",
        ],
        properties: {
          candidateId: { type: "string", maxLength: 40 },
          name: { type: "string", maxLength: EXTRACTION_LIMITS.maxNameChars, description: "Short label, 2-6 words, using the source's own words." },
          instruction: { type: "string", maxLength: EXTRACTION_LIMITS.maxInstructionChars, description: "The instruction copied verbatim from the source." },
          timingCue: { type: ["string", "null"], maxLength: EXTRACTION_LIMITS.maxCueChars, description: "When to do it, verbatim from the source (e.g. 'before work'), or null." },
          frequency: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["kind", "text"],
            properties: {
              kind: { type: "string", enum: ["daily", "times_per_day", "times_per_week", "every_n_days", "specific_days", "as_needed", "other"] },
              count: { type: ["integer", "null"], minimum: 1, maximum: 50 },
              days: { type: ["array", "null"], items: { type: "string", enum: [...WEEKDAYS] } },
              text: { type: "string", maxLength: EXTRACTION_LIMITS.maxDetailTextChars, description: "Verbatim words from the source." },
            },
          },
          quantity: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["text"],
            properties: {
              sets: { type: ["integer", "null"] },
              reps: { type: ["integer", "null"] },
              count: { type: ["integer", "null"] },
              unit: { type: ["string", "null"], maxLength: 24 },
              perSide: { type: ["boolean", "null"] },
              text: { type: "string", maxLength: EXTRACTION_LIMITS.maxDetailTextChars, description: "Verbatim words from the source." },
            },
          },
          duration: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["seconds", "text"],
            properties: {
              seconds: { type: "integer", minimum: 1, maximum: 86400 },
              text: { type: "string", maxLength: EXTRACTION_LIMITS.maxDetailTextChars, description: "Verbatim words from the source." },
            },
          },
          evidence: { type: "string", maxLength: EXTRACTION_LIMITS.maxEvidenceChars, description: "The exact sentence from the source that supports this habit." },
          clarificationRequired: { type: "boolean" },
          uncertainty: { type: "array", maxItems: EXTRACTION_LIMITS.maxUncertaintyItems, items: { type: "string", maxLength: EXTRACTION_LIMITS.maxUncertaintyChars } },
        },
      },
    },
  },
} as const;

export type ExtractionErrorCategory =
  | "provider_unavailable"
  | "provider_timeout"
  | "invalid_output"
  | "rate_limited"
  | "internal";

export class ExtractionError extends Error {
  constructor(
    readonly category: ExtractionErrorCategory,
    readonly retryable: boolean,
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

/** Parse and validate untrusted provider output (string or object). */
export function parseProviderOutput(raw: unknown): ProviderOutput {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ExtractionError("invalid_output", true, "Provider returned malformed JSON.");
    }
  }
  const result = providerOutputSchema.safeParse(value);
  if (!result.success) {
    throw new ExtractionError("invalid_output", true, "Provider output did not match the schema.");
  }
  return result.data;
}
