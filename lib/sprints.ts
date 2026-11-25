// Sprints: the tasks and sub-tasks that move a project from one Developer CRM stage to the next.
// No database access here (see lib/sprints-db.ts).
//
// State machine (one per project). The project's CRM stage (Project.pipelineStage, lib/pipeline.ts) is the only state;
// a Sprint row only records that a stage's sprint was started (its tasks are Activity rows with sprintId).
//   project created in stage S        → sprint for S started from the S template
//   project moved S → T (board/menu)  → sprint for T started from the T template, unless T already has one (moved back)
//   current stage has no sprint       → (older projects, projects following their developer) "Start Sprint" button
// Whether a sprint is done, active or upcoming is never stored: roadmap() works it out from where the project sits
// in its funnel, so a sprint can't disagree with the board. Sprints are never closed or deleted when a project moves;
// open tasks in a stage the project has left stay open and are shown as "left open".

import { assertNever, priorityOf, type Priority } from "./tasks";

/** How a sprint task's assignee is chosen when the sprint starts. */
export type SprintAssignee =
  | { kind: "MOVER" } // the team member who moved the project into the stage (an agent's DEAC partner; unassigned for public submissions)
  | { kind: "NONE" }
  | { kind: "USER"; id: string };

export type SprintSubtask = { id: string; title: string; dueDays: number | null };
/** startDays / dueDays: days after the sprint starts (the task's timeline). Null = no date. */
export type SprintTaskTemplate = { id: string; title: string; details: string; startDays: number | null; dueDays: number | null; priority: Priority | null; assignee: SprintAssignee; subtasks: SprintSubtask[] };
/** One stage's sprint: what it's for, how long it should take, and its tasks. */
export type StageSprint = { goal: string; days: number | null; tasks: SprintTaskTemplate[] };
/** Sprint templates by CRM stage value. Stage values are shared by every deal type's funnel. */
export type SprintTemplates = { stages: Record<string, StageSprint> };

export const MAX_TASKS = 40;
export const MAX_SUBTASKS = 20;
export const MAX_DAYS = 365;

/** Stages a project leaves the roadmap through. They only show on a roadmap when the project is in one. */
export const OFF_RAMP_STAGES = ["PASSED"];

const t = (title: string, [startDays, dueDays]: [number, number], subtasks: string[] = [], details = "", priority: Priority | null = null): SprintTaskTemplate => ({
  id: "", title, details, startDays, dueDays, priority, assignee: { kind: "MOVER" },
  subtasks: subtasks.map((s) => ({ id: "", title: s, dueDays: null })),
});

/** DEAC's starting sprints for the original eight CRM stages. Editable on Sprints → Sprint Templates. */
const DEFAULT_STAGES: Record<string, StageSprint> = {
  LEAD: {
    goal: "Qualify the lead and collect enough to screen it.",
    days: 7,
    tasks: [
      t("Intro call with the developer", [0, 2], ["Confirm the decision maker and the project contact", "Confirm MW, location and power status", "Ask whether they want a sale, lease or financing"], "", "HIGH"),
      t("Request the initial project package", [1, 4], ["Teaser or overview deck", "Site map and parcel information", "Utility / interconnection letters"], "", "HIGH"),
      t("Put the materials in the project data room", [3, 5], [], "", "MEDIUM"),
      t("Send the DEAC NDA if the developer asks for one", [2, 5], [], "", "LOW"),
    ],
  },
  SCREENING: {
    goal: "Screen the project and decide Advance, Hold or Decline.",
    days: 10,
    tasks: [
      t("Run the Screening Tool", [0, 3], ["Pick the data room files to read", "Review Claude's answers", "Verify the key answers"], "", "HIGH"),
      t("Send the open questions to the sponsor", [3, 5], ["Draft the questions email", "Log the sponsor's answers"], "", "MEDIUM"),
      t("Record the screening decision", [8, 10], [], "Advance, Hold or Decline on the project's Screening page.", "CRITICAL"),
    ],
  },
  SCORED: {
    goal: "Value the project and set our bid.",
    days: 7,
    tasks: [
      t("Fill in the Valuation Calculator", [0, 3], ["Power rate and months to power", "Expansion MW", "Asking price"], "", "HIGH"),
      t("Review the lead score against the Buy / Negotiate thresholds", [3, 4], [], "", "MEDIUM"),
      t("Internal go / no-go meeting", [4, 5], [], "", "CRITICAL"),
      t("Propose engagement terms to the developer", [5, 7], [], "", "HIGH"),
    ],
  },
  ENGAGED: {
    goal: "Sign the engagement and get the listing ready.",
    days: 14,
    tasks: [
      t("Send the engagement agreement for e-signature", [0, 3], ["Prepare the agreement", "Countersign"], "", "CRITICAL"),
      t("Collect the diligence documents", [0, 10], ["Title and survey", "Environmental reports", "Interconnection study", "Financial model"], "", "HIGH"),
      t("Build the listing", [5, 14], ["Teaser with the Document Wizard", "Pitch deck", "Investor disclosure stages", "Data room access tiers"], "", "HIGH"),
    ],
  },
  LISTED: {
    goal: "Market the listing and secure LOIs.",
    days: 30,
    tasks: [
      t("Publish the listing", [0, 1], [], "Set Visibility to Private or Teaser.", "CRITICAL"),
      t("Investor outreach", [1, 14], ["Pick matching investors in the Investor CRM", "Send the outreach campaign", "Follow up with every interested investor"], "", "HIGH"),
      t("Confirm NDAs as they come in", [1, 21], [], "", "MEDIUM"),
      t("Review LOIs and pick the preferred one", [21, 30], [], "", "CRITICAL"),
    ],
  },
  IN_DILIGENCE: {
    goal: "Take the selected investor through diligence to signed documents.",
    days: 45,
    tasks: [
      t("Open full diligence access for the selected investor", [0, 2], [], "", "HIGH"),
      t("Run the diligence request list", [2, 30], ["Weekly diligence call", "Answer questions within 48 hours"], "", "HIGH"),
      t("Negotiate the term sheet", [7, 21], [], "", "CRITICAL"),
      t("Coordinate the definitive documents", [21, 45], ["Purchase / lease / financing agreement", "Closing checklist"], "", "HIGH"),
    ],
  },
  CLOSED: {
    goal: "Close out the deal.",
    days: 14,
    tasks: [
      t("Confirm execution and funding", [0, 2], [], "", "CRITICAL"),
      t("Set the listing's deal stage to Closed", [0, 2], [], "", "MEDIUM"),
      t("Invoice the success fee", [2, 7], [], "", "HIGH"),
      t("Ask the developer and investor for a testimonial", [7, 14], [], "", "LOW"),
    ],
  },
  PASSED: {
    goal: "Pass on the project and keep the relationship.",
    days: 7,
    tasks: [
      t("Log why we passed", [0, 1], [], "", "MEDIUM"),
      t("Send the developer a decline note", [1, 3], [], "", "MEDIUM"),
      t("Set a 6-month check-in task", [3, 7], [], "", "LOW"),
    ],
  },
};

let seq = 0;
/** A template id for a task or sub-task; only used to keep editor rows apart. */
export const templateId = (p: string) => `${p}${Date.now().toString(36)}${(++seq).toString(36)}`;

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const days = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.min(MAX_DAYS, Math.round(n)) : null;
};

export function parseAssignee(v: unknown): SprintAssignee {
  const a = v as { kind?: unknown; id?: unknown } | null;
  if (a?.kind === "NONE") return { kind: "NONE" };
  if (a?.kind === "USER" && typeof a.id === "string" && a.id) return { kind: "USER", id: a.id };
  return { kind: "MOVER" };
}

/** Cleans one stage's sprint from the editor: trims text, drops untitled tasks and sub-tasks, caps the counts. */
export function normalizeStageSprint(raw: unknown): StageSprint {
  const r = raw as { goal?: unknown; days?: unknown; tasks?: unknown } | null;
  const tasks: SprintTaskTemplate[] = [];
  for (const x of Array.isArray(r?.tasks) ? r.tasks : []) {
    if (tasks.length >= MAX_TASKS) break;
    const title = clean(x?.title, 200);
    if (!title) continue;
    const subtasks: SprintSubtask[] = [];
    for (const y of Array.isArray(x?.subtasks) ? x.subtasks : []) {
      if (subtasks.length >= MAX_SUBTASKS) break;
      const st = clean(y?.title, 200);
      if (st) subtasks.push({ id: clean(y?.id, 60) || templateId("s"), title: st, dueDays: days(y?.dueDays) });
    }
    const dueDays = days(x?.dueDays);
    const startDays = days(x?.startDays);
    tasks.push({
      id: clean(x?.id, 60) || templateId("t"), title, details: typeof x?.details === "string" ? x.details.trim().slice(0, 2000) : "",
      // A timeline never ends before it starts.
      startDays: startDays !== null && dueDays !== null ? Math.min(startDays, dueDays) : startDays, dueDays,
      priority: priorityOf(x?.priority), assignee: parseAssignee(x?.assignee), subtasks,
    });
  }
  return { goal: clean(r?.goal, 300), days: days(r?.days), tasks };
}

export function normalizeTemplates(raw: unknown): SprintTemplates {
  const stages = (raw as { stages?: Record<string, unknown> } | null)?.stages ?? {};
  return { stages: Object.fromEntries(Object.entries(stages).filter(([k]) => /^[A-Z0-9_]{1,40}$/.test(k)).map(([k, v]) => [k, normalizeStageSprint(v)])) };
}

export const DEFAULT_SPRINTS: SprintTemplates = normalizeTemplates({ stages: DEFAULT_STAGES });

export function parseTemplates(json: string | null | undefined): SprintTemplates {
  if (!json) return DEFAULT_SPRINTS;
  try { return normalizeTemplates(JSON.parse(json)); } catch { return DEFAULT_SPRINTS; }
}

/** A stage's sprint template. A stage nobody wrote a sprint for (e.g. a new funnel column) has no tasks. */
export const stageSprint = (cfg: SprintTemplates, stage: string): StageSprint => cfg.stages[stage] ?? { goal: "", days: null, tasks: [] };

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** A task to create when a sprint starts. Sub-tasks point at their task by `parent` (an index into the list). */
export type PlannedTask = { subject: string; body: string; startAt: Date | null; dueAt: Date | null; priority: Priority | null; assigneeId: string | null; parent: number | null };

/**
 * The tasks a sprint starts with, from its stage's template. `mover` is the team member who moved the project
 * (null when nobody did, e.g. a public submission); `canHold` says whether a person can still hold tasks
 * (a removed or suspended person falls back to the mover). Sub-tasks get their task's assignee.
 */
export function planSprint(tpl: StageSprint, start: Date, mover: string | null, canHold: (id: string) => boolean): { targetAt: Date | null; tasks: PlannedTask[] } {
  const tasks: PlannedTask[] = [];
  const due = (n: number | null) => (n === null ? null : addDays(start, n));
  for (const x of tpl.tasks) {
    const a = x.assignee;
    let assigneeId: string | null;
    switch (a.kind) {
      case "MOVER": assigneeId = mover; break;
      case "NONE": assigneeId = null; break;
      case "USER": assigneeId = canHold(a.id) ? a.id : mover; break;
      default: assertNever(a);
    }
    const startAt = due(x.startDays);
    const parent = tasks.push({ subject: x.title, body: x.details, startAt, dueAt: due(x.dueDays), priority: x.priority, assigneeId, parent: null }) - 1;
    for (const y of x.subtasks) tasks.push({ subject: y.title, body: "", startAt, dueAt: due(y.dueDays ?? x.dueDays), priority: null, assigneeId, parent });
  }
  return { targetAt: due(tpl.days), tasks };
}

// ---------- roadmap ----------

/** Where a stage sits relative to the project: behind it, the stage it's in, ahead of it, or (after passing) never reached. */
export type StagePosition = "DONE" | "ACTIVE" | "UPCOMING" | "NOT_REACHED";
export const POSITION_LABEL: Record<StagePosition, string> = { DONE: "Done", ACTIVE: "Current Sprint", UPCOMING: "Upcoming", NOT_REACHED: "Not Reached" };

export type RoadmapStage<S> = { value: string; label: string; position: StagePosition; sprint: S | null };

/**
 * A project's roadmap: every stage of its funnel in order, each with its sprint (if one was started) and where it
 * sits. Off-ramp stages (Passed) only appear when the project is in one; then stages it had sprints for count as
 * done and the rest as not reached.
 */
export function roadmap<S extends { stage: string }>(stages: readonly { value: string; label: string }[], current: string, sprints: S[]): RoadmapStage<S>[] {
  const byStage = new Map(sprints.map((s) => [s.stage, s]));
  const offRamp = OFF_RAMP_STAGES.includes(current);
  const shown = stages.filter((s) => s.value === current || !OFF_RAMP_STAGES.includes(s.value));
  const at = shown.findIndex((s) => s.value === current);
  return shown.map((s, i) => {
    const sprint = byStage.get(s.value) ?? null;
    const position: StagePosition = s.value === current ? "ACTIVE" : offRamp ? (sprint ? "DONE" : "NOT_REACHED") : i < at ? "DONE" : "UPCOMING";
    return { value: s.value, label: s.label, position, sprint };
  });
}

/** The stage after `current` in the funnel, skipping off-ramps. Null at the end (or when the project is in an off-ramp). */
export function nextStage(stages: readonly { value: string; label: string }[], current: string) {
  if (OFF_RAMP_STAGES.includes(current)) return null;
  const i = stages.findIndex((s) => s.value === current);
  return stages.slice(i + 1).find((s) => !OFF_RAMP_STAGES.includes(s.value)) ?? null;
}

/** Done / total over a sprint's tasks and sub-tasks. */
export function progress(tasks: { doneAt: Date | null }[]) {
  const done = tasks.filter((x) => x.doneAt).length;
  return { done, total: tasks.length, pct: tasks.length ? Math.round((done / tasks.length) * 100) : 0 };
}

// ---------- roadmap dates ----------

export type StageDates = { start: Date; end: Date; projected: boolean } | null;

/**
 * Dates for each roadmap stage. Done stages run from their sprint's start to the next sprint's start; the current
 * sprint runs to its target; upcoming stages are projected one after another from there using each template's
 * length in days. `closeAt` is when the project is projected to reach Closed (null once it's there or passed).
 */
export function schedule<S extends { stage: string; startedAt: Date; targetAt: Date | null }>(rows: RoadmapStage<S>[], cfg: SprintTemplates, now = new Date()) {
  const len = (stage: string) => stageSprint(cfg, stage).days ?? 0;
  const starts = rows.flatMap((r) => (r.sprint ? [r.sprint.startedAt.getTime()] : []));
  let cursor = now;
  const dates: StageDates[] = rows.map((r) => {
    switch (r.position) {
      case "DONE": {
        if (!r.sprint) return null;
        const start = r.sprint.startedAt;
        const later = starts.filter((t) => t > start.getTime());
        return { start, end: later.length ? new Date(Math.min(...later)) : r.sprint.targetAt ?? start, projected: false };
      }
      case "ACTIVE": {
        const start = r.sprint?.startedAt ?? now;
        const end = r.sprint?.targetAt ?? addDays(start, len(r.value));
        cursor = end > now ? end : now;
        return { start, end, projected: !r.sprint };
      }
      case "UPCOMING": {
        const start = cursor;
        cursor = addDays(start, len(r.value));
        return { start, end: cursor, projected: true };
      }
      case "NOT_REACHED": return null;
      default: return assertNever(r.position);
    }
  });
  const closing = rows.findIndex((r) => r.value === "CLOSED");
  const closeAt = closing >= 0 && rows[closing].position === "UPCOMING" ? dates[closing]?.start ?? null : null;
  return { dates, closeAt };
}
