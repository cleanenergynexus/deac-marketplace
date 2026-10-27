"use server";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { extractListing, importerEnabled, type SourceDoc } from "@/lib/extract";
import { fetchWebPage, WebPageError } from "@/lib/webpage";
import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES, toImportResult, type ImportResult } from "@/lib/importer";

export type ExtractState = { error?: string; result?: ImportResult; sourceName?: string } | undefined;

const TEXT_EXT: Record<string, string> = { txt: "text/plain", md: "text/markdown", csv: "text/csv", html: "text/html", htm: "text/html", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** Step 1 of the import wizard: read the web page, uploaded document and/or pasted text with Claude. */
export async function extractProject(_: ExtractState, f: FormData): Promise<ExtractState> {
  await requireAdmin();
  if (!importerEnabled()) return { error: "The importer isn't set up yet: add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables, then redeploy." };

  const docs: SourceDoc[] = [];
  const names: string[] = [];
  const url = String(f.get("url") ?? "").trim();
  if (url) {
    try {
      const page = await fetchWebPage(url);
      docs.push(page);
      names.push(page.name);
    } catch (e) {
      if (e instanceof WebPageError) return { error: e.message };
      console.error("Web page fetch failed", e);
      return { error: "Couldn't load that web page. Paste the page text instead." };
    }
  }
  const file = f.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) return { error: "That file is over 4.4 MB. Compress the PDF (or upload just the key pages), or paste the text below." };
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const mediaType = ACCEPTED_TYPES[file.type] ? file.type : TEXT_EXT[ext];
    const kind = mediaType ? ACCEPTED_TYPES[mediaType] : undefined;
    if (!kind) return { error: "Upload a PDF, an image (PNG, JPG, WebP) or a text file. For Word or PowerPoint, save as PDF first." };
    const buf = Buffer.from(await file.arrayBuffer());
    if (kind === "pdf") docs.push({ kind, base64: buf.toString("base64"), name: file.name });
    else if (kind === "image") docs.push({ kind, base64: buf.toString("base64"), mediaType: mediaType as "image/png", name: file.name });
    else docs.push({ kind, text: buf.toString("utf8"), name: file.name });
    names.push(file.name);
  }
  const pasted = String(f.get("text") ?? "").trim();
  if (pasted) { docs.push({ kind: "text", text: pasted, name: "Pasted text" }); names.push("pasted text"); }
  if (!docs.length) return { error: "Paste a web page link, choose a file, or paste the deal text first." };

  try {
    const raw = await extractListing(docs);
    const developers = await db.developer.findMany({ select: { id: true, company: true } });
    return { result: toImportResult(raw, developers), sourceName: names.join(" + ") };
  } catch (e) {
    console.error("Project import failed", e);
    if (e instanceof Anthropic.AuthenticationError) return { error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel." };
    if (e instanceof Anthropic.RateLimitError) return { error: "Claude is busy right now (rate limit). Try again in a minute." };
    if (e instanceof Anthropic.BadRequestError) return { error: `Claude couldn't read that document: ${e.message}` };
    if (e instanceof Anthropic.APIError) return { error: `Claude API error (${e.status}). Try again.` };
    return { error: e instanceof Error ? e.message : "Something went wrong reading the document." };
  }
}
