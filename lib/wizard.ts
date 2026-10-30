// Document Wizard: the document types it writes, what it can read from a data room, and the
// instructions Claude gets. Pure functions only, so they can be unit tested.
import { isUS, placeFull } from "./location";
import { dealTypeLabel } from "@/lib/constants";
import { usd } from "@/lib/format";

export const WIZARD_KINDS = ["TEASER", "REPORT", "DECK", "CUSTOM"] as const;
export type WizardKind = (typeof WIZARD_KINDS)[number];
export const isWizardKind = (v: unknown): v is WizardKind => WIZARD_KINDS.includes(v as WizardKind);

export const KIND_INFO: Record<WizardKind, { label: string; blurb: string; icon: string; folder: string; folderMatch: RegExp }> = {
  TEASER: { label: "Project Teaser", icon: "📣", blurb: "One to two pages for first contact with investors: key terms, highlights and next steps. Can hide the site location and sponsor.", folder: "08 Marketing & Teaser", folderMatch: /teaser|marketing/i },
  REPORT: { label: "Project Report", icon: "📊", blurb: "Full analysis of the project: site, power, permitting, economics, sponsor, risks, gaps and a recommendation.", folder: "09 Reports & Analysis", folderMatch: /report|analysis/i },
  DECK: { label: "Pitch Deck", icon: "🖥️", blurb: "10 to 14 investor slides. Saved as PDF and as an editable PowerPoint.", folder: "08 Marketing & Teaser", folderMatch: /teaser|marketing/i },
  CUSTOM: { label: "Custom report", icon: "✍️", blurb: "Anything else: summarize chosen documents, answer a question, compare options, research a topic. You write the brief.", folder: "09 Reports & Analysis", folderMatch: /report|analysis/i },
};

export const WIZARD_STATUSES = ["GENERATING", "READY", "FAILED"] as const;
export type WizardStatus = (typeof WIZARD_STATUSES)[number];

/** A generation still marked running after this long has died with its server function. */
export const STALE_AFTER_MS = 15 * 60 * 1000;
export const effectiveStatus = (status: string, updatedAt: Date | string, now = Date.now()): WizardStatus =>
  status === "GENERATING" && now - new Date(updatedAt).getTime() > STALE_AFTER_MS ? "FAILED" : (status as WizardStatus);

// ---------- what the wizard can read ----------

export type ReadKind = "pdf" | "image" | "text" | "docx" | "xlsx" | "pptx";

const READ_TYPES: [RegExp, ReadKind][] = [
  [/\.pdf$/i, "pdf"],
  [/\.(png|jpe?g|gif|webp)$/i, "image"],
  [/\.(txt|md|csv|tsv|json|html?|xml|eml|kml|geojson)$/i, "text"],
  [/\.docx$/i, "docx"],
  [/\.(xlsx|xlsm)$/i, "xlsx"],
  [/\.pptx$/i, "pptx"],
];

/** How the wizard reads a file, or why it can't. */
export function readKind(name: string): { kind: ReadKind } | { kind: null; reason: string } {
  for (const [re, kind] of READ_TYPES) if (re.test(name)) return { kind };
  if (/\.(doc|xls|ppt|rtf)$/i.test(name)) return { kind: null, reason: "Older Office format. Save it as .docx / .xlsx / .pptx or PDF." };
  return { kind: null, reason: "This file type can't be read. Save it as PDF." };
}

export const IMAGE_MEDIA: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

/** Claude takes one request of up to 32 MB. PDFs and images go in whole (base64 adds a third). */
export const MAX_BINARY_BYTES = 22 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Text pulled from one file (Word, Excel, text). About 100k tokens. */
export const MAX_TEXT_CHARS = 400_000;
/** Files larger than this aren't downloaded at all. */
export const MAX_FILE_BYTES = 60 * 1024 * 1024;

export type SourceCandidate = { id: string; name: string; size: number };
export type SourcePlan = { use: SourceCandidate[]; skipped: { name: string; reason: string }[] };

/**
 * Picks which chosen files go to Claude. PDFs and images count against the request size budget in the
 * order given; office and text files are converted to text and only count their text.
 */
export function planSources(files: SourceCandidate[]): SourcePlan {
  const use: SourceCandidate[] = [];
  const skipped: SourcePlan["skipped"] = [];
  let binary = 0;
  for (const f of files) {
    const r = readKind(f.name);
    if (!r.kind) { skipped.push({ name: f.name, reason: r.reason }); continue; }
    if (f.size > MAX_FILE_BYTES) { skipped.push({ name: f.name, reason: "Over 60 MB." }); continue; }
    if (r.kind === "image" && f.size > MAX_IMAGE_BYTES) { skipped.push({ name: f.name, reason: "Image over 5 MB." }); continue; }
    if (r.kind === "pdf" || r.kind === "image") {
      if (binary + f.size > MAX_BINARY_BYTES) { skipped.push({ name: f.name, reason: "Over the 22 MB total for PDFs and images in one run. Pick fewer files." }); continue; }
      binary += f.size;
    }
    use.push(f);
  }
  return { use, skipped };
}

// ---------- prompts ----------

export type WizardOptions = { anonymous: boolean; webResearch: boolean; instructions: string; audience: string };

export type ProjectFacts = {
  code: string; title: string; country: string; state: string; county: string | null; city: string | null; mw: number; facilityType: string; dealType: string;
  fundingNeeded: number; projectStatus: string; summary: string; highlights: string; term: string | null; useOfFunds: string;
  totalCapex: number | null; targetIrr: number | null; equityMultiple: number | null; leaseRateKwMo: number | null; powerRateCents: number | null;
  powerStatus: string | null; monthsToPower: number | null; codDate: string | null; capitalStack: string | null; economicsNotes: string | null;
  developer: { company: string; website: string | null } | null;
};

export type ValuationFacts = { score: number; recommendation: string; marketValue: number | null; perMw: number; low: number | null; high: number | null; askingVsMarket: number | null } | null;

/** The listing record as plain lines, for Claude to read alongside the documents. */
export function projectFactsText(p: ProjectFacts, v: ValuationFacts) {
  const line = (label: string, value: unknown) => (value === null || value === undefined || value === "" ? null : `- ${label}: ${value}`);
  return [
    "Listing record in the DEAC marketplace (entered by the DEAC team; documents may be more recent):",
    line("Listing code", p.code),
    line("Title", p.title),
    line("Location", [placeFull(p), isUS(p.country) ? "United States" : null].filter(Boolean).join(", ")),
    line("Capacity", `${p.mw} MW`),
    line("Facility type", p.facilityType),
    line("Deal type", dealTypeLabel(p.dealType)),
    line(p.dealType === "SALE" ? "Asking price" : "Funding needed", p.fundingNeeded ? usd(p.fundingNeeded, false) : null),
    line("Development status", p.projectStatus),
    line("Term", p.term),
    line("Power status", p.powerStatus),
    line("Months to power", p.monthsToPower),
    line("Power rate", p.powerRateCents != null ? `${p.powerRateCents} ¢/kWh` : null),
    line("Target COD", p.codDate),
    line("Total capex", p.totalCapex ? usd(p.totalCapex, false) : null),
    line("Target IRR", p.targetIrr != null ? `${p.targetIrr}%` : null),
    line("Equity multiple", p.equityMultiple != null ? `${p.equityMultiple}x` : null),
    line("Lease rate", p.leaseRateKwMo != null ? `$${p.leaseRateKwMo}/kW/month` : null),
    line("Capital stack", p.capitalStack),
    line("Economics notes", p.economicsNotes),
    line("Sponsor / developer", p.developer?.company),
    line("Sponsor website", p.developer?.website),
    p.summary && `- Summary: ${p.summary}`,
    p.highlights.trim() && `- Highlights:\n${p.highlights.split("\n").filter((h) => h.trim()).map((h) => `  - ${h.trim()}`).join("\n")}`,
    p.useOfFunds.trim() && `- Use of funds:\n${p.useOfFunds.split("\n").filter((h) => h.trim()).map((h) => `  - ${h.trim()}`).join("\n")}`,
    v && "",
    v && "DEAC internal valuation (from the DEAC bid calculator; internal, never quote it in investor-facing documents):",
    v && `- Value score: ${v.score} (${v.recommendation})`,
    v && `- Adjusted value: ${usd(v.perMw, false)} per MW${v.marketValue ? `; market value ${usd(v.marketValue, false)} (range ${usd(v.low, false)} to ${usd(v.high, false)})` : ""}`,
    v && v.askingVsMarket != null && `- Asking price vs. market value: ${v.askingVsMarket >= 0 ? "+" : ""}${Math.round(v.askingVsMarket * 100)}%`,
  ].filter((x): x is string => typeof x === "string").join("\n");
}

export const SYSTEM_PROMPT = `You are a senior analyst at DEAC (deacna.com), a curated marketplace that brings data center development opportunities (powered land, powered shells, turnkey and hyperscale campuses, conversions) to investors, lenders and operators. You write investor materials and internal analyses from a project's data room.

Rules:
- Work only from the data room documents, the listing record and, when web research is on, sources you find. Never invent numbers, names, dates or commitments.
- When sources disagree, use the most recent or most authoritative one and say so briefly.
- Where something important is missing, write "[To confirm: what is needed]" instead of guessing.
- Write in plain, confident business English for sophisticated infrastructure investors. Short paragraphs, concrete figures with units (MW, kV, acres, $/MW, ¢/kWh, months).
- Format: Markdown only. Start with a single "# " title line. Use "## " section headings, "- " bullets, "**bold**" for key figures, and pipe tables for key terms. No HTML, no images, no code blocks, no emojis.
- Output only the document. No preface, no closing remarks to the reader of this prompt.`;

const TEASER_BRIEF = (o: WizardOptions) => `Write a Project Teaser: a one to two page marketing summary sent to investors before an NDA.

Structure:
# <headline title, e.g. "120 MW Powered Land Opportunity – ${o.anonymous ? "Central Texas" : "<City, State>"}">
One-sentence positioning line in bold.
## Key Terms
A two-column table (Item | Detail): capacity (MW now and expansion), location, facility type, transaction type, funding sought or asking price, power status and utility, time to power / COD, site size, development status. Leave out rows that are unknown.
## Investment Highlights
Four to six bullets, each starting with a bold phrase.
## The Opportunity
One or two short paragraphs.
## Power & Infrastructure
Short bullets on power, interconnection, fiber, water, substation.
## Next Steps
How to proceed through DEAC: request access on the DEAC marketplace, sign the NDA to receive the full data room, then submit an LOI.

${o.anonymous ? `This teaser is ANONYMOUS (blind teaser): do NOT name the sponsor/developer, landowner, utility contract counterparties or tenants, and do not give the street address, parcel numbers, city or exact coordinates. Describe the location at the level of region/metro area, state or province, and country (e.g. "Dallas–Fort Worth area, Texas" or "Madrid region, Spain"). Use the listing code as the project name if a name is needed.` : "This teaser may name the project, sponsor and city, but never internal DEAC valuation figures."}
Never mention DEAC's internal valuation, value score or bid recommendation in a teaser.`;

const REPORT_BRIEF = () => `Write a Project Report: a thorough diligence-style analysis of the project for DEAC and qualified investors.

Structure:
# <Project name> – Project Report
## Executive Summary
Three to five sentences, then a Key Facts table (Item | Detail).
## Project Overview
## Site & Real Estate
## Power & Interconnection
## Permitting, Zoning & Environmental
## Engineering & Construction
## Commercial Strategy & Market
(tenant/offtake, market position, comparable activity)
## Financials & Economics
(capex, use of funds, returns, capital stack, lease or power economics; include DEAC's internal valuation and value score if provided, labelled as DEAC's internal view)
## Sponsor & Team
## Risk Assessment
A table (Risk | Severity (High/Medium/Low) | Mitigation / Comment) with the main risks.
## Information Gaps & Diligence Questions
Numbered list of what is missing or needs verifying, most important first.
## Conclusion & Recommendation
## Sources
Bullet list of the documents (by file name) and web pages used.

Skip a section's body with "[No information in the data room]" rather than padding it.`;

const DECK_BRIEF = (o: WizardOptions) => `Write an investor Pitch Deck of 10 to 14 slides.

Format rules for slides (they are turned into PowerPoint automatically):
- First line "# <Deck title>", then one short line under it: the subtitle for the cover slide.
- Each slide is a "## <Slide title>" heading (max 8 words) followed by at most 6 bullets of at most 14 words each, OR one short pipe table (max 7 rows, 2–3 columns), OR a one-sentence bold statement plus up to 4 bullets.
- No paragraphs longer than 30 words. No sub-headings inside a slide.

Suggested slides: The Opportunity · Investment Highlights · Site Overview · Power & Interconnection · Infrastructure & Connectivity · Development Status & Timeline · Market Context · Transaction & Use of Funds · Economics · Sponsor & Team · Risks & Mitigants · Next Steps.
${o.anonymous ? "This deck is ANONYMOUS: do not name the sponsor, landowner or counterparties, and give the location only at region/metro, state/province and country level." : ""}
Never show DEAC's internal valuation, value score or bid recommendation in the deck.`;

const CUSTOM_BRIEF = (o: WizardOptions) => `Write the document described in this brief from the DEAC team:

<brief>
${o.instructions.trim() || "Summarize the selected documents: what each one is, the key facts and figures, and anything that needs follow-up."}
</brief>

Choose a fitting structure with "## " sections. End with a "## Sources" section listing the documents (by file name) and web pages you used.`;

export function briefFor(kind: WizardKind, o: WizardOptions) {
  const brief = kind === "TEASER" ? TEASER_BRIEF(o) : kind === "REPORT" ? REPORT_BRIEF() : kind === "DECK" ? DECK_BRIEF(o) : CUSTOM_BRIEF(o);
  const extra = kind !== "CUSTOM" && o.instructions.trim() ? `\n\nExtra instructions from the DEAC team:\n<instructions>\n${o.instructions.trim()}\n</instructions>` : "";
  const audience = o.audience.trim() ? `\n\nAudience: ${o.audience.trim()}` : "";
  const web = o.webResearch
    ? `\n\nWeb research is ON: use web search to add useful outside context, for example the utility and ISO/RTO, grid and power-price conditions, nearby data center and hyperscaler activity, state incentives and tax treatment, local permitting climate, and news about the site or sponsor. Prefer authoritative sources (utilities, ISOs, government, established trade press). Link each fact you take from the web inline as a Markdown link [source name](url), and list the pages under "## Sources". Never let web content override what the data room documents say about the project itself; flag conflicts instead.`
    : "\n\nWeb research is OFF: use only the documents and the listing record.";
  return brief + extra + audience + web;
}

/** Drops anything Claude wrote before the document's "# " title (e.g. notes between web searches). */
export function cleanDraft(text: string) {
  const t = text.replace(/\r\n?/g, "\n");
  const at = t.search(/^# /m);
  return (at > 0 ? t.slice(at) : t).trim() + "\n";
}

/** File name for the saved document, e.g. "DEAC-TX-001 Project Teaser.pdf". */
export function outputFileName(code: string, kind: WizardKind, title: string, ext: "pdf" | "pptx") {
  const base = kind === "CUSTOM" ? (title || "Custom report").slice(0, 80) : KIND_INFO[kind].label;
  return `${code} ${base}`.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() + `.${ext}`;
}
