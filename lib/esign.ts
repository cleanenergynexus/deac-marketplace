// E-signatures: pure helpers shared by the field editor, the signing page and the server (no Node or DB imports).
// Field positions are fractions of the page (0..1, top-left origin) so they don't depend on zoom or PDF units.
import { countryName } from "./phone";

export const DOC_KINDS = [
  { value: "NDA", label: "NDA / Confidentiality agreement" },
  { value: "LOI", label: "Letter of intent / interest" },
  { value: "CONTRACT", label: "Contract / agreement" },
  { value: "OTHER", label: "Other" },
] as const;
export type DocKind = (typeof DOC_KINDS)[number]["value"];
export const kindLabel = (k: string) => DOC_KINDS.find((d) => d.value === k)?.label.split(" / ")[0] ?? k;
export const isDocKind = (v: unknown): v is DocKind => DOC_KINDS.some((d) => d.value === v);

/** Who signs: an Investor CRM contact, a Developer CRM contact or a referral agent. */
export const SIGNER_TYPES = ["INVESTOR", "CONTACT", "AGENT"] as const;
export type SignerType = (typeof SIGNER_TYPES)[number];
export const SIGNER_LABEL: Record<SignerType, string> = { INVESTOR: "Investor", CONTACT: "Developer contact", AGENT: "Referral agent" };
/** Additional signers can also be DEAC team members (e.g. a countersignature). */
export const PARTY_LABEL: Record<string, string> = { ...SIGNER_LABEL, TEAM: "DEAC team" };

export const STATUS_LABEL: Record<string, string> = {
  TEMPLATE: "Template", DRAFT: "Draft", SENT: "Sent", VIEWED: "Viewed", SIGNED: "Signed", DECLINED: "Declined", VOIDED: "Voided",
};
export const statusBadge = (s: string): "slate" | "blue" | "amber" | "green" | "red" | "purple" =>
  (({ DRAFT: "slate", SENT: "blue", VIEWED: "amber", SIGNED: "green", DECLINED: "red", VOIDED: "slate", TEMPLATE: "purple" }) as const)[s as "DRAFT"] ?? "slate";
export const isOpen = (s: string) => s === "SENT" || s === "VIEWED";

/** The signer's details a field can show. Profile keys are prefilled from their CRM record. */
export const PROFILE_KEYS = ["name", "title", "company", "email", "phone", "street", "city", "region", "postalCode", "country"] as const;
export type ProfileKey = (typeof PROFILE_KEYS)[number];
export const PROFILE_LABEL: Record<ProfileKey, string> = {
  name: "Full name", title: "Title", company: "Company", email: "Email", phone: "Phone", street: "Address", city: "City", region: "State / region", postalCode: "Zip / postal code", country: "Country",
};

export const FIELD_TYPES = {
  SIGNATURE: { label: "Signature", w: 0.24, h: 0.045 },
  INITIALS: { label: "Initials", w: 0.08, h: 0.035 },
  DATE: { label: "Date signed", w: 0.16, h: 0.025 },
  NAME: { label: "Full name", w: 0.24, h: 0.025, key: "name" },
  TITLE: { label: "Title", w: 0.2, h: 0.025, key: "title" },
  COMPANY: { label: "Company", w: 0.26, h: 0.025, key: "company" },
  EMAIL: { label: "Email", w: 0.26, h: 0.025, key: "email" },
  PHONE: { label: "Phone", w: 0.18, h: 0.025, key: "phone" },
  ADDRESS: { label: "Full address", w: 0.4, h: 0.025 },
  STREET: { label: "Street", w: 0.3, h: 0.025, key: "street" },
  CITY: { label: "City", w: 0.16, h: 0.025, key: "city" },
  STATE: { label: "State", w: 0.1, h: 0.025, key: "region" },
  POSTAL: { label: "Zip", w: 0.1, h: 0.025, key: "postalCode" },
  COUNTRY: { label: "Country", w: 0.16, h: 0.025, key: "country" },
  TEXT: { label: "Text box", w: 0.24, h: 0.025 },
  CHECKBOX: { label: "Checkbox", w: 0.025, h: 0.018 },
} as const satisfies Record<string, { label: string; w: number; h: number; key?: ProfileKey }>;
export type FieldType = keyof typeof FIELD_TYPES;
export const isFieldType = (v: unknown): v is FieldType => typeof v === "string" && Object.hasOwn(FIELD_TYPES, v);

/** `signer` is who fills the field: 0 (or missing) = the recipient, 1..9 = an additional signer's slot. */
export type SignField = { id: string; type: FieldType; page: number; x: number; y: number; w: number; h: number; required: boolean; label?: string; signer?: number };
export const MAX_SIGNERS = 9;

/** Everything the signer entered. Signature and initials are PNG data URLs; custom fields are keyed by field id. */
export type SignValues = Partial<Record<ProfileKey, string>> & { signature?: string; initials?: string; custom?: Record<string, string> };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

/** Cleans field JSON from the editor: known types, on a real page, inside the page, at most 300. */
export function normalizeFields(raw: unknown, pageCount: number): SignField[] {
  if (!Array.isArray(raw)) return [];
  const out: SignField[] = [];
  const ids = new Set<string>();
  for (const item of raw.slice(0, 300)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (!isFieldType(o.type)) continue;
    const page = Math.trunc(num(o.page, -1));
    if (page < 0 || page >= Math.max(1, pageCount)) continue;
    const w = clamp(num(o.w, FIELD_TYPES[o.type].w), 0.01, 1);
    const h = clamp(num(o.h, FIELD_TYPES[o.type].h), 0.008, 1);
    let id = typeof o.id === "string" && /^[\w-]{1,40}$/.test(o.id) ? o.id : `f${out.length + 1}`;
    while (ids.has(id)) id += "x";
    ids.add(id);
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 80) : "";
    const signer = Math.trunc(num(o.signer, 0));
    out.push({
      id, type: o.type, page, x: clamp(num(o.x, 0), 0, 1 - w), y: clamp(num(o.y, 0), 0, 1 - h), w, h,
      required: o.required !== false && o.type !== "CHECKBOX" ? true : o.required === true, ...(label ? { label } : {}),
      ...(signer >= 1 && signer <= MAX_SIGNERS ? { signer } : {}),
    });
  }
  return out;
}

export function parseFields(json: string | null | undefined, pageCount: number): SignField[] {
  try { return normalizeFields(JSON.parse(json || "[]"), pageCount); } catch { return []; }
}

export function parseValues(json: string | null | undefined): SignValues {
  try {
    const v = JSON.parse(json || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}

/** The fields one signer fills (slot 0 = the recipient). */
export const fieldsFor = (fields: SignField[], slot: number) => fields.filter((f) => (f.signer ?? 0) === slot);

/** Where each signer stands. Slot 0 is the recipient; lower order signs first, equal orders sign together. */
export type PartyState = { slot: number; order: number; signed: boolean };

/** The signers whose turn it is now (nobody once everyone has signed). */
export function dueSlots(parties: PartyState[]): number[] {
  const waiting = parties.filter((p) => !p.signed);
  if (!waiting.length) return [];
  const next = Math.min(...waiting.map((p) => p.order));
  return waiting.filter((p) => p.order === next).map((p) => p.slot);
}
export const allSigned = (parties: PartyState[]) => parties.every((p) => p.signed);

/** "1st", "2nd"... for the signing order pickers. */
export const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

/** Colours that tell the signers apart in the editor and on the signing page (slot 0 = recipient). */
export const SIGNER_COLORS = [
  "border-brand-500 bg-brand-100/70 text-brand-700",
  "border-violet-500 bg-violet-100/70 text-violet-900",
  "border-emerald-500 bg-emerald-100/70 text-emerald-900",
  "border-rose-500 bg-rose-100/70 text-rose-900",
  "border-cyan-500 bg-cyan-100/70 text-cyan-900",
];
export const signerColor = (slot: number) => SIGNER_COLORS[slot % SIGNER_COLORS.length];

/** What the signing panel asks for, given the fields on the document. Full name is always asked (audit trail). */
export function panelFor(fields: SignField[]) {
  const profile = new Map<ProfileKey, boolean>([["name", true]]);
  const want = (k: ProfileKey, req: boolean) => profile.set(k, (profile.get(k) ?? false) || req);
  let signature = false, initials = false;
  const custom: SignField[] = [];
  for (const f of fields) {
    const t = FIELD_TYPES[f.type] as { key?: ProfileKey };
    if (t.key) want(t.key, f.required);
    else if (f.type === "ADDRESS") for (const k of ["street", "city", "region", "postalCode", "country"] as const) want(k, f.required && k !== "region");
    else if (f.type === "SIGNATURE") signature = true;
    else if (f.type === "INITIALS") initials = true;
    else if (f.type === "TEXT" || f.type === "CHECKBOX") custom.push(f);
  }
  const ordered = PROFILE_KEYS.filter((k) => profile.has(k)).map((k) => ({ key: k, required: profile.get(k)! }));
  return { profile: ordered, signature, initials, custom };
}

/** Problems that stop signing, in panel order. Empty = ready. */
export function missingValues(fields: SignField[], v: SignValues): string[] {
  const p = panelFor(fields);
  const out: string[] = [];
  for (const { key, required } of p.profile) if (required && !v[key]?.trim()) out.push(PROFILE_LABEL[key]);
  if (p.signature && !isPng(v.signature)) out.push("Signature");
  if (p.initials && !isPng(v.initials)) out.push("Initials");
  for (const f of p.custom) {
    const val = v.custom?.[f.id];
    if (f.required && (f.type === "CHECKBOX" ? val !== "yes" : !val?.trim())) out.push(f.label || FIELD_TYPES[f.type].label);
  }
  return out;
}

export const isPng = (s?: string | null) => !!s && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 400_000;

export function fullAddress(v: SignValues) {
  const place = [v.city, v.region].filter(Boolean).join(", ");
  return [v.street, [place, v.postalCode].filter(Boolean).join(" "), v.country ? countryName(v.country) : ""].filter(Boolean).join(", ");
}

export const signedDate = (d: Date) => d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/** Text a field shows (signature and initials are images, see the PNG values). */
export function fieldText(f: SignField, v: SignValues, signedAt: Date | null): string {
  if (f.type === "DATE") return signedAt ? signedDate(signedAt) : "";
  if (f.type === "ADDRESS") return fullAddress(v);
  if (f.type === "COUNTRY") return v.country ? countryName(v.country) : "";
  if (f.type === "TEXT") return v.custom?.[f.id] ?? "";
  if (f.type === "CHECKBOX") return v.custom?.[f.id] === "yes" ? "X" : "";
  const key = (FIELD_TYPES[f.type] as { key?: ProfileKey }).key;
  return key ? (v[key] ?? "") : "";
}

/** Keeps only what the panel asked for, trimmed and length-limited. */
export function cleanValues(fields: SignField[], raw: SignValues): SignValues {
  const p = panelFor(fields);
  const out: SignValues = {};
  for (const { key } of p.profile) {
    const val = typeof raw[key] === "string" ? raw[key]!.trim().slice(0, 200) : "";
    if (val) out[key] = key === "country" ? val.toUpperCase().slice(0, 2) : val;
  }
  if (p.signature && isPng(raw.signature)) out.signature = raw.signature;
  if (p.initials && isPng(raw.initials)) out.initials = raw.initials;
  const custom: Record<string, string> = {};
  for (const f of p.custom) {
    const val = raw.custom?.[f.id];
    if (typeof val === "string" && val.trim()) custom[f.id] = f.type === "CHECKBOX" ? (val === "yes" ? "yes" : "") : val.trim().slice(0, 500);
  }
  if (Object.keys(custom).length) out.custom = custom;
  return out;
}

/** Splits a full name for the "First name / Last name" lines of the panel. */
export function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length < 2 ? { first: parts[0] ?? "", last: "" } : { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

export const initialsOf = (name: string) => name.trim().split(/\s+/).filter(Boolean).map((p) => p[0]!.toUpperCase()).join("").slice(0, 4);

export const SIGN_LINK_DAYS = 30;
export const signUrl = (base: string, token: string) => `${base.replace(/\/+$/, "")}/sign/${token}`;

/** File name for the signed copy: "Confidentiality Agreement - Jane Doe - signed.pdf". */
export function signedFileName(title: string, signer: string) {
  const clean = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  return `${clean(title).slice(0, 80) || "Document"} - ${clean(signer).slice(0, 60) || "signer"} - signed.pdf`;
}

/** Data room folder the signed copies go into (created on first use). */
export const SIGNED_FOLDER = "Signed Documents";

export const CONSENT_TEXT =
  "I agree to do business electronically and that my electronic signature, and my clicking “I Agree”, is the legal equivalent of my handwritten signature on this document.";
