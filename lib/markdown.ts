// Small Markdown reader for Document Wizard drafts. It understands the subset the wizard asks Claude
// to write (headings, paragraphs, lists, tables, quotes, rules, bold/italic/links), and feeds both the
// on-screen preview and the PDF / PowerPoint export. Pure functions so it can be unit tested.

export type Span = { text: string; bold?: boolean; italic?: boolean; href?: string };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4; spans: Span[] }
  | { type: "paragraph"; spans: Span[] }
  | { type: "list"; ordered: boolean; items: Span[][] }
  | { type: "table"; header: Span[][]; rows: Span[][][] }
  | { type: "quote"; spans: Span[] }
  | { type: "rule" };

/** Splits **bold**, *italic*, `code` and [links](url) into styled runs. */
export function parseInline(text: string): Span[] {
  const out: Span[] = [];
  const push = (s: Span) => {
    if (!s.text) return;
    const last = out[out.length - 1];
    if (last && !!last.bold === !!s.bold && !!last.italic === !!s.italic && last.href === s.href) last.text += s.text;
    else out.push(s);
  };
  const walk = (src: string, style: { bold?: boolean; italic?: boolean }) => {
    const re = /(\*\*|__)(.+?)\1|(\*|_)(?!\s)(.+?)\3(?![\w*])|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let at = 0;
    for (let m; (m = re.exec(src)); ) {
      if (m.index > at) push({ text: src.slice(at, m.index), ...style });
      if (m[2] !== undefined) walk(m[2], { ...style, bold: true });
      else if (m[4] !== undefined) walk(m[4], { ...style, italic: true });
      else if (m[5] !== undefined) push({ text: m[5], ...style });
      else push({ text: m[6], href: m[7], ...style });
      at = m.index + m[0].length;
    }
    if (at < src.length) push({ text: src.slice(at), ...style });
  };
  walk(text.replace(/<br\s*\/?>/gi, " "), {});
  return out.map((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== false)) as Span);
}

const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isTableSep = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const listItem = (line: string) => line.match(/^\s*(?:([-*+•])|(\d+)[.)])\s+(.*)$/);

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: "paragraph", spans: parseInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { flush(); continue; }
    const h = t.match(/^(#{1,6})\s+(.*?)\s*#*$/);
    if (h) { flush(); blocks.push({ type: "heading", level: Math.min(4, h[1].length) as 1 | 2 | 3 | 4, spans: parseInline(h[2]) }); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); blocks.push({ type: "rule" }); continue; }
    if (t.startsWith("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush();
      const header = cells(t).map(parseInline);
      const rows: Span[][][] = [];
      i += 2;
      for (; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(cells(lines[i]).map(parseInline));
      i--;
      blocks.push({ type: "table", header, rows });
      continue;
    }
    if (t.startsWith(">")) {
      flush();
      const q: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith(">"); i++) q.push(lines[i].trim().replace(/^>\s?/, ""));
      i--;
      blocks.push({ type: "quote", spans: parseInline(q.join(" ")) });
      continue;
    }
    const li = listItem(line);
    if (li) {
      flush();
      const ordered = !!li[2];
      const items: string[] = [];
      for (; i < lines.length; i++) {
        const m = listItem(lines[i]);
        if (m && !!m[2] === ordered) items.push(m[3]);
        else if (lines[i].trim() && !m && /^\s{2,}/.test(lines[i]) && items.length) items[items.length - 1] += " " + lines[i].trim();
        else break;
      }
      i--;
      blocks.push({ type: "list", ordered, items: items.map(parseInline) });
      continue;
    }
    para.push(t);
  }
  flush();
  return blocks;
}

export const spansText = (spans: Span[]) => spans.map((s) => s.text).join("");

/** The draft's title: its first "# " heading. */
export function markdownTitle(md: string) {
  const h = parseMarkdown(md).find((b) => b.type === "heading" && b.level === 1);
  return h && h.type === "heading" ? spansText(h.spans).trim() : "";
}

export type Slide = { title: string; blocks: Block[] };

/**
 * Pitch deck drafts are one "## " heading per slide. Whatever sits under the "# " title before the
 * first "## " becomes the cover slide's subtitle.
 */
export function splitSlides(md: string): { title: string; cover: Block[]; slides: Slide[] } {
  const blocks = parseMarkdown(md);
  let title = "";
  const cover: Block[] = [];
  const slides: Slide[] = [];
  for (const b of blocks) {
    if (b.type === "heading" && b.level === 1 && !title && !slides.length) { title = spansText(b.spans); continue; }
    if (b.type === "heading" && b.level <= 2) { slides.push({ title: spansText(b.spans), blocks: [] }); continue; }
    if (b.type === "rule") continue;
    if (slides.length) slides[slides.length - 1].blocks.push(b);
    else cover.push(b);
  }
  return { title, cover, slides };
}
