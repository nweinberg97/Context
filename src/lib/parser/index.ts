import { createHash } from "node:crypto";
import { z } from "zod";
import { htmlToText, looksLikeHtml } from "./html";

export const PARSER_VERSION = "parser@1.0.0";
export const PARSED_INPUT_SCHEMA_VERSION = 1;

export const PARSE_LIMITS = {
  /** Hard ceiling on what we accept from the client before any processing. */
  maxRawChars: 50_000,
  /** What the person is told: the cleaned message can be up to this long. */
  maxBodyChars: 12_000,
  maxTitleChars: 120,
  minBodyChars: 3,
} as const;

export const PARSE_FLAGS = [
  "html_converted",
  "headers_removed",
  "forward_header_removed",
  "quoted_history_removed",
  "quoted_history_kept",
  "signature_removed",
  "mobile_footer_removed",
  "control_characters_removed",
] as const;
export type ParseFlag = (typeof PARSE_FLAGS)[number];

export type ParseErrorCategory = "empty" | "too_large" | "unparseable";

export class ParseError extends Error {
  constructor(
    readonly category: ParseErrorCategory,
    message: string,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

/**
 * Versioned, validated structure handed to the extraction layer.
 * `trusted` is built exclusively on the server from the verified session and the
 * ingestion path — it is never read from client input.
 */
export const parsedInputSchema = z
  .object({
    schemaVersion: z.literal(PARSED_INPUT_SCHEMA_VERSION),
    sourceId: z.string().uuid(),
    sourceType: z.enum(["paste", "email_forward"]),
    trusted: z
      .object({
        userId: z.string().uuid(),
        ingestion: z.enum(["web_paste", "inbound_email"]),
        receivedAt: z.string().datetime(),
        senderVerified: z.boolean(),
      })
      .strict(),
    scope: z
      .object({
        selectedByUser: z.literal(true),
        mailboxAccess: z.literal(false),
      })
      .strict(),
    title: z.string().max(PARSE_LIMITS.maxTitleChars).nullable(),
    body: z.string().min(PARSE_LIMITS.minBodyChars).max(PARSE_LIMITS.maxBodyChars),
    parserVersion: z.literal(PARSER_VERSION),
    flags: z.array(z.enum(PARSE_FLAGS)),
  })
  .strict();
export type ParsedInput = z.infer<typeof parsedInputSchema>;

export interface ParsedBody {
  title: string | null;
  body: string;
  flags: ParseFlag[];
  fingerprint: string;
}

const HEADER_LINE = /^(from|to|cc|bcc|subject|date|sent|reply-to|message-id|mime-version|content-type|received|return-path)\s*:/i;
const FORWARD_MARKER = /^-{2,}\s*(forwarded message|original message|begin forwarded message)\s*-{0,}:?$/i;
const ATTRIBUTION = /^(on\s.{3,200}\bwrote:|le\s.{3,200}\ba \u00E9crit\s?:|am\s.{3,200}\bschrieb:)$/i;
const OUTLOOK_SPLIT = /^-{3,}\s*original message\s*-{3,}$/i;
const MOBILE_FOOTER = /^(sent from my (iphone|ipad|android|phone|mobile|samsung|galaxy)|get outlook for (ios|android)|sent from (outlook|yahoo mail|mail) for)/i;
const SIGN_OFF = /^(best|best wishes|best regards|thanks|thank you|many thanks|cheers|regards|kind regards|warm regards|warmly|sincerely|talk soon|speak soon|all the best|take care|yours)[,.!]?$/i;

function normalize(text: string): { text: string; removedControl: boolean } {
  let removedControl = false;
  let t = text.normalize("NFC").replace(/\r\n?/g, "\n");
  // Zero-width characters and BOMs carry no meaning and break matching.
  t = t.replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
  // Other control characters (keep \n and \t).
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, () => {
    removedControl = true;
    return "";
  });
  t = t.replace(/[\t\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");
  t = t.replace(/[\u2028\u2029]/g, "\n");
  return { text: t, removedControl };
}

function tidyLines(lines: string[]): string[] {
  const tidied = lines.map((l) => l.replace(/ {2,}/g, " ").trimEnd());
  const result: string[] = [];
  let blankRun = 0;
  for (const line of tidied) {
    if (line.trim() === "") {
      blankRun++;
      if (blankRun > 1) continue;
      result.push("");
    } else {
      blankRun = 0;
      result.push(line.trimStart() === line ? line : line.replace(/^\s+/, ""));
    }
  }
  while (result.length && result[0] === "") result.shift();
  while (result.length && result[result.length - 1] === "") result.pop();
  return result;
}

function hasContent(lines: string[]): boolean {
  return lines.some((l) => l.trim().length > 0 && !l.trim().startsWith(">"));
}

/** Strip a leading block of RFC 822-style headers, capturing the subject. */
function stripLeadingHeaders(lines: string[]): { lines: string[]; subject: string | null; removed: boolean } {
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") i++;
  let count = 0;
  let subject: string | null = null;
  let j = i;
  while (j < lines.length && HEADER_LINE.test(lines[j]!.trim())) {
    const m = /^subject\s*:\s*(.*)$/i.exec(lines[j]!.trim());
    if (m) subject = m[1]!.replace(/^(re|fwd?|aw|tr)\s*:\s*/gi, "").trim() || null;
    count++;
    j++;
  }
  if (count >= 2) return { lines: lines.slice(j), subject, removed: true };
  return { lines, subject: null, removed: false };
}

/** Remove "Forwarded message" markers plus the header block that follows them. */
function stripForwardHeaders(lines: string[]): { lines: string[]; subject: string | null; removed: boolean } {
  const out: string[] = [];
  let subject: string | null = null;
  let removed = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (FORWARD_MARKER.test(trimmed) && !OUTLOOK_SPLIT.test(trimmed)) {
      removed = true;
      let j = i + 1;
      while (j < lines.length) {
        const t = lines[j]!.trim();
        if (t !== "" && !HEADER_LINE.test(t)) break;
        const m = /^subject\s*:\s*(.*)$/i.exec(t);
        if (m) subject = m[1]!.replace(/^(re|fwd?)\s*:\s*/gi, "").trim() || null;
        j++;
      }
      i = j - 1;
      continue;
    }
    out.push(lines[i]!);
  }
  return { lines: out, subject, removed };
}

/**
 * Remove quoted reply history conservatively: only when there is real, unquoted
 * content before it. If everything is quoted, keep it (unquoted) and flag it.
 */
function stripQuotedHistory(lines: string[]): { lines: string[]; flag: ParseFlag | null } {
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    const isAttribution = ATTRIBUTION.test(trimmed);
    const isOutlook = OUTLOOK_SPLIT.test(trimmed);
    // "From: X" followed by "Sent:" mid-body is Outlook's reply header.
    const isOutlookHeader =
      /^from\s*:/i.test(trimmed) && i + 1 < lines.length && /^(sent|date)\s*:/i.test(lines[i + 1]!.trim());
    if ((isAttribution || isOutlook || isOutlookHeader) && i > 0) {
      const before = lines.slice(0, i);
      if (hasContent(before)) return { lines: before, flag: "quoted_history_removed" };
    }
  }

  const quoted = lines.filter((l) => l.trim().startsWith(">")).length;
  if (quoted === 0) return { lines, flag: null };

  const unquoted = lines.filter((l) => !l.trim().startsWith(">"));
  if (hasContent(unquoted)) {
    return { lines: unquoted, flag: "quoted_history_removed" };
  }
  // Everything is quoted: the advice probably lives in the quote. Keep it.
  return {
    lines: lines.map((l) => l.replace(/^\s*(>\s?)+/, "")),
    flag: "quoted_history_kept",
  };
}

function stripSignature(lines: string[]): { lines: string[]; flags: ParseFlag[] } {
  const flags: ParseFlag[] = [];
  let result = lines.filter((l) => {
    if (MOBILE_FOOTER.test(l.trim())) {
      flags.push("mobile_footer_removed");
      return false;
    }
    return true;
  });

  // RFC 3676 delimiter: a line that is exactly "-- ".
  const delimiter = result.findIndex((l) => l === "-- " || l === "--");
  if (delimiter > 0 && hasContent(result.slice(0, delimiter))) {
    result = result.slice(0, delimiter);
    flags.push("signature_removed");
    return { lines: result, flags: [...new Set(flags)] };
  }

  // A sign-off near the end followed only by a few short lines (name, title, phone).
  const searchFrom = Math.max(1, result.length - 8);
  for (let i = result.length - 1; i >= searchFrom; i--) {
    if (SIGN_OFF.test(result[i]!.trim())) {
      const tail = result.slice(i + 1).filter((l) => l.trim() !== "");
      const before = result.slice(0, i);
      if (tail.length <= 6 && tail.every((l) => l.trim().length <= 60) && hasContent(before)) {
        result = before;
        flags.push("signature_removed");
      }
      break;
    }
  }
  return { lines: result, flags: [...new Set(flags)] };
}

export function fingerprintContent(body: string): string {
  const canonical = body.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function sanitizeTitle(title: string | null | undefined): string | null {
  if (!title) return null;
  const { text } = normalize(title);
  const cleaned = text.replace(/\s+/g, " ").trim().slice(0, PARSE_LIMITS.maxTitleChars);
  return cleaned.length ? cleaned : null;
}

/**
 * Deterministic parsing of selected text. Throws ParseError with a category the UI
 * can explain. Never stores or returns the raw input.
 */
export function parseSelectedText(raw: string, providedTitle?: string | null): ParsedBody {
  if (typeof raw !== "string") throw new ParseError("unparseable", "Input must be text.");
  if (raw.length > PARSE_LIMITS.maxRawChars) {
    throw new ParseError("too_large", `Paste up to ${PARSE_LIMITS.maxBodyChars.toLocaleString("en-US")} characters.`);
  }
  if (/\u0000/.test(raw) && raw.replace(/[^\u0000]/g, "").length > raw.length * 0.01) {
    throw new ParseError("unparseable", "That doesn't look like text.");
  }

  const flags = new Set<ParseFlag>();
  const normalized = normalize(raw);
  const removedControl = normalized.removedControl;
  let text = normalized.text;
  if (removedControl) flags.add("control_characters_removed");

  if (looksLikeHtml(text)) {
    text = htmlToText(text);
    flags.add("html_converted");
  }

  let lines = text.split("\n");
  let title = sanitizeTitle(providedTitle);

  const headers = stripLeadingHeaders(lines);
  if (headers.removed) {
    lines = headers.lines;
    flags.add("headers_removed");
    title ??= sanitizeTitle(headers.subject);
  }

  const forwarded = stripForwardHeaders(lines);
  if (forwarded.removed) {
    lines = forwarded.lines;
    flags.add("forward_header_removed");
    title ??= sanitizeTitle(forwarded.subject);
  }

  const quoted = stripQuotedHistory(lines);
  lines = quoted.lines;
  if (quoted.flag) flags.add(quoted.flag);

  const signature = stripSignature(lines);
  lines = signature.lines;
  signature.flags.forEach((f) => flags.add(f));

  const body = tidyLines(lines).join("\n");

  if (body.replace(/\s/g, "").length < PARSE_LIMITS.minBodyChars) {
    throw new ParseError("empty", "There's no message text to work with.");
  }
  if (body.length > PARSE_LIMITS.maxBodyChars) {
    throw new ParseError("too_large", `Paste up to ${PARSE_LIMITS.maxBodyChars.toLocaleString("en-US")} characters.`);
  }

  return { title, body, flags: [...flags], fingerprint: fingerprintContent(body) };
}

export function buildParsedInput(args: {
  sourceId: string;
  userId: string;
  sourceType: "paste" | "email_forward";
  parsed: ParsedBody;
  receivedAt?: Date;
}): ParsedInput {
  return parsedInputSchema.parse({
    schemaVersion: PARSED_INPUT_SCHEMA_VERSION,
    sourceId: args.sourceId,
    sourceType: args.sourceType,
    trusted: {
      userId: args.userId,
      ingestion: args.sourceType === "paste" ? "web_paste" : "inbound_email",
      receivedAt: (args.receivedAt ?? new Date()).toISOString(),
      // Sender verification only exists for a configured inbound-email provider.
      senderVerified: false,
    },
    scope: { selectedByUser: true, mailboxAccess: false },
    title: args.parsed.title,
    body: args.parsed.body,
    parserVersion: PARSER_VERSION,
    flags: args.parsed.flags,
  });
}
