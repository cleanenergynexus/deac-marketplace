// Port of "Interactive_Powered_Asset_Bid_Calculator_DEAC_v2.xlsx".
// Each function mirrors one Excel formula; cell references are noted so the two can be checked side by side.

export const ASSET_TYPES = ["Powered Land", "Powered Shell", "Mining Facility", "Industrial Conversion", "Old Data Center"] as const;

export const OPTIONS = {
  powerStatus: ["Live", "Signed", "Queued", "Speculative"],
  marketTier: ["Primary", "Secondary", "Tertiary"],
  infrastructure: ["Substation+Fiber+Roads", "Substation+Fiber", "Substation+Roads", "Fiber+Roads", "Substation Only", "Fiber Only", "Roads Only", "None"],
  environmentalRisk: ["Low", "Moderate", "High"],
  sellerMotivation: ["High", "Moderate", "Low"],
  fiber: ["Excellent", "Good", "Fair"],
  water: ["Excellent", "Good", "Fair"],
  entitlements: ["Fully Entitled", "Partial", "None"],
  backupPower: ["Yes", "Planned", "None"],
  substation: ["On-Site", "Nearby", "Distant"],
  density: ["Liquid Capable", "Air Only", "Limited"],
  transmission: ["High", "Medium", "Low"],
} as const;

export type ValuationInputs = {
  assetType: string; // B6
  mw: number; // B7 (0 = not entered)
  acres?: number; // B8
  askingPrice?: number; // B9
  powerStatus: string; // B12
  monthsToPower: number; // B13
  powerRateCents: number; // B14
  marketTier: string; // B15
  infrastructure: string; // B16
  expansionMw: number; // B17
  environmentalRisk: string; // B18
  sellerMotivation: string; // B19
  fiber: string; // B20
  water: string; // B21
  entitlements: string; // B22
  backupPower: string; // B23
  substation: string; // B24
  density: string; // B25
  transmission: string; // B26
};

// Defaults = the example saved in the workbook.
export const DEFAULT_INPUTS: ValuationInputs = {
  assetType: "Powered Land",
  mw: 0,
  acres: 0,
  askingPrice: 0,
  powerStatus: "Live",
  monthsToPower: 0,
  powerRateCents: 4.5,
  marketTier: "Secondary",
  infrastructure: "Substation+Fiber+Roads",
  expansionMw: 10,
  environmentalRisk: "Low",
  sellerMotivation: "Moderate",
  fiber: "Good",
  water: "Good",
  entitlements: "Fully Entitled",
  backupPower: "Yes",
  substation: "On-Site",
  density: "Liquid Capable",
  transmission: "High",
};

export const FACTOR_LABELS: Record<string, string> = {
  powerStatus: "Power Status",
  monthsToPower: "Months to Power",
  powerRate: "Power Rate",
  marketTier: "Market Tier",
  infrastructure: "Infrastructure Readiness",
  expansion: "Expansion Potential",
  environmentalRisk: "Environmental Risk",
  sellerMotivation: "Seller Motivation",
  fiber: "Fiber / Connectivity",
  water: "Water Availability",
  entitlements: "Entitlements / Zoning",
  backupPower: "Backup Power",
  substation: "Substation Proximity",
  density: "Density Readiness",
  transmission: "Transmission Voltage",
};

const round = (n: number, d = 0) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

const pick = <T,>(v: string, map: Record<string, T>, fallback: T) => (v in map ? map[v] : fallback);

// B29 — base benchmark $/MW (Benchmarks sheet)
export const BENCHMARKS: Record<string, [number, number, number]> = {
  "Powered Land": [584000, 420000, 280000],
  "Powered Shell": [2800000, 2100000, 1400000],
  "Mining Facility": [720000, 520000, 350000],
  "Industrial Conversion": [850000, 620000, 420000],
  "Old Data Center": [450000, 320000, 200000],
};
export function baseBenchmark(assetType: string, tier: string): number {
  const row = BENCHMARKS[assetType];
  if (!row) return 500000;
  return tier === "Primary" ? row[0] : tier === "Secondary" ? row[1] : row[2];
}

type InfraLevel = "all" | "two" | "one" | "none";
const infraLevel = (v: string): InfraLevel =>
  v === "Substation+Fiber+Roads" ? "all" : ["Substation+Fiber", "Substation+Roads", "Fiber+Roads"].includes(v) ? "two" : ["Substation Only", "Fiber Only", "Roads Only"].includes(v) ? "one" : "none";

/** Column D (weight multipliers) and column F (+/- adjustment shown to the user), rows 12–26. */
export function factorBreakdown(i: ValuationInputs) {
  const m = i.monthsToPower;
  const r = i.powerRateCents;
  const hasMw = i.mw > 0;
  const infra = infraLevel(i.infrastructure);
  // D17 / F17
  const expRaw = hasMw ? (Math.min(i.expansionMw, i.mw * 2) / Math.max(i.mw, 1)) * 0.075 : i.expansionMw * 0.005;
  const expansionWeight = Math.min(1.15, 1 + expRaw);
  const expansionAdj = Math.min(0.15, Math.max(-0.08, hasMw ? expRaw - 0.04 : expRaw));

  const rows: Record<string, { weight: number; adj: number }> = {
    powerStatus: pick(i.powerStatus, { Live: { weight: 1.25, adj: 0.25 }, Signed: { weight: 1.05, adj: 0.05 }, Queued: { weight: 0.75, adj: -0.25 } }, { weight: 0.5, adj: -0.5 }),
    monthsToPower: m <= 6 ? { weight: 1.25, adj: 0.25 } : m <= 12 ? { weight: 1.05, adj: 0.05 } : m <= 18 ? { weight: 0.9, adj: -0.1 } : m <= 36 ? { weight: 0.6, adj: -0.4 } : { weight: 0.4, adj: -0.6 },
    powerRate: r <= 4 ? { weight: 1.2, adj: 0.2 } : r <= 5 ? { weight: 1.05, adj: 0.05 } : r <= 6 ? { weight: 0.9, adj: -0.1 } : { weight: 0.7, adj: -0.3 },
    marketTier: pick(i.marketTier, { Primary: { weight: 1.12, adj: 0.12 }, Secondary: { weight: 1, adj: 0 } }, { weight: 0.85, adj: -0.15 }),
    infrastructure: { all: { weight: 1.15, adj: 0.15 }, two: { weight: 1.05, adj: 0.05 }, one: { weight: 0.95, adj: -0.05 }, none: { weight: 0.75, adj: -0.25 } }[infra],
    expansion: { weight: expansionWeight, adj: expansionAdj },
    environmentalRisk: pick(i.environmentalRisk, { Low: { weight: 1.05, adj: 0.05 }, Moderate: { weight: 0.95, adj: -0.05 } }, { weight: 0.7, adj: -0.3 }),
    sellerMotivation: pick(i.sellerMotivation, { High: { weight: 1.05, adj: 0.05 }, Moderate: { weight: 1, adj: 0 } }, { weight: 0.92, adj: -0.08 }),
    fiber: pick(i.fiber, { Excellent: { weight: 1.08, adj: 0.08 }, Good: { weight: 1, adj: 0 } }, { weight: 0.88, adj: -0.12 }),
    water: pick(i.water, { Excellent: { weight: 1.05, adj: 0.05 }, Good: { weight: 1, adj: 0 } }, { weight: 0.85, adj: -0.15 }),
    entitlements: pick(i.entitlements, { "Fully Entitled": { weight: 1.12, adj: 0.12 }, Partial: { weight: 1, adj: 0 } }, { weight: 0.8, adj: -0.2 }),
    backupPower: pick(i.backupPower, { Yes: { weight: 1.08, adj: 0.08 }, Planned: { weight: 1.02, adj: 0.02 } }, { weight: 0.9, adj: -0.1 }),
    substation: pick(i.substation, { "On-Site": { weight: 1.1, adj: 0.1 }, Nearby: { weight: 1, adj: 0 } }, { weight: 0.82, adj: -0.18 }),
    density: pick(i.density, { "Liquid Capable": { weight: 1.12, adj: 0.12 }, "Air Only": { weight: 1, adj: 0 } }, { weight: 0.85, adj: -0.15 }),
    transmission: pick(i.transmission, { High: { weight: 1.08, adj: 0.08 }, Medium: { weight: 1, adj: 0 } }, { weight: 0.88, adj: -0.12 }),
  };
  return rows;
}

// B38 — value score. Note: like the workbook, this can exceed 100 (max ≈ 130).
export function valueScore(i: ValuationInputs): number {
  const s =
    pick(i.powerStatus, { Live: 25, Signed: 18, Queued: 9 }, 3) +
    Math.max(0, 16 - i.monthsToPower * 0.35) +
    Math.max(0, 14 - i.powerRateCents * 1.8) +
    pick(i.marketTier, { Primary: 6, Secondary: 7 }, 4) +
    (infraLevel(i.infrastructure) === "all" ? 11 : 8) +
    Math.min(9, i.expansionMw * 0.3) +
    pick(i.environmentalRisk, { Low: 7, Moderate: 4 }, 1) +
    (i.fiber === "Excellent" ? 7 : 4) +
    (i.water === "Excellent" ? 5 : 3) +
    (i.entitlements === "Fully Entitled" ? 8 : 5) +
    (i.backupPower === "Yes" ? 6 : 3) +
    (i.substation === "On-Site" ? 7 : 4) +
    (i.density === "Liquid Capable" ? 7 : 4) +
    (i.transmission === "High" ? 6 : 3);
  return round(s, 0);
}

// B39
export function recommendation(score: number): { label: "Buy" | "Negotiate" | "Walk Away"; tone: "green" | "amber" | "red" } {
  if (score >= 70) return { label: "Buy", tone: "green" };
  if (score >= 50) return { label: "Negotiate", tone: "amber" };
  return { label: "Walk Away", tone: "red" };
}

export function evaluate(i: ValuationInputs) {
  const factors = factorBreakdown(i);
  const base = baseBenchmark(i.assetType, i.marketTier); // B29
  const adjustmentFactor = round(Object.values(factors).reduce((a, f) => a * f.weight, 1), 2); // B30
  const adjustedValueMw = base * adjustmentFactor; // B31
  const perMw = { good: adjustedValueMw * 0.85, market: adjustedValueMw, high: adjustedValueMw * 1.1 }; // B32–B34
  const hasMw = i.mw > 0;
  const score = valueScore(i);
  const asking = i.askingPrice && i.askingPrice > 0 ? i.askingPrice : null;
  return {
    base,
    factors,
    adjustmentFactor,
    adjustedValueMw,
    perMw,
    total: hasMw ? { good: perMw.good * i.mw, market: perMw.market * i.mw, high: perMw.high * i.mw } : null, // B35–B37
    score,
    recommendation: recommendation(score),
    // Not in the workbook: asking price vs. market value, shown when both are entered.
    askingVsMarket: asking && hasMw ? asking / (perMw.market * i.mw) - 1 : null,
  };
}

export function parseInputs(json?: string | null): ValuationInputs | null {
  if (!json) return null;
  try {
    return { ...DEFAULT_INPUTS, ...JSON.parse(json) };
  } catch {
    return null;
  }
}

// ---------- "Operating DC Value" sheet (marked inactive in the workbook; included for operating assets) ----------
export const TENANT_QUALITY = ["Investment Grade", "Non-IG / Corporate", "Speculative"] as const;

export type OperatingInputs = {
  mwIt: number; // B5
  leaseRateKwMo: number; // B6
  occupancyPct: number; // B7
  tenantQuality: string; // B8
  leaseTermYears: number; // B9
  escalatorPct: number; // B10 (informational in the workbook)
  powerCostCents: number; // B11
  powerEscalatorPct: number; // B12 (informational in the workbook)
  opexPct: number; // B13
  capRatePct: number; // B14
};

export const DEFAULT_OPERATING: OperatingInputs = {
  mwIt: 10, leaseRateKwMo: 175, occupancyPct: 95, tenantQuality: "Investment Grade", leaseTermYears: 10, escalatorPct: 3, powerCostCents: 5.5, powerEscalatorPct: 2, opexPct: 18, capRatePct: 6,
};

export function evaluateOperating(i: OperatingInputs) {
  const revenue = i.mwIt * 1000 * i.leaseRateKwMo * 12 * (i.occupancyPct / 100); // B17
  const powerCost = i.mwIt * 1000 * (i.powerCostCents / 100) * 8760 * (i.occupancyPct / 100); // B18
  const opex = revenue * (i.opexPct / 100); // B19
  const noi = revenue - powerCost - opex; // B20
  const adjCapRate = // B23
    i.capRatePct +
    (i.tenantQuality === "Investment Grade" ? -0.5 : i.tenantQuality === "Non-IG / Corporate" ? 0.25 : 0.75) +
    (i.leaseTermYears >= 12 ? -0.25 : i.leaseTermYears >= 7 ? 0 : 0.25);
  const value = adjCapRate === 0 ? null : noi / (adjCapRate / 100); // B21
  const valuePerMw = value != null && i.mwIt !== 0 ? value / i.mwIt : null; // B22
  return { revenue, powerCost, opex, noi, adjCapRate, value, valuePerMw };
}
