// Turns a Document Wizard draft (Markdown) into the files saved in the data room:
// a branded PDF for teasers and reports, and 16:9 slides (PDF + PowerPoint) for pitch decks.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { parseMarkdown, splitSlides, spansText, type Block, type Span } from "@/lib/markdown";
import { logo, logoWhite, type BrandImage } from "@/lib/brand-assets";

// DEAC logo colours.
const NAVY = rgb(10 / 255, 28 / 255, 66 / 255);
const BLUE = rgb(31 / 255, 107 / 255, 255 / 255);
const INK = rgb(0.12, 0.14, 0.18);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const TINT = rgb(0.93, 0.96, 1);
const WHITE = rgb(1, 1, 1);

// The PDF standard fonts only cover Windows-1252. Swap common symbols, drop anything else.
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const SWAPS: Record<string, string> = { "\u2009": " ", "\u202f": " ", "\u200b": "", "\t": " ", "≥": ">=", "≤": "<=", "→": "->", "←": "<-", "↑": "up", "↓": "down", "≈": "~", "≠": "!=", "✓": "v", "✔": "v", "✗": "x", "✘": "x", "−": "-", "‑": "-", "‐": "-", "★": "*", "▪": "•", "◦": "•", "●": "•", "■": "•", "ⁿ": "n", "₂": "2", "₃": "3", "⁄": "/" };
export function pdfSafe(s: string) {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.includes(ch)) out += ch;
    else if (SWAPS[ch] !== undefined) out += SWAPS[ch];
    else {
      const plain = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
      out += [...plain].every((p) => p.codePointAt(0)! < 0x7f) ? plain : "";
    }
  }
  return out;
}

type Fonts = { regular: PDFFont; bold: PDFFont; italic: PDFFont; boldItalic: PDFFont };
type Run = { text: string; font: PDFFont; color: RGB };
type Line = { runs: Run[]; width: number };

async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  const [regular, bold, italic, boldItalic] = await Promise.all([
    doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold),
    doc.embedFont(StandardFonts.HelveticaOblique), doc.embedFont(StandardFonts.HelveticaBoldOblique),
  ]);
  return { regular, bold, italic, boldItalic };
}

const fontFor = (f: Fonts, s: Span, forceBold = false) => ((s.bold || forceBold) ? (s.italic ? f.boldItalic : f.bold) : s.italic ? f.italic : f.regular);

/** Word-wraps styled spans to a width. */
function wrap(spans: Span[], fonts: Fonts, size: number, width: number, color: RGB, forceBold = false): Line[] {
  const lines: Line[] = [];
  let cur: Run[] = [];
  let w = 0;
  const push = () => { lines.push({ runs: cur, width: w }); cur = []; w = 0; };
  for (const s of spans) {
    const font = fontFor(fonts, s, forceBold);
    const c = s.href ? BLUE : color;
    for (const token of pdfSafe(s.text).split(/(\s+)/)) {
      if (!token) continue;
      const space = /^\s+$/.test(token);
      if (space) { if (cur.length) { cur.push({ text: " ", font, color: c }); w += font.widthOfTextAtSize(" ", size); } continue; }
      let tw = font.widthOfTextAtSize(token, size);
      if (w + tw > width && cur.length) {
        while (cur.length && cur[cur.length - 1].text === " ") { w -= cur[cur.length - 1].font.widthOfTextAtSize(" ", size); cur.pop(); }
        push();
      }
      let piece = token;
      while (tw > width && piece.length > 1) { // a single word wider than the line: break it
        let n = piece.length - 1;
        while (n > 1 && font.widthOfTextAtSize(piece.slice(0, n), size) > width) n--;
        cur.push({ text: piece.slice(0, n), font, color: c });
        w += font.widthOfTextAtSize(piece.slice(0, n), size);
        push();
        piece = piece.slice(n);
        tw = font.widthOfTextAtSize(piece, size);
      }
      cur.push({ text: piece, font, color: c });
      w += tw;
    }
  }
  while (cur.length && cur[cur.length - 1].text === " ") cur.pop();
  if (cur.length) push();
  return lines.length ? lines : [{ runs: [], width: 0 }];
}

function drawLine(page: PDFPage, line: Line, x: number, baseline: number, size: number) {
  let cx = x;
  for (const r of line.runs) {
    if (r.text !== " ") page.drawText(r.text, { x: cx, y: baseline, size, font: r.font, color: r.color });
    cx += r.font.widthOfTextAtSize(r.text, size);
  }
}

/**
 * Lays out blocks top-down. `newPage` is called when a block doesn't fit; when it is null (slides)
 * layout just continues past the bottom, and the caller measures with draw=false first.
 */
class Flow {
  y: number;
  constructor(
    public page: PDFPage, public fonts: Fonts, public x: number, public width: number, top: number, public bottom: number,
    public scale: number, public draw: boolean, public newPage: (() => { page: PDFPage; top: number }) | null,
  ) { this.y = top; }

  need(h: number) {
    if (this.y - h >= this.bottom || !this.newPage) return;
    const n = this.newPage();
    this.page = n.page;
    this.y = n.top;
  }

  text(spans: Span[], o: { size: number; lead?: number; color?: RGB; bold?: boolean; indent?: number; gapAfter?: number; marker?: string }) {
    const size = o.size * this.scale;
    const lead = (o.lead ?? o.size * 1.42) * this.scale;
    const indent = (o.indent ?? 0) * this.scale;
    const lines = wrap(spans, this.fonts, size, this.width - indent, o.color ?? INK, o.bold);
    lines.forEach((l, i) => {
      this.need(lead);
      if (this.draw) {
        if (i === 0 && o.marker) this.page.drawText(pdfSafe(o.marker), { x: this.x + indent - this.fonts.regular.widthOfTextAtSize(o.marker, size) - 5 * this.scale, y: this.y - size, size, font: o.marker === "•" ? this.fonts.bold : this.fonts.regular, color: BLUE });
        drawLine(this.page, l, this.x + indent, this.y - size, size);
      }
      this.y -= lead;
    });
    this.y -= (o.gapAfter ?? 0) * this.scale;
  }

  table(header: Span[][], rows: Span[][][], base: number) {
    const size = base * this.scale;
    const pad = 5 * this.scale;
    const lead = size * 1.35;
    const cols = Math.max(header.length, ...rows.map((r) => r.length));
    // Column widths follow content length, within limits.
    const len = Array.from({ length: cols }, (_, c) => Math.min(60, Math.max(8, ...[header, ...rows].map((r) => spansText(r[c] ?? []).length))));
    const total = len.reduce((a, b) => a + b, 0);
    const widths = len.map((l) => (l / total) * this.width);
    const layout = (row: Span[][], bold: boolean) => {
      const cells = widths.map((w, c) => wrap(row[c] ?? [], this.fonts, size, w - pad * 2, bold ? NAVY : INK, bold));
      return { cells, h: Math.max(...cells.map((l) => l.length)) * lead + pad * 2 };
    };
    const drawRow = (row: Span[][], bold: boolean) => {
      const { cells, h } = layout(row, bold);
      this.need(h);
      if (this.draw) {
        if (bold) this.page.drawRectangle({ x: this.x, y: this.y - h, width: this.width, height: h, color: TINT });
        this.page.drawLine({ start: { x: this.x, y: this.y - h }, end: { x: this.x + this.width, y: this.y - h }, thickness: 0.6, color: LINE });
        let cx = this.x;
        cells.forEach((lines, c) => {
          lines.forEach((l, i) => drawLine(this.page, l, cx + pad, this.y - pad - size - i * lead, size));
          cx += widths[c];
        });
      }
      this.y -= h;
    };
    if (header.some((h) => spansText(h).trim())) {
      const startPage = this.page;
      drawRow(header, true);
      for (const r of rows) {
        const before = this.page;
        const { h } = layout(r, false);
        this.need(h);
        if (this.page !== before && this.page !== startPage) drawRow(header, true); // repeat header after a page break
        drawRow(r, false);
      }
    } else rows.forEach((r) => drawRow(r, false));
    this.y -= 10 * this.scale;
  }

  blocks(blocks: Block[], style: "doc" | "slide") {
    const body = style === "doc" ? 10 : 15;
    for (const b of blocks) {
      if (b.type === "heading") {
        if (style === "doc") {
          const size = b.level === 1 ? 20 : b.level === 2 ? 13.5 : 11;
          this.y -= (b.level === 1 ? 2 : b.level === 2 ? 12 : 6) * this.scale;
          this.need(size * 3 * this.scale);
          this.text(b.spans, { size, color: NAVY, bold: true, lead: size * 1.3, gapAfter: b.level === 2 ? 2 : 3 });
          if (b.level <= 2) {
            if (this.draw) this.page.drawLine({ start: { x: this.x, y: this.y + 2 }, end: { x: this.x + this.width, y: this.y + 2 }, thickness: b.level === 1 ? 1.5 : 0.6, color: b.level === 1 ? BLUE : LINE });
            this.y -= 8 * this.scale;
          }
        } else this.text(b.spans, { size: body + 1, bold: true, color: NAVY, gapAfter: 4 });
      } else if (b.type === "paragraph") {
        this.text(b.spans, { size: body, gapAfter: style === "doc" ? 7 : 10 });
      } else if (b.type === "quote") {
        const top = this.y;
        const startPage = this.page;
        this.text(b.spans, { size: body, indent: 12, color: NAVY, gapAfter: 0 });
        if (this.draw && this.page === startPage) this.page.drawRectangle({ x: this.x, y: this.y + 2, width: 3 * this.scale, height: top - this.y - 2, color: BLUE });
        this.y -= 8 * this.scale;
      } else if (b.type === "list") {
        b.items.forEach((item, i) => this.text(item, { size: body, indent: 16, marker: b.ordered ? `${i + 1}.` : "•", gapAfter: style === "doc" ? 2.5 : 6 }));
        this.y -= 6 * this.scale;
      } else if (b.type === "table") {
        this.table(b.header, b.rows, style === "doc" ? 9 : 15);
      } else if (b.type === "rule") {
        this.need(12);
        if (this.draw) this.page.drawLine({ start: { x: this.x, y: this.y - 4 }, end: { x: this.x + this.width, y: this.y - 4 }, thickness: 0.6, color: LINE });
        this.y -= 14 * this.scale;
      }
    }
  }
}

/** Embeds a logo PNG once per PDF; draw it with `drawLogo`. */
const embedLogo = (doc: PDFDocument, img: BrandImage) => doc.embedPng(Buffer.from(img.base64, "base64"));
type Embedded = Awaited<ReturnType<typeof embedLogo>>;
/** Draws a logo `h` points tall with its bottom-left corner at (x, y); returns its width. */
function drawLogo(page: PDFPage, img: Embedded, x: number, y: number, h: number) {
  const w = (img.width / img.height) * h;
  page.drawImage(img, { x, y, width: w, height: h });
  return w;
}

export type ExportMeta = { kindLabel: string; code: string; confidential?: boolean; date?: Date };

const dateLabel = (d = new Date()) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

/** Teasers, reports and custom documents: US Letter, branded header and page-numbered footer. */
export async function documentPdf(markdown: string, meta: ExportMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);
  const W = 612, H = 792, M = 54;
  const pages: PDFPage[] = [];
  const mark = await embedLogo(doc, logo);
  const add = () => {
    const page = doc.addPage([W, H]);
    pages.push(page);
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: NAVY });
    const lw = drawLogo(page, mark, M, H - 37, 24);
    page.drawText(pdfSafe(meta.kindLabel.toUpperCase()), { x: M + lw + 12, y: H - 30, size: 8, font: fonts.regular, color: MUTED });
    const right = pdfSafe(`${meta.code} · ${dateLabel(meta.date)}`);
    page.drawText(right, { x: W - M - fonts.regular.widthOfTextAtSize(right, 8), y: H - 30, size: 8, font: fonts.regular, color: MUTED });
    page.drawLine({ start: { x: M, y: H - 42 }, end: { x: W - M, y: H - 42 }, thickness: 0.6, color: LINE });
    return { page, top: H - 64 };
  };
  const first = add();
  const flow = new Flow(first.page, fonts, M, W - M * 2, first.top, M + 24, 1, true, add);
  flow.blocks(parseMarkdown(markdown), "doc");
  pages.forEach((page, i) => {
    const left = pdfSafe(meta.confidential === false ? "deacna.com" : "Confidential · Prepared by DEAC · deacna.com");
    page.drawText(left, { x: M, y: 30, size: 7.5, font: fonts.regular, color: MUTED });
    const n = `Page ${i + 1} of ${pages.length}`;
    page.drawText(n, { x: W - M - fonts.regular.widthOfTextAtSize(n, 7.5), y: 30, size: 7.5, font: fonts.regular, color: MUTED });
  });
  return doc.save();
}

// ---------- pitch decks ----------

const SW = 960, SH = 540, SM = 48;

/** Pitch decks: 16:9 slides, one per "## " heading, shrinking text until each slide fits. */
export async function deckPdf(markdown: string, meta: ExportMeta): Promise<Uint8Array> {
  const { title, cover, slides } = splitSlides(markdown);
  const doc = await PDFDocument.create();
  const fonts = await loadFonts(doc);
  const total = slides.length + 1;
  const [mark, markWhite] = await Promise.all([embedLogo(doc, logo), embedLogo(doc, logoWhite)]);

  const c = doc.addPage([SW, SH]);
  c.drawRectangle({ x: 0, y: 0, width: SW, height: SH, color: NAVY });
  c.drawRectangle({ x: SM, y: SH / 2 + 8, width: 64, height: 4, color: BLUE });
  drawLogo(c, markWhite, SM, SH - SM - 44, 52);
  const coverFlow = new Flow(c, fonts, SM, SW - SM * 2, SH / 2 - 8, SM, 1, true, null);
  coverFlow.text([{ text: title || meta.kindLabel }], { size: 34, bold: true, color: WHITE, lead: 40, gapAfter: 10 });
  const sub = cover.flatMap((b) => (b.type === "paragraph" || b.type === "quote" ? [spansText(b.spans)] : []))[0];
  if (sub) coverFlow.text([{ text: sub }], { size: 15, color: rgb(0.8, 0.86, 0.95) });
  c.drawText(pdfSafe(`${meta.code} · ${dateLabel(meta.date)} · Confidential`), { x: SM, y: SM - 6, size: 10, font: fonts.regular, color: rgb(0.7, 0.76, 0.86) });

  slides.forEach((s, i) => {
    const page = doc.addPage([SW, SH]);
    page.drawRectangle({ x: 0, y: SH - 8, width: SW, height: 8, color: NAVY });
    const head = new Flow(page, fonts, SM, SW - SM * 2, SH - 36, 0, 1, true, null);
    head.text([{ text: s.title }], { size: 26, bold: true, color: NAVY, lead: 30 });
    page.drawRectangle({ x: SM, y: head.y - 8, width: 48, height: 3, color: BLUE });
    const top = head.y - 22;
    const bottom = 50;
    let scale = 1;
    for (const tryScale of [1, 0.9, 0.8, 0.7, 0.6, 0.52, 0.45]) {
      scale = tryScale;
      const probe = new Flow(page, fonts, SM, SW - SM * 2, top, bottom, scale, false, null);
      probe.blocks(s.blocks, "slide");
      if (probe.y >= bottom) break;
    }
    new Flow(page, fonts, SM, SW - SM * 2, top, bottom, scale, true, null).blocks(s.blocks, "slide");
    const lw = drawLogo(page, mark, SM, 16, 18);
    page.drawText(pdfSafe(`${meta.code} · Confidential`), { x: SM + lw + 10, y: 22, size: 8, font: fonts.regular, color: MUTED });
    const n = `${i + 2} / ${total}`;
    page.drawText(n, { x: SW - SM - fonts.regular.widthOfTextAtSize(n, 8), y: 22, size: 8, font: fonts.regular, color: MUTED });
  });
  return doc.save();
}

const hex = { navy: "0A1C42", blue: "1F6BFF", ink: "1F232E", muted: "6B7280", tint: "EEF6FF", line: "D9DEE5" };

/** One PowerPoint paragraph: paragraph options (bullet, spacing) go on its first run, the line break on its last. */
const pptPara = (spans: Span[], para: PptxGenJS.TextPropsOptions = {}, run: PptxGenJS.TextPropsOptions = {}): PptxGenJS.TextProps[] => {
  const runs = (spans.length ? spans : [{ text: " " }]).map((s, i, all) => ({
    text: s.text,
    options: { ...run, ...(i === 0 && para), bold: s.bold || run.bold, italic: s.italic || run.italic, ...(s.href && { hyperlink: { url: s.href }, color: hex.blue }), ...(i === all.length - 1 && { breakLine: true }) },
  }));
  return runs;
};

/** The same deck as an editable PowerPoint (16:9). */
export async function deckPptx(markdown: string, meta: ExportMeta): Promise<Buffer> {
  const { title, cover, slides } = splitSlides(markdown);
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 in
  pptx.company = "DEAC";
  pptx.title = title || meta.kindLabel;
  const font = "Arial";

  const c = pptx.addSlide();
  c.background = { color: hex.navy };
  const logoH = (img: BrandImage, h: number) => ({ data: `image/png;base64,${img.base64}`, h, w: (img.width / img.height) * h });
  c.addImage({ ...logoH(logoWhite, 0.75), x: 0.6, y: 0.5, altText: "DEAC" });
  c.addShape("rect", { x: 0.6, y: 3.05, w: 0.9, h: 0.06, fill: { color: hex.blue }, line: { color: hex.blue } });
  c.addText(title || meta.kindLabel, { x: 0.6, y: 3.2, w: 12, h: 1.4, fontFace: font, fontSize: 40, bold: true, color: "FFFFFF", valign: "top" });
  const sub = cover.flatMap((b) => (b.type === "paragraph" || b.type === "quote" ? [spansText(b.spans)] : []))[0];
  if (sub) c.addText(sub, { x: 0.6, y: 4.6, w: 12, h: 0.8, fontFace: font, fontSize: 18, color: "CCDBF2", valign: "top" });
  c.addText(`${meta.code} · ${dateLabel(meta.date)} · Confidential`, { x: 0.6, y: 6.7, w: 12, h: 0.4, fontFace: font, fontSize: 11, color: "B3C2DB" });

  slides.forEach((s, i) => {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    slide.addShape("rect", { x: 0, y: 0, w: 13.33, h: 0.12, fill: { color: hex.navy }, line: { color: hex.navy } });
    slide.addText(s.title, { x: 0.6, y: 0.35, w: 12.1, h: 0.8, fontFace: font, fontSize: 28, bold: true, color: hex.navy, valign: "middle" });
    slide.addShape("rect", { x: 0.6, y: 1.15, w: 0.8, h: 0.05, fill: { color: hex.blue }, line: { color: hex.blue } });
    const foot = logoH(logo, 0.26);
    slide.addImage({ ...foot, x: 0.6, y: 7.02, altText: "DEAC" });
    slide.addText(`${meta.code} · Confidential`, { x: 0.6 + foot.w + 0.12, y: 7.0, w: 7, h: 0.3, fontFace: font, fontSize: 9, color: hex.muted });
    slide.addText(`${i + 2} / ${slides.length + 1}`, { x: 11.2, y: 7.0, w: 1.5, h: 0.3, fontFace: font, fontSize: 9, color: hex.muted, align: "right" });

    const tables = s.blocks.filter((b): b is Extract<Block, { type: "table" }> => b.type === "table");
    const texts = s.blocks.filter((b) => b.type !== "table");
    const words = texts.reduce((n, b) => n + JSON.stringify(b).length, 0);
    const size = words > 1400 ? 13 : words > 900 ? 15 : words > 500 ? 17 : 19;
    let y = 1.45;
    if (texts.length) {
      const runs: PptxGenJS.TextProps[] = [];
      for (const b of texts) {
        if (b.type === "list") b.items.forEach((it) => runs.push(...pptPara(it, { bullet: b.ordered ? { type: "number" } : { code: "2022" }, paraSpaceAfter: 6 })));
        else if (b.type === "heading") runs.push(...pptPara(b.spans, { paraSpaceAfter: 4 }, { bold: true, color: hex.navy }));
        else if (b.type === "paragraph" || b.type === "quote") runs.push(...pptPara(b.spans, { paraSpaceAfter: 8 }, b.type === "quote" ? { color: hex.navy, italic: true } : {}));
      }
      if (runs.length) delete runs[runs.length - 1].options!.breakLine;
      const h = tables.length ? 2.2 : 5.3;
      slide.addText(runs, { x: 0.6, y, w: 12.1, h, fontFace: font, fontSize: size, color: hex.ink, valign: "top", fit: "shrink" });
      y += h + 0.15;
    }
    for (const t of tables) {
      const rows: PptxGenJS.TableRow[] = [
        ...(t.header.some((h) => spansText(h).trim()) ? [t.header.map((h) => ({ text: spansText(h), options: { bold: true, color: hex.navy, fill: { color: hex.tint } } }))] : []),
        ...t.rows.map((r) => r.map((cell) => ({ text: pptPara(cell).map((x) => ({ ...x, options: { ...x.options, breakLine: false } })) }))),
      ];
      const cols = Math.max(...rows.map((r) => r.length));
      const len = Array.from({ length: cols }, (_, ci) => Math.min(60, Math.max(8, ...[t.header, ...t.rows].map((r) => spansText(r[ci] ?? []).length))));
      const sum = len.reduce((a, b) => a + b, 0);
      slide.addTable(rows, { x: 0.6, y, w: 12.1, colW: len.map((l) => (l / sum) * 12.1), fontFace: font, fontSize: rows.length > 6 ? 13 : 16, color: hex.ink, border: { type: "solid", pt: 0.75, color: hex.line }, valign: "middle", autoPage: false });
      y += 0.45 * rows.length + 0.2;
    }
  });
  return fixParagraphs((await pptx.write({ outputType: "nodebuffer" })) as Buffer);
}

/**
 * pptxgenjs writes paragraph settings before every run of a paragraph, so a bullet line with a bold
 * lead-in gets a second "no bullet" setting PowerPoint rejects. Keep only each paragraph's first.
 */
async function fixParagraphs(buf: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
    const xml = await zip.file(name)!.async("string");
    zip.file(name, xml.replace(/(<\/a:r>|<a:br\/>)<a:pPr\b[^>]*?(?:\/>|>[\s\S]*?<\/a:pPr>)/g, "$1"));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
