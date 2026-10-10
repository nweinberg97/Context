import type { ParsedInput } from "../../parser";
import type { ProviderOutput } from "../schema";

export interface ExtractionProvider {
  /** Stable identifier stored with each import (e.g. "anthropic", "rules"). */
  id: string;
  /** Provider + prompt version, stored as the import's extraction_version. */
  version: string;
  /** Human-readable label shown in the product where processing is explained. */
  label: string;
  /** True when source text leaves this server (a third-party processor). */
  external: boolean;
  /**
   * Returns raw, untrusted output. The caller validates it against the schema and
   * runs the faithfulness guard; providers must not be trusted to do either.
   */
  extract(input: ParsedInput, options: { signal: AbortSignal }): Promise<unknown>;
}

export type { ProviderOutput };
