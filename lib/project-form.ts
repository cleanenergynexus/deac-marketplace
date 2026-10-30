// Reads the listing form (ProjectForm) into Project fields. Shared by the team's listing actions and the referral agent import.
import { DEFAULT_INPUTS, type ValuationInputs } from "./valuation";
import { locationFromForm } from "./location";

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;
const n = (f: FormData, k: string) => { const v = s(f, k); return v ? Number(v.replace(/[$,%]/g, "")) : null; };

export function projectData(f: FormData) {
  return {
    title: s(f, "title") ?? "",
    developerId: String(f.get("developerId")),
    ...locationFromForm(f),
    mw: n(f, "mw") ?? 0,
    facilityType: s(f, "facilityType") ?? "",
    dealType: s(f, "dealType") ?? "FINANCING",
    fundingNeeded: n(f, "fundingNeeded") ?? 0,
    projectStatus: s(f, "projectStatus") ?? "",
    summary: s(f, "summary") ?? "",
    highlights: s(f, "highlights") ?? "",
    term: s(f, "term"),
    dealStage: s(f, "dealStage") ?? "MARKETING",
    useOfFunds: s(f, "useOfFunds") ?? "",
    coverImageUrl: s(f, "coverImageUrl"),
    totalCapex: n(f, "totalCapex"),
    targetIrr: n(f, "targetIrr"),
    equityMultiple: n(f, "equityMultiple"),
    leaseRateKwMo: n(f, "leaseRateKwMo"),
    powerRateCents: n(f, "powerRateCents"),
    powerStatus: s(f, "powerStatus"),
    monthsToPower: n(f, "monthsToPower") ?? null,
    codDate: s(f, "codDate"),
    capitalStack: s(f, "capitalStack"),
    economicsNotes: s(f, "economicsNotes"),
    visibility: s(f, "visibility") ?? "DRAFT",
  };
}

/** Scoring hints from an imported document, kept only if they are valid calculator values. JSON, or null when there are none. */
export function importedValuation(f: FormData, data: { mw: number; dealType: string; fundingNeeded: number }): string | null {
  try {
    const raw = JSON.parse(String(f.get("valuation") ?? "{}"));
    const clean = Object.fromEntries(Object.entries(raw).filter(([k, v]) => k in DEFAULT_INPUTS && typeof v === typeof DEFAULT_INPUTS[k as keyof ValuationInputs]));
    if (data.mw) clean.mw = data.mw;
    if (data.dealType === "SALE" && data.fundingNeeded) clean.askingPrice = data.fundingNeeded;
    return Object.keys(clean).length ? JSON.stringify(clean) : null;
  } catch {
    return null; // no hints
  }
}
