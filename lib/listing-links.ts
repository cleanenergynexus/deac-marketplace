// Linked listings: one project marketed under several deal types (e.g. acquired for Sale, re-marketed for Lease
// and Financing). Summary and highlights stay per listing so each deal type can be pitched its own way. The original listing owns the data room, screening and Document Wizard drafts; each linked
// listing points at it with Project.linkedToId. Project facts stay in sync across the group; the deal itself
// (pricing, terms, stage, visibility, disclosure, investor access) belongs to each listing.

/** Project facts every listing in a group shares. Saving any listing in the group copies these to the others. */
export const SYNCED_FIELDS = [
  "developerId",
  "contactId",
  "country",
  "state",
  "county",
  "city",
  "mw",
  "facilityType",
  "projectStatus",
  "coverImageUrl",
  "totalCapex",
  "powerRateCents",
  "powerStatus",
  "monthsToPower",
  "codDate",
  // Valuation & lead score (internal calculator)
  "valuationInputs",
  "valueScore",
  "adjustedValueMw",
] as const;
export type SyncedField = (typeof SYNCED_FIELDS)[number];

/** Form labels of the synced fields, to mark them on the listing form. */
export const SYNCED_LABELS = new Set([
  "Developer",
  "Capacity (MW)",
  "Facility type",
  "Project status",
  "Cover image URL",
  "Total capex ($)",
  "Power rate (¢/kWh)",
  "Power status",
  "Months to power",
  "Target COD",
]);

/** The synced fields present in `data`, ready to write to the other listings of the group. */
export function syncedData<T extends Record<string, unknown>>(data: T): Partial<Pick<T, Extract<SyncedField, keyof T>>> {
  const out: Record<string, unknown> = {};
  for (const k of SYNCED_FIELDS) if (k in data && data[k] !== undefined) out[k] = data[k];
  return out as Partial<Pick<T, Extract<SyncedField, keyof T>>>;
}

/** The listing that owns the group's data room (the original listing). */
export function groupRootId(p: { id: string; linkedToId: string | null }) {
  return p.linkedToId ?? p.id;
}

/** Deal types not yet used in a group, first the ones to suggest for a new duplicate. */
export function freeDealTypes(used: string[], all: readonly string[]) {
  return all.filter((t) => !used.includes(t));
}

const SHORT: Record<string, string> = { SALE: "Sale", LEASE: "Lease", FINANCING: "Financing" };
/** Short deal type name for titles and links: Sale, Lease, Financing. */
export const dealShort = (t: string) => SHORT[t] ?? t;

/** Default title of a duplicate: the original's title with its deal type word swapped, or the new type added. */
export function duplicateTitle(title: string, fromType: string, toType: string) {
  const from = dealShort(fromType);
  const to = dealShort(toType);
  const re = new RegExp(`\\b${from}\\b`, "i");
  if (re.test(title)) return title.replace(re, to);
  return `${title} (${to})`;
}
