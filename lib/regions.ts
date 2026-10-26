// Global regions investors can target. Parent boxes select all their children.
type Region = { code: string; label: string; children: { code: string; label: string }[] };
export const REGIONS: Region[] = [
  { code: "AMERICAS", label: "AMERICAS", children: [
    { code: "NORTH_AMERICA", label: "North America (US, CA, MX)" },
    { code: "LATAM_CARIB", label: "Latin America & Caribbean" },
  ] },
  { code: "EMEA", label: "EMEA", children: [
    { code: "W_C_EUROPE", label: "Western & Central Europe" },
    { code: "E_EUROPE", label: "Eastern Europe" },
    { code: "MENA", label: "Middle East & North Africa" },
    { code: "SSA", label: "Sub-Saharan Africa" },
  ] },
  { code: "APAC", label: "APAC", children: [
    { code: "EAST_ASIA", label: "East Asia & China" },
    { code: "SE_ASIA", label: "Southeast Asia" },
    { code: "SOUTH_ASIA", label: "South Asia" },
    { code: "OCEANIA", label: "Oceania & Australia" },
  ] },
];

export const SUB_REGIONS: { code: string; label: string }[] = REGIONS.flatMap((r) => r.children);
export const regionLabel = (code: string) => SUB_REGIONS.find((r) => r.code === code)?.label ?? code;

/** Region a listing's US state / territory belongs to. */
export const regionOfState = (state: string) => (["PR", "VI", "GU"].includes(state) ? "LATAM_CARIB" : "NORTH_AMERICA");

/** Does an investor's market preference cover a listing in this state? Empty preferences = open to anything. */
export function marketMatches(prefStates: string[], prefRegions: string[], state: string) {
  if (!prefStates.length && !prefRegions.length) return true;
  return prefStates.includes(state) || prefRegions.includes(regionOfState(state));
}

/** Human summary for tables, e.g. "North America; TX, VA". */
export function marketSummary(statesCsv: string, regionsCsv: string) {
  const states = statesCsv.split(",").filter(Boolean);
  const regions = regionsCsv.split(",").filter(Boolean);
  const r = regions.length === SUB_REGIONS.length ? "All regions" : regions.map(regionLabel).join(", ");
  const s = states.length >= 52 ? "All US states" : states.join(", ");
  return [r, s].filter(Boolean).join("; ") || "Any";
}
