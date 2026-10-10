/**
 * Anthropic Messages API adapter (plain fetch — no SDK dependency).
 *
 * Source text leaves this server when this provider is used. Before enabling it in
 * production, verify the account's data-retention and training settings and disclose
 * them in the product (Settings → Privacy explains external processing).
 */

import { EXTRACTION_LIMITS, ExtractionError, providerOutputJsonSchema } from "../schema";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildUserMessage } from "../prompt";
import type { ExtractionProvider } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
const TOOL_NAME = "record_habit_candidates";

export function createAnthropicProvider(config: {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}): ExtractionProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    id: "anthropic",
    version: `anthropic:${config.model}/${PROMPT_VERSION}`,
    label: `Claude (${config.model}) via the Anthropic API`,
    external: true,
    async extract(input, { signal }) {
      let response: Response;
      try {
        response = await fetchImpl(API_URL, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: config.model,
            max_tokens: EXTRACTION_LIMITS.maxOutputTokens,
            temperature: 0,
            system: SYSTEM_PROMPT,
            tools: [
              {
                name: TOOL_NAME,
                description: "Record the follow-up actions found in the message.",
                input_schema: providerOutputJsonSchema,
              },
            ],
            tool_choice: { type: "tool", name: TOOL_NAME },
            messages: [{ role: "user", content: buildUserMessage(input) }],
          }),
        });
      } catch (error) {
        if (signal.aborted) throw new ExtractionError("provider_timeout", true, "Extraction timed out.");
        throw new ExtractionError("provider_unavailable", true, "Could not reach the extraction provider.");
      }

      if (response.status === 429) throw new ExtractionError("rate_limited", true, "Provider rate limit.");
      if (response.status >= 500) throw new ExtractionError("provider_unavailable", true, `Provider error ${response.status}.`);
      if (!response.ok) throw new ExtractionError("provider_unavailable", false, `Provider rejected the request (${response.status}).`);

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ExtractionError("invalid_output", true, "Provider returned a non-JSON response.");
      }

      const content = (payload as { content?: Array<{ type?: string; name?: string; input?: unknown }> }).content;
      const toolUse = Array.isArray(content)
        ? content.find((block) => block?.type === "tool_use" && block.name === TOOL_NAME)
        : undefined;
      if (!toolUse) throw new ExtractionError("invalid_output", true, "Provider did not return structured output.");
      return toolUse.input;
    },
  };
}
