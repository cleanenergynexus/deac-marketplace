// Reads the text out of Word, Excel and PowerPoint files (.docx / .xlsx / .xlsm / .pptx) so the
// Document Wizard can pass them to Claude, which only takes PDFs, images and text directly.
// These formats are zip archives of XML; this is a minimal zip reader (no zip64, no encryption).
import { inflateRawSync } from "node:zlib";

/** Reads the named entries of a zip archive. Missing entries are left out. */
export function unzip(buf: Buffer, want: (name: string) => boolean): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name) || local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (method === 0) out.set(name, Buffer.from(raw));
    else if (method === 8) out.set(name, inflateRawSync(raw));
  }
  return out;
}

export function decodeXml(s: string) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

const tidy = (s: string) => s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/** Word: paragraphs and table cells as lines of text. */
export function docxText(buf: Buffer) {
  const xml = unzip(buf, (n) => n === "word/document.xml").get("word/document.xml")?.toString("utf8") ?? "";
  return tidy(decodeXml(xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br[^>]*\/>/g, "\n")
    .replace(/<\/w:tc>/g, " | ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")));
}

/** PowerPoint: the text of each slide, in slide order. */
export function pptxText(buf: Buffer) {
  const files = unzip(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const num = (n: string) => Number(n.match(/(\d+)\.xml$/)![1]);
  return [...files.keys()].sort((a, b) => num(a) - num(b)).map((name) => {
    const xml = files.get(name)!.toString("utf8");
    const text = decodeXml(xml.replace(/<\/a:p>/g, "\n").replace(/<a:br\/>/g, "\n").replace(/<[^>]+>/g, ""));
    return `--- Slide ${num(name)} ---\n${tidy(text)}`;
  }).join("\n\n");
}

const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

/**
 * Excel: each sheet as tab-separated rows with their row numbers, using the values Excel last
 * calculated (formulas are not re-run). Long sheets are cut at `maxRows`.
 */
export function xlsxText(buf: Buffer, maxRows = 1500) {
  const files = unzip(buf, (n) => n === "xl/workbook.xml" || n === "xl/_rels/workbook.xml.rels" || n === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const text = (n: string) => files.get(n)?.toString("utf8") ?? "";
  const shared = [...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    decodeXml([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  const rels = new Map([...text("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
    m[0].match(/Id="([^"]+)"/)?.[1] ?? "", (m[0].match(/Target="([^"]+)"/)?.[1] ?? "").replace(/^\/?(xl\/)?/, "xl/"),
  ]));
  const sheets = [...text("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: decodeXml(m[0].match(/name="([^"]*)"/)?.[1] ?? "Sheet"),
    hidden: /state="(hidden|veryHidden)"/.test(m[0]),
    path: rels.get(m[0].match(/r:id="([^"]+)"/)?.[1] ?? "") ?? "",
  }));
  const out: string[] = [];
  for (const s of sheets) {
    const xml = text(s.path);
    if (!xml) continue;
    const rows: string[] = [];
    let total = 0;
    for (const r of xml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const vals: string[] = [];
      for (const c of (r[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const body = c[2] ?? "";
        const ref = attrs.match(/r="([A-Z]+)\d+"/)?.[1];
        const type = attrs.match(/t="(\w+)"/)?.[1];
        const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let val = "";
        if (type === "s" && v !== undefined) val = shared[Number(v)] ?? "";
        else if (type === "inlineStr") val = decodeXml([...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
        else if (type === "b" && v !== undefined) val = v === "1" ? "TRUE" : "FALSE";
        else if (v !== undefined) {
          const num = Number(v);
          val = type !== "str" && type !== "e" && Number.isFinite(num) ? String(Math.round(num * 1e6) / 1e6) : decodeXml(v);
        }
        val = val.replace(/\s+/g, " ").trim();
        if (!val) continue;
        const idx = ref ? colIndex(ref) : vals.length;
        while (vals.length < idx) vals.push("");
        vals[idx] = val;
      }
      if (!vals.length) continue;
      total++;
      if (rows.length < maxRows) rows.push(`${r[0].match(/r="(\d+)"/)?.[1] ?? total}\t${vals.join("\t")}`);
    }
    if (!rows.length) continue;
    out.push(`=== Sheet: ${s.name}${s.hidden ? " (hidden)" : ""} ===\n${rows.join("\n")}${total > rows.length ? `\n[… ${total - rows.length} more rows not shown]` : ""}`);
  }
  return out.join("\n\n");
}
