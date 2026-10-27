// Project import wizard: the JSON schema Claude fills from a deal document, and the code that
// turns its answer into a listing draft. Pure functions only, so they can be unit tested.
import { DEAL_TYPES, FACILITY_TYPES, PROJECT_STATUSES, US_STATES } from "@/lib/constants";
import { ASSET_TYPES, OPTIONS, type ValuationInputs } from "@/lib/valuation";

// Structured outputs allow at most 16 nullable (union) fields per request, so instead of null an unknown
// value comes back as "" (text and choices) or -1 (numbers). Every field is required.
const str = { type: "string" } as const;
const nStr = str;
const nNum = { type: "number" } as const;
const nEnum = (values: readonly string[]) => ({ type: "string", enum: ["", ...values] });

const SCORING_KEYS = ["marketTier", "infrastructure", "environmentalRisk", "sellerMotivation", "fiber", "water", "entitlements", "backupPower", "substation", "density", "transmission"] as const;
type ScoringKey = (typeof SCORING_KEYS)[number];

const contact = {
  type: "object",
  properties: { name: nStr, company: nStr, role: nStr, email: nStr, phone: nStr },
  required: ["name", "company", "role", "email", "phone"],
  additionalProperties: false,
};

/** Shape of Claude's answer. Unknown values come back as "" or -1. */
export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    title: str,
    sponsorCompany: nStr,
    sponsorWebsite: nStr,
    contacts: { type: "array", items: contact },
    state: nEnum(US_STATES),
    city: nStr,
    address: nStr,
    mw: nNum,
    expansionMw: nNum,
    acres: nNum,
    buildingSqft: nNum,
    facilityType: nEnum(FACILITY_TYPES),
    dealType: nEnum(DEAL_TYPES.map((d) => d.value)),
    fundingNeeded: nNum,
    projectStatus: nEnum(PROJECT_STATUSES),
    summary: str,
    highlights: { type: "array", items: str },
    totalCapex: nNum,
    targetIrr: nNum,
    equityMultiple: nNum,
    leaseRateKwMo: nNum,
    powerRateCents: nNum,
    powerStatus: nEnum(OPTIONS.powerStatus),
    monthsToPower: nNum,
    codDate: nStr,
    capitalStack: nStr,
    economicsNotes: nStr,
    utility: nStr,
    scoring: {
      type: "object",
      properties: Object.fromEntries(SCORING_KEYS.map((k) => [k, nEnum(OPTIONS[k])])),
      required: [...SCORING_KEYS],
      additionalProperties: false,
    },
    missing: { type: "array", items: str },
  },
  required: [
    "title", "sponsorCompany", "sponsorWebsite", "contacts", "state", "city", "address", "mw", "expansionMw", "acres", "buildingSqft",
    "facilityType", "dealType", "fundingNeeded", "projectStatus", "summary", "highlights", "totalCapex", "targetIrr", "equityMultiple",
    "leaseRateKwMo", "powerRateCents", "powerStatus", "monthsToPower", "codDate", "capitalStack", "economicsNotes", "utility", "scoring", "missing",
  ],
  additionalProperties: false,
} as const;

export const EXTRACTION_PROMPT = `You are an analyst at DEAC, a curated marketplace for data center deals (powered land, powered shells, data centers) that are offered for lease, sale or investment.
Read the attached deal document (teaser, offering memorandum, broker flyer, listing web page, email...) and fill in the listing fields. Rules:
- Use only facts stated in the document. Never guess numbers. When a value is not stated, use "" for text and choices, and -1 for numbers.
- mw: power available now or contracted for the first phase, in MW (convert kVA/kW; 1 MVA ≈ 1 MW). expansionMw: additional MW described as future or scalable capacity.
- fundingNeeded: the asking price (for sale), or the capital raise / funding sought, in US dollars. -1 if not stated.
- dealType: SALE, LEASE or FINANCING. If the document offers both sale and lease, pick SALE and mention the lease option in economicsNotes.
- facilityType: the closest option. A building with power ready for data center fit-out is "Powered Shell"; land with power is "Powered Land"; an existing operating data center is "Turnkey Data Center" or "Old Data Center".
- projectStatus: the development stage that fits best ("Operating" only if a data center operates there today).
- powerStatus: Live if power is energized on site today; Signed if a utility agreement is signed; Queued if in the interconnection queue; Speculative otherwise.
- powerRateCents in ¢/kWh, leaseRateKwMo in $/kW/month, targetIrr in percent, monthsToPower as whole months until power is available (0 if live now).
- title: a short marketing title such as "Pittsburgh Powered Shell – 3.5 MW". summary: 2–4 neutral sentences an institutional investor would want. highlights: up to 8 short bullet points (no leading bullet characters).
- sponsorCompany: the owner, developer or sponsor offering the project (not the broker, unless no one else is named). contacts: every person listed, with role such as "Sponsor", "Broker", "Owner".
- scoring: fill a factor only when the document supports it (e.g. fiber "Excellent" when many providers are on site; backupPower "Yes" when a generator is on site; substation "On-Site" when transformers or a substation are on site).
- missing: the key investor facts the document does not give (e.g. "asking price", "lease rate", "power rate").`;

// ---------- Turning the answer into a listing draft ----------

export type ExtractedContact = { name: string | null; company: string | null; role: string | null; email: string | null; phone: string | null };
export type Extraction = {
  title: string;
  sponsorCompany: string | null;
  sponsorWebsite: string | null;
  contacts: ExtractedContact[];
  state: string | null;
  city: string | null;
  address: string | null;
  mw: number | null;
  expansionMw: number | null;
  acres: number | null;
  buildingSqft: number | null;
  facilityType: string | null;
  dealType: string | null;
  fundingNeeded: number | null;
  projectStatus: string | null;
  summary: string;
  highlights: string[];
  totalCapex: number | null;
  targetIrr: number | null;
  equityMultiple: number | null;
  leaseRateKwMo: number | null;
  powerRateCents: number | null;
  powerStatus: string | null;
  monthsToPower: number | null;
  codDate: string | null;
  capitalStack: string | null;
  economicsNotes: string | null;
  utility: string | null;
  scoring: Partial<Record<ScoringKey, string | null>>;
  missing: string[];
};

/** Prefilled values for the listing form. Strings, because they go straight into form inputs. */
export type ListingDraft = {
  title: string; state: string; city: string; mw: string; facilityType: string; dealType: string; fundingNeeded: string; projectStatus: string;
  summary: string; highlights: string;
  totalCapex: string; targetIrr: string; equityMultiple: string; leaseRateKwMo: string; powerRateCents: string; powerStatus: string;
  monthsToPower: string; codDate: string; capitalStack: string; economicsNotes: string;
};

export type DeveloperDraft = { company: string; contactName: string; email: string; phone: string; website: string };

export type ImportResult = {
  listing: ListingDraft;
  developer: DeveloperDraft;
  /** Existing developer whose company matches the sponsor, if any. */
  developerMatchId: string | null;
  /** Partial calculator inputs; the calculator fills the rest with its defaults. */
  valuation: Partial<ValuationInputs>;
  contacts: ExtractedContact[];
  missing: string[];
  /** Field names the document did not give a value for, to highlight in the form. */
  blank: string[];
};

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const pick = <T extends string>(v: unknown, allowed: readonly T[]) => (typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : "");
const asText = (v: number | null) => (v == null ? "" : String(Math.round(v * 100) / 100));

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/(llc|inc|corp|ltd|lp|co)$/, "");

/** Finds an existing developer whose company name matches the sponsor. */
export function matchDeveloper(sponsor: string, developers: { id: string; company: string }[]) {
  const key = normalize(sponsor);
  if (key.length < 3) return null;
  const hit = developers.find((d) => normalize(d.company) === key) ?? developers.find((d) => { const k = normalize(d.company); return k.length >= 3 && (k.includes(key) || key.includes(k)); });
  return hit?.id ?? null;
}

export function toImportResult(raw: Extraction, developers: { id: string; company: string }[]): ImportResult {
  const facilityType = pick(raw.facilityType, FACILITY_TYPES);
  const mw = numOrNull(raw.mw);
  const expansionMw = numOrNull(raw.expansionMw);
  const powerRateCents = numOrNull(raw.powerRateCents);
  const monthsToPower = numOrNull(raw.monthsToPower);
  const fundingNeeded = numOrNull(raw.fundingNeeded);

  const sqft = numOrNull(raw.buildingSqft);
  const acres = numOrNull(raw.acres);
  const site = [clean(raw.address), sqft ? `${Math.round(sqft).toLocaleString("en-US")} SF building` : "", acres ? `${acres} acres` : "", raw.utility ? `Utility: ${clean(raw.utility)}` : "", expansionMw ? `Expansion: +${expansionMw} MW` : ""].filter(Boolean);
  const economicsNotes = [clean(raw.economicsNotes), site.join(" · ")].filter(Boolean).join("\n");

  const listing: ListingDraft = {
    title: clean(raw.title),
    state: pick(raw.state, US_STATES),
    city: clean(raw.city),
    mw: asText(mw),
    facilityType,
    dealType: pick(raw.dealType, DEAL_TYPES.map((d) => d.value)),
    fundingNeeded: asText(fundingNeeded),
    projectStatus: pick(raw.projectStatus, PROJECT_STATUSES),
    summary: clean(raw.summary),
    highlights: (raw.highlights ?? []).map((h) => clean(h).replace(/^[-•●*]\s*/, "")).filter(Boolean).join("\n"),
    totalCapex: asText(numOrNull(raw.totalCapex)),
    targetIrr: asText(numOrNull(raw.targetIrr)),
    equityMultiple: asText(numOrNull(raw.equityMultiple)),
    leaseRateKwMo: asText(numOrNull(raw.leaseRateKwMo)),
    powerRateCents: asText(powerRateCents),
    powerStatus: pick(raw.powerStatus, OPTIONS.powerStatus),
    monthsToPower: monthsToPower == null ? "" : String(Math.round(monthsToPower)),
    codDate: clean(raw.codDate),
    capitalStack: clean(raw.capitalStack),
    economicsNotes,
  };

  const contacts = (raw.contacts ?? []).filter((c) => c && (c.name || c.email));
  const sponsor = clean(raw.sponsorCompany);
  const sponsorContact =
    contacts.find((c) => sponsor && clean(c.company) && normalize(clean(c.company)).includes(normalize(sponsor).slice(0, 6))) ??
    contacts.find((c) => !/broker/i.test(c.role ?? "")) ??
    contacts[0];
  const developer: DeveloperDraft = {
    company: sponsor || clean(sponsorContact?.company),
    contactName: clean(sponsorContact?.name),
    email: clean(sponsorContact?.email),
    phone: clean(sponsorContact?.phone),
    website: clean(raw.sponsorWebsite),
  };

  const valuation: Partial<ValuationInputs> = {};
  if (pick(facilityType, ASSET_TYPES)) valuation.assetType = facilityType;
  if (mw != null) valuation.mw = mw;
  if (acres) valuation.acres = acres;
  if (fundingNeeded != null && listing.dealType === "SALE") valuation.askingPrice = fundingNeeded;
  if (listing.powerStatus) valuation.powerStatus = listing.powerStatus;
  if (monthsToPower != null) valuation.monthsToPower = Math.round(monthsToPower);
  if (powerRateCents != null) valuation.powerRateCents = powerRateCents;
  if (expansionMw != null) valuation.expansionMw = expansionMw;
  for (const k of SCORING_KEYS) {
    const v = pick(raw.scoring?.[k], OPTIONS[k]);
    if (v) (valuation as Record<string, unknown>)[k] = v;
  }

  const required: (keyof ListingDraft)[] = ["title", "state", "mw", "facilityType", "dealType", "fundingNeeded", "projectStatus", "summary"];
  return {
    listing,
    developer,
    developerMatchId: developer.company ? matchDeveloper(developer.company, developers) : null,
    valuation,
    contacts,
    missing: (raw.missing ?? []).map(clean).filter(Boolean),
    blank: required.filter((k) => !listing[k]),
  };
}

export const ACCEPTED_TYPES: Record<string, "pdf" | "image" | "text"> = {
  "application/pdf": "pdf",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
  "image/gif": "image",
  "text/plain": "text",
  "text/markdown": "text",
  "text/csv": "text",
  "text/html": "text",
};
/** Vercel rejects request bodies over 4.5 MB, so uploads are capped just under it. */
export const MAX_UPLOAD_BYTES = 4_400_000;
