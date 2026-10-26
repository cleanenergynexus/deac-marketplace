// Staged disclosure: what an investor sees on a listing as they move through
// teaser -> NDA -> LOI -> full diligence. Each step past the teaser is confirmed by an admin.

export const STAGES = ["TEASER", "NDA", "LOI", "DILIGENCE"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_INFO: Record<Stage, { label: string; step: string; unlock: string }> = {
  TEASER: { label: "Teaser", step: "Teaser", unlock: "Visible to every approved member" },
  NDA: { label: "NDA signed", step: "Sign NDA", unlock: "Unlocks once your NDA is confirmed" },
  LOI: { label: "LOI accepted", step: "Letter of interest", unlock: "Unlocks once your letter of interest is accepted" },
  DILIGENCE: { label: "Full diligence", step: "Full data room", unlock: "Unlocks once full diligence access is confirmed" },
};

export const stageRank = (s: Stage) => STAGES.indexOf(s);
export const atLeast = (have: Stage, need: Stage) => stageRank(have) >= stageRank(need);
export const isStage = (v: unknown): v is Stage => typeof v === "string" && (STAGES as readonly string[]).includes(v);

/** Document.access -> stage. Older rows used SUMMARY (all members) and DATAROOM (after LOI). */
export function docStage(access: string): Stage {
  if (access === "SUMMARY") return "TEASER";
  if (access === "DATAROOM") return "LOI";
  return isStage(access) ? access : "LOI";
}

/** Listing sections whose visibility the admin sets per project. */
export const SECTIONS = [
  { key: "overview", label: "Summary & highlights", default: "TEASER" },
  { key: "power", label: "Power & schedule (power status, rate, months to power, COD)", default: "NDA" },
  { key: "sponsor", label: "Sponsor identity, track record & team", default: "NDA" },
  { key: "returns", label: "Returns (capex, target IRR, equity multiple, lease rate)", default: "LOI" },
  { key: "capital", label: "Capital stack & economics notes", default: "LOI" },
] as const satisfies readonly { key: string; label: string; default: Stage }[];
export type SectionKey = (typeof SECTIONS)[number]["key"];
export type Disclosure = Record<SectionKey, Stage>;

export const DEFAULT_DISCLOSURE = Object.fromEntries(SECTIONS.map((s) => [s.key, s.default])) as Disclosure;

/** Parses Project.disclosure JSON; unknown or missing keys fall back to defaults. */
export function parseDisclosure(json?: string | null): Disclosure {
  let raw: Record<string, unknown> = {};
  try {
    const v = json ? JSON.parse(json) : {};
    if (v && typeof v === "object" && !Array.isArray(v)) raw = v;
  } catch {}
  const out = { ...DEFAULT_DISCLOSURE };
  for (const s of SECTIONS) if (isStage(raw[s.key])) out[s.key] = raw[s.key] as Stage;
  return out;
}

export type StepStatus = "NONE" | "PENDING" | "APPROVED" | "DECLINED";

/**
 * The stage an investor has reached on one listing. Each stage counts only when
 * the step itself is admin-approved; a later approved step implies the earlier ones.
 * A master NDA on the investor record counts as the NDA for every listing.
 */
export function investorStage(x: { masterNda?: boolean; nda?: StepStatus; loi?: StepStatus; diligence?: StepStatus }): Stage {
  if (x.diligence === "APPROVED") return "DILIGENCE";
  if (x.loi === "APPROVED") return "LOI";
  if (x.nda === "APPROVED" || x.masterNda) return "NDA";
  return "TEASER";
}

/** The next step an investor can take, and whether it's waiting on the team. */
export function nextStep(stage: Stage, s: { nda?: StepStatus; loi?: StepStatus; diligence?: StepStatus }): { step: Exclude<Stage, "TEASER"> | null; status: StepStatus } {
  if (stage === "TEASER") return { step: "NDA", status: s.nda ?? "NONE" };
  if (stage === "NDA") return { step: "LOI", status: s.loi ?? "NONE" };
  if (stage === "LOI") return { step: "DILIGENCE", status: s.diligence ?? "NONE" };
  return { step: null, status: "APPROVED" };
}
