import "server-only";
import { getConfig } from "../config";
import { createAnthropicProvider } from "./providers/anthropic";
import { rulesProvider } from "./providers/rules";
import type { ExtractionProvider } from "./providers/types";

/** The one configured provider. There is no automatic fallback between providers. */
export function getExtractionProvider(): ExtractionProvider {
  const { extraction } = getConfig();
  if (extraction.mode === "anthropic") {
    return createAnthropicProvider({ apiKey: extraction.apiKey!, model: extraction.model });
  }
  return rulesProvider;
}
