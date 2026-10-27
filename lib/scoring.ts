// Editable value-score model (Admin → Scoring settings).
// The defaults reproduce the workbook's value score (B38) exactly, so scores don't change until an admin edits them.
import { OPTIONS } from "@/lib/valuation-options";

export type LevelKey = keyof typeof OPTIONS;
export type NumericKey = "monthsToPower" | "powerRate" | "expansion";

/** Points for each selection level, times the factor's weight. */
export type LevelFactor = { weight: number; points: Record<string, number> };
/** Points = start + perUnit × input, kept between 0 and max, times the factor's weight. */
export type NumericFactor = { weight: number; start: number; perUnit: number; max: number };

export type ScoringConfig = {
  levels: Record<LevelKey, LevelFactor>;
  numeric: Record<NumericKey, NumericFactor>;
  thresholds: { buy: number; negotiate: number };
  /** Rescale the total so the best possible site scores 100. Off in the workbook (its max is 135). */
  scaleTo100: boolean;
};

export const LEVEL_ORDER: LevelKey[] = ["powerStatus", "marketTier", "infrastructure", "environmentalRisk", "sellerMotivation", "fiber", "water", "entitlements", "backupPower", "substation", "density", "transmission"];
export const NUMERIC_ORDER: NumericKey[] = ["monthsToPower", "powerRate", "expansion"];

export const SCORING_LABELS: Record<LevelKey | NumericKey, string> = {
  powerStatus: "Power status",
  monthsToPower: "Months to power",
  powerRate: "Power rate",
  marketTier: "Market tier",
  infrastructure: "Infrastructure readiness",
  expansion: "Expansion potential",
  environmentalRisk: "Environmental risk",
  sellerMotivation: "Seller motivation",
  fiber: "Fiber / connectivity",
  water: "Water availability",
  entitlements: "Entitlements / zoning",
  backupPower: "Backup power / generators",
  substation: "Substation proximity",
  density: "Density readiness",
  transmission: "Transmission voltage",
};

export const NUMERIC_UNITS: Record<NumericKey, string> = { monthsToPower: "month", powerRate: "¢/kWh", expansion: "MW" };

const lv = (key: LevelKey, pts: number[]): LevelFactor => ({ weight: 1, points: Object.fromEntries(OPTIONS[key].map((o, idx) => [o, pts[idx]])) });

export const DEFAULT_SCORING: ScoringConfig = {
  levels: {
    powerStatus: lv("powerStatus", [25, 18, 9, 3]),
    marketTier: lv("marketTier", [6, 7, 4]),
    infrastructure: lv("infrastructure", [11, 8, 8, 8, 8, 8, 8, 8]),
    environmentalRisk: lv("environmentalRisk", [7, 4, 1]),
    sellerMotivation: lv("sellerMotivation", [0, 0, 0]), // not part of the workbook score
    fiber: lv("fiber", [7, 4, 4]),
    water: lv("water", [5, 3, 3]),
    entitlements: lv("entitlements", [8, 5, 5]),
    backupPower: lv("backupPower", [6, 3, 3]),
    substation: lv("substation", [7, 4, 4]),
    density: lv("density", [7, 4, 4]),
    transmission: lv("transmission", [6, 3, 3]),
  },
  numeric: {
    monthsToPower: { weight: 1, start: 16, perUnit: -0.35, max: 16 },
    powerRate: { weight: 1, start: 14, perUnit: -1.8, max: 14 },
    expansion: { weight: 1, start: 0, perUnit: 0.3, max: 9 },
  },
  thresholds: { buy: 70, negotiate: 50 },
  scaleTo100: false,
};

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

/** Fills anything missing or invalid from the defaults, so a saved config always matches the current factor list. */
export function normalizeScoring(raw: unknown): ScoringConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof ScoringConfig, any>>;
  const d = DEFAULT_SCORING;
  return {
    levels: Object.fromEntries(LEVEL_ORDER.map((k) => {
      const src = r.levels?.[k] ?? {};
      return [k, {
        weight: Math.max(0, num(src.weight, d.levels[k].weight)),
        points: Object.fromEntries(OPTIONS[k].map((o) => [o, num(src.points?.[o], d.levels[k].points[o])])),
      }];
    })) as ScoringConfig["levels"],
    numeric: Object.fromEntries(NUMERIC_ORDER.map((k) => {
      const src = r.numeric?.[k] ?? {};
      const def = d.numeric[k];
      return [k, { weight: Math.max(0, num(src.weight, def.weight)), start: num(src.start, def.start), perUnit: num(src.perUnit, def.perUnit), max: Math.max(0, num(src.max, def.max)) }];
    })) as ScoringConfig["numeric"],
    thresholds: { buy: num(r.thresholds?.buy, d.thresholds.buy), negotiate: num(r.thresholds?.negotiate, d.thresholds.negotiate) },
    scaleTo100: typeof r.scaleTo100 === "boolean" ? r.scaleTo100 : d.scaleTo100,
  };
}

export function parseScoring(json?: string | null): ScoringConfig {
  if (!json) return DEFAULT_SCORING;
  try { return normalizeScoring(JSON.parse(json)); } catch { return DEFAULT_SCORING; }
}

/** Points for a selection. An unknown value scores like the last (weakest) level, as in the workbook. */
export function levelPoints(cfg: ScoringConfig, key: LevelKey, value: string): number {
  const f = cfg.levels[key];
  const opts = OPTIONS[key];
  const p = value in f.points ? f.points[value] : f.points[opts[opts.length - 1]];
  return p * f.weight;
}

export function numericPoints(cfg: ScoringConfig, key: NumericKey, x: number): number {
  const f = cfg.numeric[key];
  return Math.min(f.max, Math.max(0, f.start + f.perUnit * x)) * f.weight;
}

/** Best possible raw total (each factor's best level / numeric cap, times its weight). */
export function maxRawScore(cfg: ScoringConfig): number {
  const lvl = LEVEL_ORDER.reduce((a, k) => a + Math.max(0, ...Object.values(cfg.levels[k].points)) * cfg.levels[k].weight, 0);
  const nm = NUMERIC_ORDER.reduce((a, k) => a + cfg.numeric[k].max * cfg.numeric[k].weight, 0);
  return lvl + nm;
}

export function scoreLabel(score: number, cfg: ScoringConfig = DEFAULT_SCORING): { label: "Buy" | "Negotiate" | "Walk Away"; tone: "green" | "amber" | "red" } {
  if (score >= cfg.thresholds.buy) return { label: "Buy", tone: "green" };
  if (score >= cfg.thresholds.negotiate) return { label: "Negotiate", tone: "amber" };
  return { label: "Walk Away", tone: "red" };
}
