/**
 * A small, dependency-free PDF writer: pages, text, rectangles and lines, with
 * embedded TrueType fonts (Archivo) and Flate-compressed content.
 *
 * Text is encoded as WinAnsi (Windows-1252), which covers English and most Western
 * European text in pasted advice. Characters outside it are drawn as "?".
 * Coordinates are in PDF points with the origin at the TOP-left of the page (the
 * writer flips them), which keeps layout code readable.
 */
import { deflateSync } from "node:zlib";
import { PDF_FONTS, type PdfFontData } from "./fonts.generated";

export type FontName = keyof typeof PDF_FONTS;
export type Rgb = readonly [number, number, number];

export function hex(color: string): Rgb {
  const n = Number.parseInt(color.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/* ------------------------------------------------------------------ encoding */

const CP1252_HIGH: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const SUBSTITUTES: Record<string, string> = { "−": "-", "‐": "-", "‑": "-", "′": "'", "″": '"', " ": " ", " ": " ", "​": "" };

export function encodeWinAnsi(text: string): number[] {
  const out: number[] = [];
  for (const raw of text.normalize("NFC")) {
    const ch = SUBSTITUTES[raw] ?? raw;
    for (const c of ch) {
      const cp = c.codePointAt(0)!;
      if (cp >= 32 && cp < 127) out.push(cp);
      else if (cp >= 160 && cp <= 255) out.push(cp);
      else if (CP1252_HIGH[cp] !== undefined) out.push(CP1252_HIGH[cp]!);
      else if (cp === 9 || cp === 10) out.push(32);
      else out.push(63); // "?"
    }
  }
  return out;
}

/* ----------------------------------------------------------------- measuring */

export function measure(font: FontName, size: number, text: string, tracking = 0): number {
  const data: PdfFontData = PDF_FONTS[font];
  const codes = encodeWinAnsi(text);
  let units = 0;
  for (const code of codes) units += data.widths[code - 32] ?? 500;
  return (units / 1000) * size + tracking * Math.max(0, codes.length - 1);
}

/** Greedy word wrap. Long words are broken by character so nothing overflows. */
export function wrap(font: FontName, size: number, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (let word of words) {
      while (measure(font, size, word) > maxWidth && word.length > 1) {
        let cut = word.length - 1;
        while (cut > 1 && measure(font, size, word.slice(0, cut)) > maxWidth) cut--;
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      const candidate = line ? `${line} ${word}` : word;
      if (measure(font, size, candidate) <= maxWidth) line = candidate;
      else {
        if (line) lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/* --------------------------------------------------------------------- pages */

const n = (v: number) => (Math.round(v * 100) / 100).toString();
const rgb = (c: Rgb) => `${n(c[0])} ${n(c[1])} ${n(c[2])}`;

export interface TextOptions {
  font: FontName;
  size: number;
  color?: Rgb;
  tracking?: number;
}

export class PdfPage {
  readonly ops: string[] = [];
  readonly fonts = new Set<FontName>();
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  /** Draws text with its baseline at y (measured from the top of the page). */
  text(text: string, x: number, y: number, o: TextOptions) {
    if (!text) return;
    this.fonts.add(o.font);
    const bytes = encodeWinAnsi(text)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    this.ops.push(
      `BT /${o.font} ${n(o.size)} Tf ${n(o.tracking ?? 0)} Tc ${rgb(o.color ?? [0, 0, 0])} rg ${n(x)} ${n(this.height - y)} Td <${bytes}> Tj ET`,
    );
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: Rgb; stroke?: Rgb; lineWidth?: number }) {
    const parts: string[] = ["q"];
    if (o.fill) parts.push(`${rgb(o.fill)} rg`);
    if (o.stroke) parts.push(`${rgb(o.stroke)} RG ${n(o.lineWidth ?? 1)} w`);
    parts.push(`${n(x)} ${n(this.height - y - h)} ${n(w)} ${n(h)} re`);
    parts.push(o.fill && o.stroke ? "B" : o.fill ? "f" : "S", "Q");
    this.ops.push(parts.join(" "));
  }

  line(x1: number, y1: number, x2: number, y2: number, color: Rgb, width = 0.75) {
    this.ops.push(`q ${rgb(color)} RG ${n(width)} w ${n(x1)} ${n(this.height - y1)} m ${n(x2)} ${n(this.height - y2)} l S Q`);
  }
}

/* ------------------------------------------------------------------ document */

export class PdfDocument {
  readonly pages: PdfPage[] = [];
  constructor(private readonly info: { title: string; author?: string; subject?: string }) {}

  addPage(width = 612, height = 792): PdfPage {
    const page = new PdfPage(width, height);
    this.pages.push(page);
    return page;
  }

  save(): Uint8Array {
    const chunks: Buffer[] = [];
    const offsets: number[] = [];
    let length = 0;
    const push = (b: Buffer | string) => {
      const buf = typeof b === "string" ? Buffer.from(b, "latin1") : b;
      chunks.push(buf);
      length += buf.length;
    };
    let nextId = 1;
    const alloc = () => nextId++;
    const objects = new Map<number, Buffer>();
    const define = (id: number, body: string | Buffer) => objects.set(id, typeof body === "string" ? Buffer.from(body, "latin1") : body);
    const stream = (id: number, dict: string, data: Buffer) =>
      define(id, Buffer.concat([Buffer.from(`<< ${dict} /Length ${data.length} >>\nstream\n`, "latin1"), data, Buffer.from("\nendstream", "latin1")]));

    const catalogId = alloc();
    const pagesId = alloc();
    const infoId = alloc();

    const used = new Set<FontName>();
    for (const p of this.pages) p.fonts.forEach((f) => used.add(f));
    const fontIds = new Map<FontName, number>();
    for (const name of used) {
      const f: PdfFontData = PDF_FONTS[name];
      const fontId = alloc();
      const descId = alloc();
      const fileId = alloc();
      const raw = Buffer.from(f.data, "base64");
      stream(fileId, `/Filter /FlateDecode /Length1 ${raw.length}`, deflateSync(raw));
      const flags = 32 + (f.italicAngle !== 0 ? 64 : 0);
      define(
        descId,
        `<< /Type /FontDescriptor /FontName /${f.postScriptName} /Flags ${flags} /FontBBox [${f.bbox.join(" ")}] /ItalicAngle ${f.italicAngle} /Ascent ${f.ascent} /Descent ${f.descent} /CapHeight ${f.capHeight} /StemV ${f.stemV} /FontFile2 ${fileId} 0 R >>`,
      );
      define(
        fontId,
        `<< /Type /Font /Subtype /TrueType /BaseFont /${f.postScriptName} /FirstChar 32 /LastChar 255 /Widths [${f.widths.join(" ")}] /Encoding /WinAnsiEncoding /FontDescriptor ${descId} 0 R >>`,
      );
      fontIds.set(name, fontId);
    }
    const fontDict = `<< ${[...fontIds].map(([name, id]) => `/${name} ${id} 0 R`).join(" ")} >>`;

    const pageIds: number[] = [];
    for (const page of this.pages) {
      const pageId = alloc();
      const contentId = alloc();
      stream(contentId, "/Filter /FlateDecode", deflateSync(Buffer.from(page.ops.join("\n"), "latin1")));
      define(
        pageId,
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /Font ${fontDict} >> /Contents ${contentId} 0 R >>`,
      );
      pageIds.push(pageId);
    }
    define(pagesId, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`);
    define(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`);

    const pdfString = (s: string) => `<FEFF${Buffer.from(s, "utf16le").swap16().toString("hex")}>`;
    const d = new Date();
    const date = `D:${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}${String(d.getUTCHours()).padStart(2, "0")}${String(d.getUTCMinutes()).padStart(2, "0")}00Z`;
    define(
      infoId,
      `<< /Title ${pdfString(this.info.title)} /Producer ${pdfString("Context")} /Creator ${pdfString("Context")}${this.info.author ? ` /Author ${pdfString(this.info.author)}` : ""}${this.info.subject ? ` /Subject ${pdfString(this.info.subject)}` : ""} /CreationDate (${date}) >>`,
    );

    push("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");
    for (let id = 1; id < nextId; id++) {
      offsets[id] = length;
      push(`${id} 0 obj\n`);
      push(objects.get(id)!);
      push("\nendobj\n");
    }
    const xref = length;
    push(`xref\n0 ${nextId}\n0000000000 65535 f \n`);
    for (let id = 1; id < nextId; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
    push(`trailer\n<< /Size ${nextId} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Uint8Array(Buffer.concat(chunks));
  }
}
