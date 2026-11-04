// Screening Tool: the editable screening template (Developer CRM → Screening template), each project's
// screening answers, and the instructions Claude gets when it pre-researches a project.
// Pure functions only, so they can be unit tested.

import { titleCase } from "./format";

// ---------- template ----------

/** ALL = every project. CA = only projects in Canada. */
export const QUESTION_SCOPES = ["ALL", "CA"] as const;
export type QuestionScope = (typeof QUESTION_SCOPES)[number];
export const SCOPE_LABEL: Record<QuestionScope, string> = { ALL: "All projects", CA: "Canada only" };

export type ScreeningQuestion = { id: string; text: string; scope: QuestionScope };
export type ScreeningCategory = { id: string; title: string; note: string; questions: ScreeningQuestion[] };
export type ScreeningTemplate = {
  /** Name used for "{partner}" in questions, e.g. the partner the sponsor would work with. */
  partnerName: string;
  categories: ScreeningCategory[];
};

/** The placeholder replaced by the template's partner name. */
export const PARTNER_TOKEN = "{partner}";

const q = (id: string, text: string, scope: QuestionScope = "ALL"): ScreeningQuestion => ({ id, text, scope });

export const DEFAULT_SCREENING: ScreeningTemplate = {
  partnerName: "WDC",
  categories: [
    {
      id: "sponsor", title: "Sponsor Information", note: "",
      questions: [
        q("sponsor-location", "Location of the project."),
        q("sponsor-owner", "Who owns the project / site?"),
        q("sponsor-role", "Your role and mandate on the project (owner, developer, advisor, broker…)."),
        q("sponsor-rights", "Executed ownership, option or lease rights, including term, conditions and assignability."),
      ],
    },
    {
      id: "site", title: "Site & Real Estate", note: "",
      questions: [
        q("site-location", "Site location (address / parcel, acreage)."),
        q("site-owner", "Site owner of record."),
        q("site-tenure", "Land tenure and status of required landowner approvals."),
        q("site-ca-nation", "Nation and province, and status of required Nation approvals.", "CA"),
        q("occ-operator", "Occupancy: any identified operator or customer?"),
        q("occ-mw-timing", "Occupancy: required MW and timing for that operator / customer."),
        q("occ-status", "Occupancy: current LOI, lease or offtake status."),
      ],
    },
    {
      id: "power", title: "Power & Interconnection", note: "Please distinguish load-service rights from generation / export interconnection, and total site load from IT load.",
      questions: [
        q("power-utility", "Serving utility."),
        q("power-capacity", "Confirmed load capacity (MW) and energization date."),
        q("power-ix-status", "Interconnection application, study and agreement status."),
        q("power-upgrades", "Required upgrades, costs and deposits."),
        q("power-load-vs-export", "Load-service rights versus generation / export interconnection: what is secured for each?"),
        q("phase-independent", "What first-phase MW can operate independently of the full buildout?"),
        q("phase-dates", "Earliest credible power date and commercial delivery date."),
        q("phase-milestones", "Power milestones and remaining dependencies."),
        q("phase-site-vs-it", "Total site load versus IT load (MW), for the first phase and the full buildout."),
        q("gen-technology", "Onsite generation: technology and MW."),
        q("gen-battery", "Onsite generation: battery storage MW / MWh."),
        q("gen-firm", "Onsite generation: firm power available to compute."),
        q("gen-backup-plan", "Onsite generation: supply plan when solar / storage cannot serve the load."),
        q("gen-status", "Onsite generation: status of permits, fuel (where applicable), equipment and EPC arrangements."),
        q("gen-ca-mw-basis", "Does the headline MW (e.g. \"100 MW\") refer to generation capacity or deliverable compute load?", "CA"),
      ],
    },
    {
      id: "fiber", title: "Fiber Connectivity", note: "",
      questions: [
        q("fiber-providers", "Fiber providers at or near the site, and distance to the nearest long-haul / metro route."),
        q("fiber-diversity", "Diverse routes / entrances available or planned, and lit vs. dark fiber."),
        q("fiber-status", "Status, cost and timing of any fiber build or agreements."),
      ],
    },
    {
      id: "permitting", title: "Permitting & Environmental", note: "",
      questions: [
        q("permit-zoning", "Zoning and land-use entitlements: current status and what is still required."),
        q("permit-environmental", "Environmental studies and approvals (Phase I ESA, wetlands, species, air, water) and their status."),
        q("permit-water", "Water source and cooling approach, with any water permits."),
        q("phase-schedule", "Initial phase and schedule: permitting milestones and the timeline to start of construction."),
      ],
    },
    {
      id: "engineering", title: "Engineering & Construction", note: "",
      questions: [
        q("eng-plans", "Engineering plans completed to date (site plan, conceptual / schematic design, electrical one-line)."),
        q("eng-design-basis", "Design basis: building / campus layout, density (kW per rack), cooling and redundancy."),
        q("eng-epc", "Engineering / construction partners (EPC, GC) and contracting status."),
        q("eng-long-lead", "Long-lead equipment (transformers, switchgear, generators) ordered or reserved."),
      ],
    },
    {
      id: "capital", title: "Financial & Capitalization", note: "",
      questions: [
        q("cap-budget", "Indicative phase-one budget."),
        q("cap-funding", "Who funds site control, studies, deposits, generation and infrastructure?"),
        q("cap-committed", "Committed versus proposed capital."),
        q("cap-partner-role", `Ownership, responsibilities, economics and the specific role you envision for ${PARTNER_TOKEN}.`),
      ],
    },
  ],
};

export const MAX_CATEGORIES = 20;
export const MAX_QUESTIONS = 40; // per category

const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "q";

/** Makes a saved or submitted template safe: trims text, drops empty entries, gives every item a unique id. */
export function normalizeTemplate(raw: unknown): ScreeningTemplate {
  const r = (raw ?? {}) as Partial<ScreeningTemplate>;
  const used = new Set<string>();
  const uid = (want: unknown, fallback: string) => {
    const base = typeof want === "string" && /^[a-z0-9-]{1,60}$/.test(want) ? want : slug(fallback);
    let id = base, n = 2;
    while (used.has(id)) id = `${base}-${n++}`;
    used.add(id);
    return id;
  };
  const categories: ScreeningCategory[] = [];
  for (const c of Array.isArray(r.categories) ? r.categories.slice(0, MAX_CATEGORIES) : []) {
    const title = titleCase(clean(c?.title, 120));
    if (!title) continue;
    const questions: ScreeningQuestion[] = [];
    for (const x of Array.isArray(c.questions) ? c.questions.slice(0, MAX_QUESTIONS) : []) {
      const text = String(x?.text ?? "").trim().slice(0, 1000);
      if (!text) continue;
      questions.push({ id: uid(x.id, `${title}-${text}`), text, scope: QUESTION_SCOPES.includes(x.scope as QuestionScope) ? (x.scope as QuestionScope) : "ALL" });
    }
    categories.push({ id: uid(c.id, title), title, note: String(c.note ?? "").trim().slice(0, 1000), questions });
  }
  return { partnerName: clean(r.partnerName, 80), categories };
}

export function parseTemplate(json?: string | null): ScreeningTemplate {
  if (!json) return DEFAULT_SCREENING;
  try { return normalizeTemplate(JSON.parse(json)); } catch { return DEFAULT_SCREENING; }
}

/** Question text with the partner name filled in. */
export const questionText = (text: string, partnerName: string) => text.split(PARTNER_TOKEN).join(partnerName.trim() || "the partner");

/** The categories and questions that apply to a project, by its country. Empty categories are left out. */
export function questionsFor(t: ScreeningTemplate, country: string): ScreeningCategory[] {
  const canada = country.toUpperCase() === "CA";
  return t.categories
    .map((c) => ({ ...c, note: questionText(c.note, t.partnerName), questions: c.questions.filter((x) => x.scope === "ALL" || canada).map((x) => ({ ...x, text: questionText(x.text, t.partnerName) })) }))
    .filter((c) => c.questions.length);
}

// ---------- a project's screening ----------

/** ANSWERED = fully answered with evidence. PARTIAL = some of it. MISSING = nothing found. CONFLICT = sources disagree. NA = doesn't apply. */
export const ANSWER_STATUSES = ["ANSWERED", "PARTIAL", "MISSING", "CONFLICT", "NA"] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];
export const STATUS_INFO: Record<AnswerStatus, { label: string; tone: "green" | "amber" | "red" | "slate" | "purple" }> = {
  ANSWERED: { label: "Answered", tone: "green" },
  PARTIAL: { label: "Partial", tone: "amber" },
  MISSING: { label: "Gap", tone: "red" },
  CONFLICT: { label: "Conflict", tone: "purple" },
  NA: { label: "Not applicable", tone: "slate" },
};
export const isAnswerStatus = (v: unknown): v is AnswerStatus => ANSWER_STATUSES.includes(v as AnswerStatus);

/** What Claude found for one question. */
export type AiAnswer = { status: AnswerStatus; answer: string; sources: string; followUp: string };
/** The team's own answer for one question; overrides Claude's when set. */
export type TeamAnswer = { status: AnswerStatus | ""; answer: string; verified: boolean };
export type ScreeningItem = { ai: AiAnswer | null; team: TeamAnswer };
export type ScreeningAnswers = Record<string, ScreeningItem>;

export const DECISIONS = ["", "ADVANCE", "HOLD", "DECLINE"] as const;
export type Decision = (typeof DECISIONS)[number];
export const DECISION_INFO: Record<Exclude<Decision, "">, { label: string; tone: "green" | "amber" | "red" }> = {
  ADVANCE: { label: "Advance", tone: "green" },
  HOLD: { label: "Hold", tone: "amber" },
  DECLINE: { label: "Decline", tone: "red" },
};

export const EMPTY_TEAM: TeamAnswer = { status: "", answer: "", verified: false };

export function parseAnswers(json?: string | null): ScreeningAnswers {
  try {
    const raw = JSON.parse(json || "{}") as Record<string, Partial<ScreeningItem>>;
    const out: ScreeningAnswers = {};
    for (const [id, v] of Object.entries(raw ?? {})) {
      const ai = v?.ai && isAnswerStatus(v.ai.status) ? { status: v.ai.status, answer: String(v.ai.answer ?? ""), sources: String(v.ai.sources ?? ""), followUp: String(v.ai.followUp ?? "") } : null;
      const t = v?.team ?? EMPTY_TEAM;
      out[id] = { ai, team: { status: isAnswerStatus(t.status) ? t.status : "", answer: String(t.answer ?? ""), verified: !!t.verified } };
    }
    return out;
  } catch { return {}; }
}

/** The status that counts: the team's if they set one, else Claude's, else a gap. */
export function effectiveAnswer(item: ScreeningItem | undefined): { status: AnswerStatus; answer: string; byTeam: boolean } {
  const team = item?.team;
  if (team && (team.status || team.answer.trim())) return { status: team.status || (item?.ai?.status ?? "PARTIAL"), answer: team.answer.trim() || item?.ai?.answer || "", byTeam: true };
  if (item?.ai) return { status: item.ai.status, answer: item.ai.answer, byTeam: false };
  return { status: "MISSING", answer: "", byTeam: false };
}

export type Progress = Record<AnswerStatus, number> & { total: number; verified: number; percent: number };

/** How complete the screening is. Answered and not-applicable count as done; partial counts half. */
export function progress(cats: ScreeningCategory[], answers: ScreeningAnswers): Progress {
  const p: Progress = { ANSWERED: 0, PARTIAL: 0, MISSING: 0, CONFLICT: 0, NA: 0, total: 0, verified: 0, percent: 0 };
  for (const c of cats) for (const x of c.questions) {
    p.total++;
    p[effectiveAnswer(answers[x.id]).status]++;
    if (answers[x.id]?.team.verified) p.verified++;
  }
  p.percent = p.total ? Math.round(((p.ANSWERED + p.NA + p.PARTIAL / 2) / p.total) * 100) : 0;
  return p;
}

/** Stores Claude's new findings and keeps everything the team wrote. */
export function mergeAi(prev: ScreeningAnswers, ai: Record<string, AiAnswer>): ScreeningAnswers {
  const out: ScreeningAnswers = {};
  for (const [id, v] of Object.entries(prev)) out[id] = { ai: v.ai, team: v.team };
  for (const [id, a] of Object.entries(ai)) out[id] = { ai: a, team: out[id]?.team ?? EMPTY_TEAM };
  return out;
}

/** The questions to send the sponsor: every question not yet answered, grouped by category. */
export function sponsorQuestions(cats: ScreeningCategory[], answers: ScreeningAnswers) {
  return cats
    .map((c) => ({
      title: c.title,
      note: c.note,
      items: c.questions.flatMap((x) => {
        const e = effectiveAnswer(answers[x.id]);
        if (e.status === "ANSWERED" || e.status === "NA") return [];
        const follow = answers[x.id]?.ai?.followUp.trim();
        return [{ id: x.id, status: e.status, text: follow || x.text }];
      }),
    }))
    .filter((c) => c.items.length);
}

/** Plain-text questionnaire for an email to the sponsor. */
export function sponsorQuestionsText(cats: ScreeningCategory[], answers: ScreeningAnswers, projectTitle: string) {
  const groups = sponsorQuestions(cats, answers);
  if (!groups.length) return "";
  let n = 0;
  return [
    `Screening questions: ${projectTitle}`,
    "",
    "Thank you for sharing the project. To complete our screening, could you please answer the questions below (or point us to the document that covers each one)?",
    ...groups.flatMap((g) => ["", g.title.toUpperCase(), ...(g.note ? [g.note] : []), ...g.items.map((i) => `${++n}. ${i.text}`)]),
  ].join("\n");
}

type ReportMeta = { code: string; title: string; summary: string; redFlags: string[]; decision: Decision; decisionNote: string; webSources: { title: string; url: string }[] };

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\s*\n\s*/g, " ").trim() || "—";

/** The screening as a Markdown report (saved to the data room as a PDF). */
export function screeningMarkdown(cats: ScreeningCategory[], answers: ScreeningAnswers, m: ReportMeta) {
  const p = progress(cats, answers);
  const lines = [
    `# Project Screening: ${m.title}`,
    "",
    `**${m.code}** · ${p.percent}% complete · ${p.ANSWERED} answered, ${p.PARTIAL} partial, ${p.MISSING} gap${p.MISSING === 1 ? "" : "s"}, ${p.CONFLICT} conflict${p.CONFLICT === 1 ? "" : "s"}${m.decision ? ` · Decision: **${DECISION_INFO[m.decision].label}**` : ""}`,
  ];
  if (m.decisionNote.trim()) lines.push("", m.decisionNote.trim());
  if (m.summary.trim()) lines.push("", "## Summary", "", m.summary.trim());
  if (m.redFlags.length) lines.push("", "## Red Flags", "", ...m.redFlags.map((f) => `- ${f}`));
  for (const c of cats) {
    lines.push("", `## ${c.title}`);
    if (c.note) lines.push("", `_${c.note}_`);
    lines.push("", "| Question | Answer | Source |", "|---|---|---|");
    for (const x of c.questions) {
      const it = answers[x.id];
      const e = effectiveAnswer(it);
      const src = e.byTeam ? `DEAC team${it?.team.verified ? " (verified)" : ""}` : it?.ai?.sources ?? "";
      lines.push(`| ${cell(x.text)} | **${STATUS_INFO[e.status].label}**${e.answer.trim() ? `: ${cell(e.answer)}` : ""} | ${cell(src)} |`);
    }
  }
  const qs = sponsorQuestions(cats, answers);
  if (qs.length) {
    let n = 0;
    lines.push("", "## Open Questions for the Sponsor", "");
    for (const g of qs) lines.push(`**${g.title}**`, "", ...g.items.map((i) => `${++n}. ${i.text}`), "");
  }
  if (m.webSources.length) lines.push("", "## Web Sources", "", ...m.webSources.map((s) => `- ${s.title}: ${s.url}`));
  return lines.join("\n").trim() + "\n";
}

// ---------- Claude ----------

export type ScreeningOptions = { webResearch: boolean; notes: string };

export const SCREENING_SYSTEM = `You are a senior data center development analyst at DEAC (deacna.com), a curated marketplace that brings data center development opportunities (powered land, powered shells, campuses, conversions, behind-the-meter generation) to investors and operators. You screen projects that sponsors submit, before the DEAC team asks the sponsor any questions.

Rules:
- Answer only from the evidence you are given: the listing record, the sponsor's data room documents, the DEAC team's notes and, when provided, web research notes. Never invent numbers, names, dates or commitments, and never treat the sponsor's marketing claims as confirmed facts without a document behind them.
- Be precise about power. Distinguish load-service capacity from generation / export interconnection, firm from intermittent supply, total site load from IT load, and studied / applied from signed / energized.
- Flag inconsistencies between sources (e.g. different MW, dates or owners).
- Write tersely for an experienced investment team: concrete figures with units (MW, MWh, kV, acres, $, months, dates).`;

export const RESEARCH_BRIEF = `Research this project on the public web before the screening. Look for:
- The sponsor / developer: who they are, track record, principals, news, litigation.
- The site: ownership and parcel records where public, zoning or land tenure, nearby data center activity. For sites in Canada, the First Nation or landowner involved and any public approvals.
- Fiber: carriers and long-haul routes near the site.
- Permitting and environmental: zoning decisions, environmental reviews, water permits, local opposition.
- Power: the serving utility and ISO / RTO, public interconnection queue entries for this site or sponsor, transmission and substation upgrades, utility large-load tariffs or moratoria, local power prices.
- Onsite generation: permits, air permits, gas pipeline access, equipment or EPC announcements.
- Any announced customer, operator, offtake or financing.

Write research notes in Markdown, grouped by those topics. For each finding give the fact, the date, and the source URL. Say plainly when you found nothing on a topic. Do not repeat what the listing record already says unless the web confirms or contradicts it.`;

/** The questions as a numbered list Claude answers by id. */
export function questionList(cats: ScreeningCategory[]) {
  return cats.map((c) => [`## ${c.title}`, ...(c.note ? [`(${c.note})`] : []), ...c.questions.map((x) => `- [${x.id}] ${x.text}`)].join("\n")).join("\n\n");
}

export function screeningBrief(cats: ScreeningCategory[]) {
  return `Screen this project against every question below. For each question id, return:
- status: ANSWERED (the evidence fully answers it), PARTIAL (some of it), MISSING (nothing found), CONFLICT (sources disagree) or NA (clearly does not apply to this project, e.g. no onsite generation is planned).
- answer: what the evidence says, in one to four sentences with figures. Empty when MISSING.
- sources: where it came from, e.g. "Interconnection study.pdf p.4; listing record; web: utility press release 2026-03". Empty when MISSING.
- followUp: the exact question to ask the sponsor to close the gap or resolve the conflict, specific to what is missing. Empty when ANSWERED or NA.

Also return:
- summary: a short screening summary (3 to 6 sentences): what the project is, how well-evidenced it is, and the biggest open issues.
- redFlags: concrete concerns that could kill or materially delay the deal (each one sentence). Empty list if none.

Questions:

${questionList(cats)}`;
}

/** Structured output for the screening. Plain strings ("" for none) keep it within the API's schema limits. */
export const SCREENING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "redFlags", "answers"],
  properties: {
    summary: { type: "string" },
    redFlags: { type: "array", items: { type: "string" } },
    answers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "status", "answer", "sources", "followUp"],
        properties: {
          id: { type: "string" },
          status: { type: "string", enum: [...ANSWER_STATUSES] },
          answer: { type: "string" },
          sources: { type: "string" },
          followUp: { type: "string" },
        },
      },
    },
  },
} as const;

export type ScreeningResult = { summary: string; redFlags: string[]; answers: { id: string; status: string; answer: string; sources: string; followUp: string }[] };

/** Keeps only answers to questions that were asked; a question Claude skipped becomes a gap. */
export function resultToAi(cats: ScreeningCategory[], r: ScreeningResult): Record<string, AiAnswer> {
  const byId = new Map(r.answers.map((a) => [a.id.replace(/^\[|\]$/g, "").trim(), a]));
  const out: Record<string, AiAnswer> = {};
  for (const c of cats) for (const x of c.questions) {
    const a = byId.get(x.id);
    out[x.id] = a && isAnswerStatus(a.status)
      ? { status: a.status, answer: a.answer.trim(), sources: a.sources.trim(), followUp: a.followUp.trim() }
      : { status: "MISSING", answer: "", sources: "", followUp: x.text };
  }
  return out;
}

/** A run still marked running after this long has died with its server function. */
export const STALE_AFTER_MS = 15 * 60 * 1000;
export type RunStatus = "IDLE" | "RUNNING" | "READY" | "FAILED";
export const effectiveRunStatus = (status: string, updatedAt: Date | string, now = Date.now()): RunStatus =>
  status === "RUNNING" && now - new Date(updatedAt).getTime() > STALE_AFTER_MS ? "FAILED" : (status as RunStatus);
