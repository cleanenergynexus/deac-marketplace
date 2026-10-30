// Investor CRM helpers shared by the board, contact record and lists. No database access here.
import type { PipelineStage } from "./pipeline";
import { csv } from "./format";
import { marketMatches } from "./regions";

/**
 * Marketplace steps that move an investor's tile forward on its own, and the Investor CRM column each one targets.
 * A step only moves a tile when the listing's funnel still has that column and the tile is in an earlier column.
 */
export const STEP_STAGE = {
  ADDED: "INTERESTED",
  FAVORITE: "INTERESTED",
  INTAKE: "INTERESTED",
  NDA: "NDA_SIGNED",
  LOI: "LOI_SUBMITTED",
  LOI_APPROVED: "LOI_ACCEPTED",
  DILIGENCE: "IN_DILIGENCE",
} as const;
export type InterestStep = keyof typeof STEP_STAGE;

/** Labels for InvestorInterest.source, saying how the investor came to the listing. */
export const STEP_SOURCE: Record<InterestStep, string> = {
  ADDED: "Added by team",
  FAVORITE: "Starred on marketplace",
  INTAKE: "Intake request",
  NDA: "NDA",
  LOI: "Letter of interest",
  LOI_APPROVED: "Letter of interest",
  DILIGENCE: "Diligence",
};

/**
 * Where a tile should sit after a marketplace step. Moves forward only: a tile already further along
 * (or moved by hand into a later column, including Closed / Passed) stays put.
 */
export function advanceStage(stages: readonly PipelineStage[], current: string | null | undefined, target: string): string {
  const at = (v?: string | null) => (v ? stages.findIndex((s) => s.value === v) : -1);
  const cur = at(current);
  const next = at(target);
  if (cur < 0) return next >= 0 ? target : stages[0].value; // new tile, or its column was removed
  return next > cur ? target : current!;
}

/** What an existing NDA / LOI / diligence / intake history says about how far an investor got on a listing. */
export function stepFromHistory(h: { nda?: string | null; loi?: string | null; diligence?: string | null; intake?: boolean }): InterestStep {
  if (h.diligence === "APPROVED") return "DILIGENCE";
  if (h.loi === "APPROVED") return "LOI_APPROVED";
  if (h.loi === "PENDING") return "LOI";
  if (h.nda === "APPROVED" || h.nda === "PENDING") return "NDA";
  return h.intake ? "INTAKE" : "ADDED";
}

type Mandate = { preferredStates: string; preferredRegions: string; dealTypes: string; facilityTypes: string; mwMin: number | null; mwMax: number | null };
type Listing = { state: string; country: string; dealType: string; facilityType: string; mw: number };

/** Does a listing fit an investor's stated mandate (markets, deal types, facility types, size)? Empty preferences match anything. */
export function fitsMandate(inv: Mandate, p: Listing): boolean {
  const deals = csv(inv.dealTypes), types = csv(inv.facilityTypes);
  return marketMatches(csv(inv.preferredStates), csv(inv.preferredRegions), p.state, p.country)
    && (!deals.length || deals.includes(p.dealType))
    && (!types.length || types.includes(p.facilityType))
    && (inv.mwMin == null || p.mw >= inv.mwMin)
    && (inv.mwMax == null || p.mw <= inv.mwMax);
}

/** Company names compare without case or extra spaces, so "Meridian  Partners" and "meridian partners" are one firm. */
export const firmKey = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/** Badge color for an investor's membership stage (Applied, Approved Member...). */
export const memberTone = (stage: string) => (stage === "APPLIED" ? "amber" : ["APPROVED", "ACTIVE"].includes(stage) ? "green" : stage === "DECLINED" ? "red" : "slate") as "amber" | "green" | "red" | "slate";
