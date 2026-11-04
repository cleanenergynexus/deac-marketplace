import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { projectFactsText } from "@/lib/wizard";
import { loadSources, valuationFacts, webSourcesOf } from "@/lib/wizard-run";
import { getScreeningTemplate } from "@/lib/screening-db";
import {
  RESEARCH_BRIEF, SCREENING_SCHEMA, SCREENING_SYSTEM, mergeAi, parseAnswers, questionList, questionsFor, resultToAi, screeningBrief,
  type ScreeningOptions, type ScreeningResult,
} from "@/lib/screening";

const MODEL = "claude-opus-5-5";

/** Notes, calls, emails and meetings the team logged about this project or its sponsor, newest first. */
async function crmNotes(projectId: string, developerId: string) {
  const acts = await db.activity.findMany({
    where: { kind: { in: ["NOTE", "CALL", "EMAIL", "MEETING"] }, OR: [{ projectId }, { developerId, projectId: null }] },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { kind: true, subject: true, body: true, createdAt: true },
  });
  return acts.map((a) => `- ${a.createdAt.toISOString().slice(0, 10)} ${a.kind.toLowerCase()}${a.subject ? ` "${a.subject}"` : ""}: ${a.body.replace(/\s+/g, " ").slice(0, 1500)}`).join("\n");
}

/** Step 1 (optional): Claude researches the sponsor, site and power on the web and writes notes with sources. */
async function research(client: Anthropic, context: string) {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: `${context}\n\n${RESEARCH_BRIEF}` }];
  const all: Anthropic.Beta.BetaContentBlock[] = [];
  let final: Anthropic.Beta.BetaMessage | null = null;
  // The server-side search loop can pause; send the turn back to let it continue.
  for (let round = 0; round < 4; round++) {
    final = await client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SCREENING_SYSTEM,
      output_config: { effort: "medium" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 10 }, { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 }],
      messages,
    }).finalMessage();
    all.push(...final.content);
    if (final.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: final.content });
  }
  const notes = all.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  return { notes: final?.stop_reason === "refusal" ? "" : notes, sources: webSourcesOf(all) };
}

/**
 * Claude pre-researches the project and answers every screening question it can, flagging gaps.
 * Runs after the page has responded, so it records its own errors instead of throwing.
 */
export async function runScreening(screeningId: string) {
  const s = await db.screening.findUnique({ where: { id: screeningId }, include: { project: { include: { developer: { select: { id: true, company: true, website: true } } } } } });
  if (!s) return;
  const fail = (error: string) => db.screening.update({ where: { id: screeningId }, data: { status: "FAILED", error } });
  try {
    const options = JSON.parse(s.options) as ScreeningOptions;
    const p = s.project;
    const cats = questionsFor(await getScreeningTemplate(), p.country);
    if (!cats.length) return fail("The screening template has no questions. Add some under Developer CRM → Screening template.");

    const { blocks, notes } = await loadSources(p.id, JSON.parse(s.sourceIds) as string[]);
    await db.screening.update({ where: { id: screeningId }, data: { sourceNotes: JSON.stringify(notes) } });

    const facts = projectFactsText({ ...p, developer: p.developer }, await valuationFacts(p.valuationInputs));
    const logged = await crmNotes(p.id, p.developerId);
    const teamNotes = [
      options.notes.trim() && `Notes from the DEAC team for this screening:\n${options.notes.trim()}`,
      logged && `Activity logged in the DEAC CRM about this project or sponsor (newest first):\n${logged}`,
    ].filter(Boolean).join("\n\n");

    const client = new Anthropic(); // reads ANTHROPIC_API_KEY
    let researchNotes = "";
    let webSources: { title: string; url: string }[] = [];
    if (options.webResearch) {
      const r = await research(client, `${facts}\n\n${teamNotes}\n\nThe screening will cover these questions:\n\n${questionList(cats)}`);
      researchNotes = r.notes;
      webSources = r.sources;
      await db.screening.update({ where: { id: screeningId }, data: { researchNotes, webSources: JSON.stringify(webSources) } });
    }

    const read = notes.filter((n) => n.status === "read").length;
    const content: Anthropic.Beta.BetaContentBlockParam[] = [
      ...blocks,
      {
        type: "text",
        text: [
          facts,
          blocks.length ? `The ${read} data room document(s) above were provided by the sponsor.` : "No data room documents were provided.",
          teamNotes,
          researchNotes && `Web research notes (each finding carries its source URL; treat them as leads, weaker than signed documents):\n\n${researchNotes}`,
          screeningBrief(cats),
        ].filter(Boolean).join("\n\n"),
      },
    ];

    const final = await client.beta.messages.stream({
      model: MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SCREENING_SYSTEM,
      output_config: { effort: "high", format: { type: "json_schema", schema: SCREENING_SCHEMA as unknown as Record<string, unknown> } },
      messages: [{ role: "user", content }],
    }).finalMessage();

    if (final.stop_reason === "refusal") return fail("Claude declined to screen this project. Try different files.");
    if (final.stop_reason === "max_tokens") return fail("The screening got too long. Try fewer files or fewer questions.");
    const text = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const result = JSON.parse(text) as ScreeningResult;

    // Re-read the team's answers now: they may have edited while Claude worked.
    const latest = await db.screening.findUnique({ where: { id: screeningId }, select: { answers: true } });
    const answers = mergeAi(parseAnswers(latest?.answers), resultToAi(cats, result));
    await db.screening.update({
      where: { id: screeningId },
      data: {
        status: "READY", error: null, ranAt: new Date(),
        answers: JSON.stringify(answers),
        summary: result.summary.trim(),
        redFlags: JSON.stringify(result.redFlags.map((f) => f.trim()).filter(Boolean)),
      },
    });
  } catch (e) {
    console.error("Screening failed", e);
    const msg = e instanceof Anthropic.AuthenticationError ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY in Vercel."
      : e instanceof Anthropic.RateLimitError ? "Claude is busy right now (rate limit). Try again in a minute."
      : e instanceof Anthropic.BadRequestError ? `Claude couldn't process these files: ${e.message}. Try fewer or smaller files.`
      : e instanceof Anthropic.APIError ? `Claude API error (${e.status}). Try again.`
      : e instanceof SyntaxError ? "Claude's answer couldn't be read. Try again."
      : e instanceof Error ? e.message : "Something went wrong during the screening.";
    await fail(msg).catch(() => {});
  }
}
