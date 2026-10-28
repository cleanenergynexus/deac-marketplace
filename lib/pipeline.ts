import { DEAL_TYPES, DEVELOPER_STAGES } from "./constants";

/**
 * Developer CRM funnels. Each deal type (lease, financing, sale) has its own list of Kanban columns,
 * edited in Admin → Developer CRM → Edit funnels and saved as JSON in PipelineSettings.
 * A stage's `value` is what projects store; renaming a column only changes its `label`.
 */
export type PipelineStage = { value: string; label: string };
export type PipelineConfig = { funnels: Record<string, PipelineStage[]> };

export const FUNNEL_KEYS = DEAL_TYPES.map((d) => d.value) as string[];
export const MAX_STAGES = 30;
export const MAX_LABEL = 40;

const copy = (list: readonly PipelineStage[]) => list.map((s) => ({ value: s.value, label: s.label }));

/** Until someone edits them, every funnel starts with the original eight CRM stages. */
export const DEFAULT_PIPELINE: PipelineConfig = { funnels: Object.fromEntries(FUNNEL_KEYS.map((k) => [k, copy(DEVELOPER_STAGES)])) };

/** "Term sheet out!" -> "TERM_SHEET_OUT", made unique against `taken`. */
export function stageValue(label: string, taken: Set<string>) {
  const base = label.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s-]+/g, "_").toUpperCase().slice(0, 30) || "STAGE";
  let v = base;
  for (let i = 2; taken.has(v); i++) v = `${base}_${i}`;
  return v;
}

/** Cleans a funnel list from the editor: trims labels, drops blanks, gives new columns a stored value, removes duplicates. */
export function normalizeStages(raw: unknown, fallback: readonly PipelineStage[] = DEVELOPER_STAGES): PipelineStage[] {
  const out: PipelineStage[] = [];
  const taken = new Set<string>();
  for (const r of Array.isArray(raw) ? raw : []) {
    if (out.length >= MAX_STAGES) break;
    const label = typeof r?.label === "string" ? r.label.replace(/\s+/g, " ").trim().slice(0, MAX_LABEL) : "";
    if (!label) continue;
    let value = typeof r?.value === "string" ? r.value.trim().slice(0, 40) : "";
    if (!/^[A-Z0-9_]+$/.test(value) || taken.has(value)) value = stageValue(label, taken);
    taken.add(value);
    out.push({ value, label });
  }
  return out.length ? out : copy(fallback);
}

export function normalizePipeline(raw: unknown): PipelineConfig {
  const funnels = (raw as { funnels?: Record<string, unknown> } | null)?.funnels ?? {};
  return { funnels: Object.fromEntries(FUNNEL_KEYS.map((k) => [k, normalizeStages(funnels[k], DEFAULT_PIPELINE.funnels[k])])) };
}

export function parsePipeline(json: string | null | undefined): PipelineConfig {
  if (!json) return DEFAULT_PIPELINE;
  try { return normalizePipeline(JSON.parse(json)); } catch { return DEFAULT_PIPELINE; }
}

/** Which funnel a deal type uses. Unknown deal types use the financing funnel. */
export const funnelKey = (dealType: string) => (FUNNEL_KEYS.includes(dealType) ? dealType : "FINANCING");

/** Columns for a deal type. */
export const funnelStages = (cfg: PipelineConfig, dealType: string) => cfg.funnels[funnelKey(dealType)];

/** Where a tile sits: its saved stage if the funnel still has it, otherwise the funnel's first column. */
export const placeStage = (stages: readonly PipelineStage[], stage: string | null | undefined) => (stage && stages.some((s) => s.value === stage) ? stage : stages[0].value);

/** A project's column in its deal type's funnel. Older projects with no stage of their own follow their developer. */
export const projectStage = (cfg: PipelineConfig, p: { dealType: string; pipelineStage: string | null }, developerStage: string) =>
  placeStage(funnelStages(cfg, p.dealType), p.pipelineStage ?? developerStage);

/** Every stage in any funnel, first label wins. Used for companies that have no project (and so no deal type) yet. */
export function allStages(cfg: PipelineConfig): PipelineStage[] {
  const seen = new Map<string, PipelineStage>();
  for (const k of FUNNEL_KEYS) for (const s of cfg.funnels[k] ?? []) if (!seen.has(s.value)) seen.set(s.value, s);
  return [...seen.values()];
}

export const pipelineLabel = (stages: readonly PipelineStage[], v: string) => stages.find((s) => s.value === v)?.label ?? v;

/** The column name a project sits in, e.g. "Engagement Signed". */
export const projectStageLabel = (cfg: PipelineConfig, p: { dealType: string; pipelineStage: string | null }, developerStage: string) =>
  pipelineLabel(funnelStages(cfg, p.dealType), projectStage(cfg, p, developerStage));
