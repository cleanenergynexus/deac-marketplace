// Referral agents collaborating on the listings they brought in: which details they can edit (every save is logged
// for the DEAC team), and who they can assign tasks to. No database access here (see lib/listing-collab-db.ts).
import { PROJECT_STATUSES } from "./constants";
import { OPTIONS } from "./valuation-options";

type Kind = "text" | "long" | "number" | "int" | "money" | "select";
export type EditField = { key: string; label: string; kind: Kind; options?: readonly string[]; help?: string };

/**
 * Listing details a referral agent can edit on a listing they brought in. The deal itself (deal type, stage,
 * visibility, disclosure, developer, documents) and the internal valuation stay with the DEAC team.
 */
export const AGENT_EDIT_FIELDS: readonly EditField[] = [
  { key: "title", label: "Listing title", kind: "text" },
  { key: "summary", label: "Summary", kind: "long" },
  { key: "highlights", label: "Highlights", kind: "long", help: "One per line" },
  { key: "mw", label: "Capacity (MW)", kind: "number" },
  { key: "projectStatus", label: "Project status", kind: "select", options: PROJECT_STATUSES },
  { key: "state", label: "State / province", kind: "text" },
  { key: "county", label: "County", kind: "text" },
  { key: "city", label: "City", kind: "text" },
  { key: "fundingNeeded", label: "Funding needed / asking price ($)", kind: "money" },
  { key: "term", label: "Term", kind: "text" },
  { key: "useOfFunds", label: "Use of funds", kind: "long", help: "One \"Label: amount\" per line" },
  { key: "totalCapex", label: "Total capex ($)", kind: "money" },
  { key: "powerStatus", label: "Power status", kind: "select", options: OPTIONS.powerStatus },
  { key: "powerRateCents", label: "Power rate (¢/kWh)", kind: "number" },
  { key: "monthsToPower", label: "Months to power", kind: "int" },
  { key: "codDate", label: "COD date", kind: "text" },
  { key: "leaseRateKwMo", label: "Lease rate ($/kW/mo)", kind: "number" },
  { key: "capitalStack", label: "Capital stack", kind: "long" },
  { key: "economicsNotes", label: "Economics notes", kind: "long" },
];
const FIELD = new Map(AGENT_EDIT_FIELDS.map((f) => [f.key, f]));
export const editLabel = (key: string) => FIELD.get(key)?.label ?? key;

export type FieldValue = string | number | null;
/** One edited field: what the listing said before the agent saved, and what it says now. */
export type Change = { field: string; from: FieldValue; to: FieldValue };

const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\r\n/g, "\n").trim() : v == null ? "" : String(v));

/** Reads one form value as the field's type. Empty = null for optional fields. Returns undefined when it isn't valid. */
export function readValue(field: EditField, raw: unknown): FieldValue | undefined {
  const v = clean(raw);
  if (field.kind === "number" || field.kind === "int" || field.kind === "money") {
    if (!v) return field.key === "mw" || field.key === "fundingNeeded" ? undefined : null;
    const n = Number(v.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) return undefined;
    return field.kind === "int" ? Math.round(n) : n;
  }
  if (field.kind === "select" && v && !field.options?.includes(v)) return undefined;
  if (!v) return field.key === "title" || field.key === "summary" ? undefined : field.kind === "long" || field.key === "state" ? "" : null;
  return v.slice(0, field.kind === "long" ? 5000 : 200);
}

const same = (a: FieldValue, b: FieldValue) => (a ?? "") === (b ?? "") || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9);

/**
 * Compares what the agent submitted with the listing as it is now. Only fields that changed are saved (and logged).
 * Invalid values are reported by label.
 */
export function diffListingEdit(current: Record<string, unknown>, submitted: Record<string, unknown>): { changes: Change[]; invalid: string[] } {
  const changes: Change[] = [];
  const invalid: string[] = [];
  for (const f of AGENT_EDIT_FIELDS) {
    if (!(f.key in submitted)) continue;
    const to = readValue(f, submitted[f.key]);
    if (to === undefined) {
      invalid.push(f.label);
      continue;
    }
    const raw = current[f.key];
    const from: FieldValue = typeof raw === "number" ? raw : raw == null ? null : String(raw);
    if (!same(from, to)) changes.push({ field: f.key, from, to });
  }
  return { changes, invalid };
}

/** Parses a logged edit, dropping anything that isn't an agent-editable field. */
export function parseChanges(json: string | null | undefined): Change[] {
  try {
    const raw = JSON.parse(json ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter((c): c is Change => !!c && typeof c === "object" && FIELD.has((c as Change).field));
  } catch {
    return [];
  }
}

/** The project update for a set of changes. Values are re-checked, so only agent-editable fields with valid values are written. */
export function changesToData(changes: Change[], accept?: Set<string>): Record<string, FieldValue> {
  const data: Record<string, FieldValue> = {};
  for (const c of changes) {
    const f = FIELD.get(c.field);
    if (!f || (accept && !accept.has(c.field))) continue;
    const v = readValue(f, c.to);
    if (v !== undefined) data[c.field] = v;
  }
  return data;
}

/** How a value reads in the edit log. */
export function showValue(field: string, v: FieldValue): string {
  if (v === null || v === "") return "—";
  const f = FIELD.get(field);
  if (typeof v === "number" && f?.kind === "money") return `$${v.toLocaleString("en-US")}`;
  return String(v);
}

/** Who a referral agent can assign a task on their listing to: themselves, then the DEAC team (their partner first). */
export function agentAssigneeOptions(agent: { id: string; name: string; partnerId: string | null }, team: { id: string; name: string }[]) {
  const partner = team.find((t) => t.id === agent.partnerId);
  const rest = team.filter((t) => t.id !== agent.partnerId && t.id !== agent.id).sort((a, b) => a.name.localeCompare(b.name));
  return [
    { id: agent.id, name: `Me (${agent.name})` },
    ...(partner ? [{ id: partner.id, name: `${partner.name} (your DEAC partner)` }] : []),
    ...rest,
  ];
}
