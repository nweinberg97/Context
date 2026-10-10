import type { ParsedInput } from "../parser";
import { guardCandidates, type GuardResult } from "./guard";
import { EXTRACTION_LIMITS, ExtractionError, parseProviderOutput } from "./schema";
import type { ExtractionProvider } from "./providers/types";

export { ExtractionError } from "./schema";
export type { ExtractionProvider } from "./providers/types";
export type { GuardedCandidate, GuardNotice } from "./guard";

export interface ExtractionResult extends GuardResult {
  providerId: string;
  providerVersion: string;
  attempts: number;
}

/**
 * Runs one provider with a hard timeout per attempt and a bounded number of retries
 * for retryable failures. There is deliberately no fallback to a different provider:
 * switching processors silently could send text somewhere with different privacy terms.
 */
export async function runExtraction(
  provider: ExtractionProvider,
  input: ParsedInput,
  options: { timeoutMs?: number; maxAttempts?: number; backoffMs?: number } = {},
): Promise<ExtractionResult> {
  const timeoutMs = options.timeoutMs ?? EXTRACTION_LIMITS.timeoutMs;
  const maxAttempts = Math.min(options.maxAttempts ?? EXTRACTION_LIMITS.maxAttempts, 3);
  const backoffMs = options.backoffMs ?? 750;

  let lastError: ExtractionError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const raw = await Promise.race([
        provider.extract(input, { signal: controller.signal }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () =>
            reject(new ExtractionError("provider_timeout", true, "Extraction timed out.")),
          );
        }),
      ]);
      const output = parseProviderOutput(raw);
      const guarded = guardCandidates(output, input.body);
      return { ...guarded, providerId: provider.id, providerVersion: provider.version, attempts: attempt };
    } catch (error) {
      lastError =
        error instanceof ExtractionError
          ? error
          : new ExtractionError("internal", false, "Unexpected extraction failure.");
      if (!lastError.retryable || attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, backoffMs * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new ExtractionError("internal", false, "Extraction failed.");
}
