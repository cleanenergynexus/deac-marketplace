import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { readStored } from "@/lib/storage";
import { filePathLabel } from "@/lib/dataroom";
import { docxText, pptxText, xlsxText } from "@/lib/office";
import { evaluate, parseInputs } from "@/lib/valuation";
import { getScoring } from "@/lib/scoring-db";
import {
  IMAGE_MEDIA, MAX_TEXT_CHARS, SYSTEM_PROMPT, briefFor, cleanDraft, planSources, projectFactsText, readKind,
  type ValuationFacts, type WizardKind, type WizardOptions,
} from "@/lib/wizard";

type SourceNote = { name: string; status: "read" | "skipped"; reason?: string };

/** Turns the chosen data room files into Claude content blocks, noting anything it had to skip. */
async function loadSources(projectId: string, fileIds: string[]) {
  const [files, folders] = await Promise.all([
    db.dataRoomFile.findMany({ where: { projectId, id: { in: fileIds } }, select: { id: true, name: true, size: true, folderId: true, storageKey: true } }),
    db.dataRoomFolder.findMany({ where: { projectId }, select: { id: true, parentId: true, name: true } }),
  ]);
  const ordered = fileIds.map((id) => files.find((f) => f.id === id)).filter((f): f is (typeof files)[number] => !!f);
  const plan = planSources(ordered);
  const notes: SourceNote[] = plan.skipped.map((s) => ({ name: s.name, status: "skipped", reason: s.reason }));
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];

  for (const c of plan.use) {
    const f = ordered.find((x) => x.id === c.id)!;
    const label = filePathLabel(folders, f);
    const kind = readKind(f.name).kind!;
    try {
      const buf = await readStored(f.storageKey);
      if (!buf) { notes.push({ name: label, status: "skipped", reason: "Missing from storage." }); continue; }
      if (kind === "pdf") {
        blocks.push({ type: "document", title: label, source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } });
      } else if (kind === "image") {
        const media = IMAGE_MEDIA[f.name.split(".").pop()!.toLowerCase()];
        blocks.push({ type: "text", text: `Image from the data room: ${label}` });
        blocks.push({ type: "image", source: { type: "base64", media_type: media, data: buf.toString("base64") } });
      } else {
        let text = kind === "docx" ? docxText(buf) : kind === "xlsx" ? xlsxText(buf) : kind === "pptx" ? pptxText(buf) : buf.toString("utf8");
        if (!text.trim()) { notes.push({ name: label, status: "skipped", reason: "No text found in it." }); continue; }
        let reason: string | undefined;
        if (text.length > MAX_TEXT_CHARS) { text = text.slice(0, MAX_TEXT_CHARS); reason = "Very long: only the first part was read."; }
        const prefix = kind === "xlsx" ? "Spreadsheet values (row number, then cells by column; values as last calculated in Excel):\n" : "";
        blocks.push({ type: "document", title: label, source: { type: "text", media_type: "text/plain", data: prefix + text } });
        notes.push({ name: label, status: "read", reason });
        continue;
      }
      notes.push({ name: label, status: "read" });
    } catch (e) {
      console.error("Wizard could not read", f.name, e);
      notes.push({ name: label, status: "skipped", reason: "Couldn't be opened (damaged or password-protected?)." });
    }
  }
  return { blocks, notes };
}

async function valuationFacts(valuationInputs: string | null): Promise<ValuationFacts> {
  const inputs = parseInputs(valuationInputs);
  if (!inputs) return null;
  const e = evaluate(inputs, await getScoring());
  return { score: e.score, recommendation: e.recommendation.label, perMw: e.adjustedValueMw, marketValue: e.total?.market ?? null, low: e.total?.good ?? null, high: e.total?.high ?? null, askingVsMarket: e.askingVsMarket };
}

/** Web pages Claude cited or opened, de-duplicated. */
function webSourcesOf(content: Anthropic.Beta.BetaContentBlock[]) {
  const seen = new Map<string, string>();
  for (const b of content) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r.type === "web_search_result") seen.set(r.url, r.title);
    if (b.type === "text") for (const c of b.citations ?? []) if (c.type === "web_search_result_location") seen.set(c.url, c.title ?? c.url);
  }
  return [...seen].map(([url, title]) => ({ url, title }));
}

/**
 * Writes the document with Claude and stores the draft. Runs after the page has responded, so it
 * records its own errors on the draft instead of throwing.
 */
export async function runWizard(docId: string) {
  const doc = await db.wizardDocument.findUnique({ where: { id: docId }, include: { project: { include: { developer: { select: { company: true, website: true } } } } } });
  if (!doc) return;
  const fail = (error: string) => db.wizardDocument.update({ where: { id: docId }, data: { status: "FAILED", error } });
  try {
    const options = JSON.parse(doc.options) as WizardOptions;
    const p = doc.project;
    const { blocks, notes } = await loadSources(p.id, JSON.parse(doc.sourceIds) as string[]);
    await db.wizardDocument.update({ where: { id: docId }, data: { sourceNotes: JSON.stringify(notes) } });
    if (!blocks.length && !options.webResearch && doc.kind === "CUSTOM" && !options.instructions.trim()) return fail("Pick at least one readable file, or turn on web research.");

    const facts = projectFactsText({ ...p, developer: p.developer }, await valuationFacts(p.valuationInputs));
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...blocks,
      { type: "text", text: `${facts}\n\n${blocks.length ? `The ${notes.filter((n) => n.status === "read").length} data room document(s) above are the project's files.` : "No data room documents were provided; work from the listing record" + (options.webResearch ? " and web research." : ".")}\n\n${briefFor(doc.kind as WizardKind, options)}` },
    ];
    const tools: Anthropic.Beta.BetaToolUnion[] = options.webResearch
      ? [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }, { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 }]
      : [];

    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content }];
    const all: Anthropic.Beta.BetaContentBlock[] = [];
    let final: Anthropic.Beta.BetaMessage | null = null;
    // Web research runs a server-side loop that can pause; send the turn back to let it continue.
    for (let round = 0; round < 4; round++) {
      final = await client.beta.messages.stream({
        model: "claude-opus-5-5",
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default", // if the model declines, the API retries on a fallback model in the same call
        system: SYSTEM_PROMPT,
        output_config: { effort: options.webResearch ? "medium" : "high" },
        ...(tools.length && { tools }),
        messages,
      }).finalMessage();
      all.push(...final.content);
      if (final.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: final.content });
    }
    if (!final) return fail("No answer from Claude.");
    if (final.stop_reason === "refusal") return fail("Claude declined to write this document. Try different files or instructions.");
    const text = all.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    if (!text.trim()) return fail(final.stop_reason === "pause_turn" ? "Web research took too long. Try again with fewer files or without web research." : "Claude returned an empty document. Try again.");
    const markdown = cleanDraft(text);
    const cut = final.stop_reason === "max_tokens" ? "\n\n> [The document was cut off because it got too long. Ask for a shorter version or fewer sections.]\n" : "";
    await db.wizardDocument.update({
      where: { id: docId },
      data: { status: "READY", error: null, markdown: markdown + cut, webSources: JSON.stringify(webSourcesOf(all)) },
    });
  } catch (e) {
    console.error("Document wizard failed", e);
    const msg = e instanceof Anthropic.AuthenticationError ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel."
      : e instanceof Anthropic.RateLimitError ? "Claude is busy right now (rate limit). Try again in a minute."
      : e instanceof Anthropic.BadRequestError ? `Claude couldn't process these files: ${e.message}. Try fewer or smaller files.`
      : e instanceof Anthropic.APIError ? `Claude API error (${e.status}). Try again.`
      : e instanceof Error ? e.message : "Something went wrong writing the document.";
    await fail(msg).catch(() => {});
  }
}
