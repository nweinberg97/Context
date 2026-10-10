/**
 * Conservative HTML → plain text conversion for pasted or forwarded email bodies.
 *
 * This is a small streaming tokenizer, not a regex replace: it understands comments,
 * quoted attribute values, raw-text elements (script/style) and nesting of block
 * quotes. Its output is plain text that is only ever rendered as escaped text — it is
 * never turned back into HTML — so it is a readability tool, not a sanitizer.
 */

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "tbody", "td", "tfoot",
  "th", "thead", "tr", "ul",
]);

const SKIP_CONTENT_TAGS = new Set(["script", "style", "head", "title", "template", "noscript", "svg"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "\u2019", lsquo: "\u2018",
  rdquo: "\u201D", ldquo: "\u201C", mdash: "\u2014", ndash: "\u2013", hellip: "\u2026",
  bull: "\u2022", middot: "\u00B7", times: "\u00D7", deg: "\u00B0", frac12: "\u00BD",
  copy: "\u00A9", reg: "\u00AE", trade: "\u2122", eacute: "\u00E9", egrave: "\u00E8",
  ouml: "\u00F6", uuml: "\u00FC", auml: "\u00E4", ccedil: "\u00E7", shy: "",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,10});/gi, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return "";
      }
      return String.fromCodePoint(code);
    }
    const named = NAMED_ENTITIES[body.toLowerCase()];
    return named ?? match;
  });
}

/** Heuristic: does this text look like an HTML document or fragment? */
export function looksLikeHtml(text: string): boolean {
  const tags = text.match(/<\/?(?:html|body|div|p|br|span|table|tr|td|a|ul|ol|li|blockquote|strong|em|b|i|font|h[1-6])\b[^>]*>/gi);
  return (tags?.length ?? 0) >= 2;
}

function readTag(input: string, start: number): { end: number; name: string; closing: boolean } {
  // start points at '<'
  let i = start + 1;
  let quote: string | null = null;
  while (i < input.length) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === ">") {
      break;
    }
    i++;
  }
  const raw = input.slice(start + 1, i);
  const closing = raw.startsWith("/");
  const nameMatch = /^\/?\s*([a-zA-Z][a-zA-Z0-9-]*)/.exec(raw);
  return { end: Math.min(i, input.length - 1), name: (nameMatch?.[1] ?? "").toLowerCase(), closing };
}

export function htmlToText(input: string): string {
  const out: string[] = [];
  let quoteDepth = 0;
  let line = "";

  const flushLine = () => {
    const prefix = quoteDepth > 0 ? "> ".repeat(quoteDepth) : "";
    out.push(prefix + line);
    line = "";
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === "<") {
      if (input.startsWith("<!--", i)) {
        const close = input.indexOf("-->", i + 4);
        i = close === -1 ? input.length : close + 3;
        continue;
      }
      if (input.startsWith("<!", i) || input.startsWith("<?", i)) {
        const close = input.indexOf(">", i);
        i = close === -1 ? input.length : close + 1;
        continue;
      }
      const next = input[i + 1] ?? "";
      if (!/[a-zA-Z/]/.test(next)) {
        // A literal "<" in text (e.g. "< 5 minutes").
        line += ch;
        i++;
        continue;
      }

      const tag = readTag(input, i);
      i = tag.end + 1;

      if (!tag.closing && SKIP_CONTENT_TAGS.has(tag.name)) {
        const closeIdx = input.toLowerCase().indexOf(`</${tag.name}`, i);
        if (closeIdx === -1) {
          i = input.length;
        } else {
          const closeEnd = input.indexOf(">", closeIdx);
          i = closeEnd === -1 ? input.length : closeEnd + 1;
        }
        continue;
      }

      if (tag.name === "blockquote") {
        if (line.trim()) flushLine();
        quoteDepth = tag.closing ? Math.max(0, quoteDepth - 1) : quoteDepth + 1;
        continue;
      }

      if (BLOCK_TAGS.has(tag.name)) {
        if (line.trim() || tag.name === "br" || tag.name === "p") flushLine();
        if (tag.name === "li" && !tag.closing) line = "- ";
      }
      continue;
    }

    if (ch === "\n" || ch === "\r" || ch === "\t") {
      line += " ";
    } else {
      line += ch;
    }
    i++;
  }
  if (line.trim()) flushLine();

  return out
    .map((l) => decodeEntities(l).replace(/[ \u00A0]+/g, " ").replace(/\s+$/g, ""))
    .join("\n");
}
