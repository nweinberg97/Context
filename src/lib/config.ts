import "server-only";
import { z } from "zod";

/**
 * Central, validated configuration. Every external service is optional: when it is
 * missing the product runs in a clearly labelled development mode instead of
 * pretending the integration works.
 */

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  NEXT_PUBLIC_SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,

  LOCAL_AUTH_SECRET: optional,
  CONTEXT_ALLOW_LOCAL_AUTH: optional,

  EXTRACTION_PROVIDER: z.enum(["anthropic", "rules"]).optional(),
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default("claude-haiku-5-5"),

  EMAIL_PROVIDER: z.enum(["resend", "outbox", "none"]).optional(),
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
  EMAIL_WEBHOOK_SECRET: optional,
  MAX_EMAILS_PER_DAY: z.coerce.number().int().min(0).max(100_000).default(90),

  CRON_SECRET: optional,
});

export type AuthMode = "supabase" | "local";
export type ExtractionMode = "anthropic" | "rules";
export type EmailMode = "resend" | "outbox" | "none";

export interface AppConfig {
  env: "development" | "test" | "production";
  appUrl: string;
  databaseUrl: string;
  auth:
    | { mode: "supabase"; url: string; anonKey: string; serviceRoleKey: string | undefined }
    | { mode: "local"; secret: string };
  extraction: { mode: ExtractionMode; apiKey?: string; model: string };
  email: { mode: EmailMode; apiKey?: string; from?: string; webhookSecret?: string; maxPerDay: number };
  cronSecret: string | undefined;
}

let cached: AppConfig | null = null;

export class ConfigError extends Error {}

export function getConfig(): AppConfig {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new ConfigError(`Invalid environment configuration: ${fields}. See .env.example.`);
  }
  const e = parsed.data;

  let auth: AppConfig["auth"];
  if (e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    auth = { mode: "supabase", url: e.NEXT_PUBLIC_SUPABASE_URL, anonKey: e.NEXT_PUBLIC_SUPABASE_ANON_KEY, serviceRoleKey: e.SUPABASE_SERVICE_ROLE_KEY };
  } else {
    if (e.NODE_ENV === "production" && e.CONTEXT_ALLOW_LOCAL_AUTH !== "true") {
      throw new ConfigError(
        "Supabase is not configured. Local development sign-in is disabled in production unless CONTEXT_ALLOW_LOCAL_AUTH=true (for local testing only).",
      );
    }
    const secret = e.LOCAL_AUTH_SECRET ?? (e.NODE_ENV === "production" ? undefined : "context-local-development-secret-not-for-production");
    if (!secret || secret.length < 32) {
      throw new ConfigError("LOCAL_AUTH_SECRET must be at least 32 characters.");
    }
    auth = { mode: "local", secret };
  }

  const extractionMode: ExtractionMode =
    e.EXTRACTION_PROVIDER ?? (e.ANTHROPIC_API_KEY ? "anthropic" : "rules");
  if (extractionMode === "anthropic" && !e.ANTHROPIC_API_KEY) {
    throw new ConfigError("EXTRACTION_PROVIDER=anthropic requires ANTHROPIC_API_KEY.");
  }

  const emailMode: EmailMode =
    e.EMAIL_PROVIDER ?? (e.RESEND_API_KEY && e.EMAIL_FROM ? "resend" : "none");
  if (emailMode === "resend" && (!e.RESEND_API_KEY || !e.EMAIL_FROM)) {
    throw new ConfigError("EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM.");
  }

  cached = {
    env: e.NODE_ENV,
    appUrl: e.APP_URL.replace(/\/+$/, ""),
    databaseUrl: e.DATABASE_URL,
    auth,
    extraction: { mode: extractionMode, apiKey: e.ANTHROPIC_API_KEY, model: e.ANTHROPIC_MODEL },
    email: { mode: emailMode, apiKey: e.RESEND_API_KEY, from: e.EMAIL_FROM, webhookSecret: e.EMAIL_WEBHOOK_SECRET, maxPerDay: e.MAX_EMAILS_PER_DAY },
    cronSecret: e.CRON_SECRET,
  };
  return cached;
}

/** Safe, non-secret summary for rendering in the UI. */
export function getPublicStatus() {
  const c = getConfig();
  return {
    authMode: c.auth.mode,
    extractionMode: c.extraction.mode,
    extractionExternal: c.extraction.mode === "anthropic",
    extractionModel: c.extraction.mode === "anthropic" ? c.extraction.model : null,
    emailMode: c.email.mode,
    remindersAvailable: c.email.mode !== "none" && Boolean(c.cronSecret),
  };
}
export type PublicStatus = ReturnType<typeof getPublicStatus>;
