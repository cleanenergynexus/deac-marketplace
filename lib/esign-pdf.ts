// E-signatures: reads uploaded PDFs and writes the signed copy (fields stamped onto the pages + a signing certificate).
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fieldText, type SignField, type SignValues } from "./esign";

export const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Opens an uploaded PDF. Returns its page count, or an error the team can act on. */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pageCount: number } | { error: string }> {
  if (Buffer.from(bytes.subarray(0, 1024)).toString("latin1").indexOf("%PDF") < 0) return { error: "That file isn't a PDF. Save the document as PDF first (Word: File → Save As → PDF)." };
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return { pageCount: doc.getPageCount() };
  } catch (e) {
    return { error: /encrypt/i.test(String(e)) ? "That PDF is password-protected. Remove the password and upload it again." : "That PDF couldn't be read. Try saving it again as PDF." };
  }
}

/** Standard PDF fonts only cover Windows-1252; anything else prints as "?". */
const winAnsi = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7e\xa0-\xff]/g, "?");

function fitText(font: PDFFont, text: string, maxW: number, maxSize: number) {
  let size = maxSize;
  while (size > 5 && font.widthOfTextAtSize(text, size) > maxW) size -= 0.5;
  return size;
}

export type CertificateInfo = {
  requestId: string;
  title: string;
  sourceName: string;
  sourceHash: string;
  signers: { name: string; email: string; company?: string | null; kind: string; role?: string | null; signedAt: Date }[];
  sentBy?: string | null;
  consent: string;
  events: { at: Date; action: string; detail?: string | null; ip?: string | null; userAgent?: string | null }[];
};

/** What one signer entered, and when they signed (slot 0 = the recipient). */
export type PartyValues = { slot: number; values: SignValues; signedAt: Date };

/**
 * Stamps what every signer entered onto the original pages (each field shows its own signer's answers) and appends
 * the certificate. Returns the signed PDF.
 */
export async function buildSignedPdf(original: Uint8Array, fields: SignField[], parties: PartyValues[], completedAt: Date, cert: CertificateInfo): Promise<Uint8Array> {
  const signedAt = completedAt;
  const bySlot = new Map(parties.map((p) => [p.slot, p]));
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pages = doc.getPages();
  const images = new Map<string, Awaited<ReturnType<typeof doc.embedPng>>>();
  const png = async (dataUrl?: string) => {
    if (!dataUrl) return null;
    if (!images.has(dataUrl)) images.set(dataUrl, await doc.embedPng(Buffer.from(dataUrl.split(",")[1] ?? "", "base64")));
    return images.get(dataUrl)!;
  };

  for (const f of fields) {
    const page = pages[f.page];
    const party = bySlot.get(f.signer ?? 0);
    if (!page || !party) continue;
    const values = party.values;
    const box = pageBox(page);
    // Field fractions are measured from the top-left of the visible page; PDF points start bottom-left.
    const x = box.x + f.x * box.width;
    const w = f.w * box.width;
    const h = f.h * box.height;
    const y = box.y + box.height - (f.y + f.h) * box.height;
    if (f.type === "SIGNATURE" || f.type === "INITIALS") {
      const img = await png(f.type === "SIGNATURE" ? values.signature : values.initials);
      if (!img) continue;
      const scale = Math.min(w / img.width, h / img.height);
      page.drawImage(img, { x, y: y + (h - img.height * scale) / 2, width: img.width * scale, height: img.height * scale });
      continue;
    }
    const text = winAnsi(fieldText(f, values, party.signedAt));
    if (!text) continue;
    if (f.type === "CHECKBOX") {
      const size = Math.min(h, w) * 0.9;
      page.drawText("X", { x: x + (w - bold.widthOfTextAtSize("X", size)) / 2, y: y + (h - size * 0.72) / 2, size, font: bold, color: rgb(0.05, 0.1, 0.35) });
      continue;
    }
    const size = fitText(font, text, w, Math.min(11, h * 0.8));
    page.drawText(text, { x, y: y + Math.max(1, (h - size * 0.72) / 2), size, font, color: rgb(0.05, 0.1, 0.35) });
  }

  addCertificate(doc, font, bold, signedAt, cert);
  doc.setTitle(cert.title);
  doc.setSubject(`Signed by ${cert.signers.map((x) => x.name).join(", ")}, completed ${signedAt.toISOString()}`);
  doc.setProducer("DEAC Marketplace e-signature");
  doc.setModificationDate(signedAt);
  return doc.save();
}

/** The visible part of a page (crop box), which is what the browser viewer shows. */
function pageBox(page: PDFPage) {
  const c = page.getCropBox();
  return c.width > 0 && c.height > 0 ? c : { x: 0, y: 0, ...page.getSize() };
}

const utc = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);

function addCertificate(doc: PDFDocument, font: PDFFont, bold: PDFFont, signedAt: Date, cert: CertificateInfo) {
  let page = doc.addPage([612, 792]);
  const left = 54, right = 558;
  let y = 738;
  const ink = rgb(0.12, 0.16, 0.22), muted = rgb(0.4, 0.45, 0.5);
  const newPageIfNeeded = (need: number) => { if (y - need < 54) { page = doc.addPage([612, 792]); y = 738; } };
  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const lines: string[] = [];
    for (const para of winAnsi(text).split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (f.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = word; } else line = next;
      }
      lines.push(line);
    }
    return lines;
  };
  const write = (text: string, opts: { f?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; x?: number; gap?: number } = {}) => {
    const f = opts.f ?? font, size = opts.size ?? 9.5, x = opts.x ?? left;
    for (const line of wrap(text, f, size, right - x)) {
      newPageIfNeeded(size + 3);
      page.drawText(line, { x, y, size, font: f, color: opts.color ?? ink });
      y -= size + 3;
    }
    y -= opts.gap ?? 0;
  };
  const row = (label: string, value: string) => {
    newPageIfNeeded(13);
    page.drawText(winAnsi(label), { x: left, y, size: 9, font: bold, color: muted });
    const lines = wrap(value || "-", font, 9.5, right - left - 130);
    lines.forEach((l, i) => page.drawText(l, { x: left + 130, y: y - i * 12.5, size: 9.5, font, color: ink }));
    y -= Math.max(1, lines.length) * 12.5 + 2;
  };

  write("Signing certificate", { f: bold, size: 18, gap: 2 });
  write("DEAC Marketplace electronic signature record", { color: muted, gap: 14 });
  page.drawLine({ start: { x: left, y: y + 6 }, end: { x: right, y: y + 6 }, thickness: 0.6, color: rgb(0.8, 0.83, 0.87) });
  y -= 8;
  row("Document", cert.title);
  row("Original file", cert.sourceName);
  row("Original SHA-256", cert.sourceHash);
  row("Envelope ID", cert.requestId);
  if (cert.sentBy) row("Sent by", cert.sentBy);
  row(cert.signers.length > 1 ? "Completed (UTC)" : "Signed (UTC)", utc(signedAt));
  y -= 6;
  write(cert.signers.length > 1 ? "Signers" : "Signer", { f: bold, size: 11, gap: 4 });
  cert.signers.forEach((x, i) => {
    row(cert.signers.length > 1 ? `${i + 1}. ${x.role || "Signer"}` : "Name", `${x.name} <${x.email}>`);
    if (x.company) row("Company", x.company);
    row("Signer type", x.kind);
    row("Signed (UTC)", utc(x.signedAt));
    y -= 4;
  });
  y -= 4;
  write("Consent", { f: bold, size: 11, gap: 2 });
  write(`${cert.signers.length > 1 ? "Each signer" : "The signer"} clicked "I Agree" after confirming: ${cert.consent}`, { gap: 12 });
  write("Audit trail", { f: bold, size: 11, gap: 4 });
  for (const e of cert.events) {
    write(`${utc(e.at)} UTC  ${e.action}${e.detail ? ` - ${e.detail}` : ""}`, { size: 9 });
    const meta = [e.ip && `IP ${e.ip}`, e.userAgent && e.userAgent.slice(0, 160)].filter(Boolean).join(" | ");
    if (meta) write(meta, { size: 8, color: muted, x: left + 12 });
    y -= 3;
  }
  y -= 8;
  write("The SHA-256 fingerprint of this signed file is recorded on the request in the DEAC Marketplace, so any later change to the file can be detected.", { size: 8, color: muted });
}
