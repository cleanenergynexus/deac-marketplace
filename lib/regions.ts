// Market tree investors can target: region > sub-region > country > US state.
// Investors save the codes they tick as `preferredRegions` (non-state codes) and `preferredStates` (US states).
import { US_STATES } from "./constants";
import { COUNTRY_MARKET, isUS } from "./location";

export type MarketNode = { code: string; label: string; children?: MarketNode[] };

export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky",
  LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia", PR: "Puerto Rico",
};

export const REGIONS: MarketNode[] = [
  { code: "AMERICAS", label: "Americas", children: [
    { code: "NORTH_AMERICA", label: "North America", children: [
      { code: "USA", label: "United States", children: US_STATES.map((s) => ({ code: s, label: STATE_NAMES[s] ?? s })) },
      { code: "CANADA", label: "Canada" },
      { code: "MEXICO", label: "Mexico" },
    ] },
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

const ALL_NODES: MarketNode[] = [];
const walk = (n: MarketNode) => { ALL_NODES.push(n); n.children?.forEach(walk); };
REGIONS.forEach(walk);
const BY_CODE = new Map(ALL_NODES.map((n) => [n.code, n]));
const STATE_SET = new Set(US_STATES);

/** Sub-regions (second level), used by outreach segment filters. */
export const SUB_REGIONS: { code: string; label: string }[] = REGIONS.flatMap((r) => r.children ?? []).map(({ code, label }) => ({ code, label }));
export const regionLabel = (code: string) => BY_CODE.get(code)?.label ?? code;

/** Every leaf code under a node (the node itself if it has no children). */
export function leavesOf(code: string): string[] {
  const n = BY_CODE.get(code);
  if (!n) return [code];
  return n.children?.length ? n.children.flatMap((c) => leavesOf(c.code)) : [n.code];
}
export const ALL_LEAVES = REGIONS.flatMap((r) => leavesOf(r.code));

/** Expand saved preferences (any mix of parent codes, leaves and states) into leaf codes. */
export function expandMarkets(states: string[], regions: string[]): Set<string> {
  return new Set([...states, ...regions.flatMap(leavesOf)]);
}

/** Turn a set of ticked leaves into what we save: states, and region codes (leaves plus every fully-ticked parent). */
export function packMarkets(leaves: Set<string>): { states: string[]; regions: string[] } {
  const states = US_STATES.filter((s) => leaves.has(s));
  const regions = ALL_NODES.filter((n) => !STATE_SET.has(n.code) && leavesOf(n.code).every((l) => leaves.has(l))).map((n) => n.code);
  return { states, regions };
}

/** Region a listing's US state / territory belongs to. */
export const regionOfState = (state: string) => (["PR", "VI", "GU"].includes(state) ? "LATAM_CARIB" : "NORTH_AMERICA");

/**
 * Does an investor's market preference cover a listing in this country / state? Empty preferences = open to anything.
 * A US listing without a state matches anyone who picked at least one US state.
 */
export function marketMatches(prefStates: string[], prefRegions: string[], state: string, country = "US") {
  if (!prefStates.length && !prefRegions.length) return true;
  const leaves = expandMarkets(prefStates, prefRegions);
  if (country.toUpperCase() === "PR") state = "PR";
  else if (!isUS(country)) { const leaf = COUNTRY_MARKET[country.toUpperCase()]; return !!leaf && leaves.has(leaf); }
  if (!state) return US_STATES.some((s) => leaves.has(s));
  return leaves.has(state) || prefRegions.includes(regionOfState(state));
}

/** Do two market selections overlap? Used for outreach region filters. */
export function marketsOverlap(aStates: string[], aRegions: string[], bRegions: string[]) {
  const a = expandMarkets(aStates, aRegions);
  return bRegions.flatMap(leavesOf).some((l) => a.has(l));
}

/** Short human summary, naming the highest fully-ticked level, e.g. "North America; Mexico; TX, VA". */
export function marketSummary(statesCsv: string, regionsCsv: string) {
  const leaves = expandMarkets(statesCsv.split(",").filter(Boolean), regionsCsv.split(",").filter(Boolean));
  if (!leaves.size) return "Any";
  if (ALL_LEAVES.every((l) => leaves.has(l))) return "All regions";
  const parts: string[] = [];
  const visit = (n: MarketNode) => {
    const ls = leavesOf(n.code);
    if (ls.every((l) => leaves.has(l))) parts.push(n.code === "USA" ? "All US states" : n.label);
    else if (n.code === "USA") { const picked = ls.filter((l) => leaves.has(l)); if (picked.length) parts.push(picked.join(", ")); }
    else n.children?.forEach(visit);
  };
  REGIONS.forEach(visit);
  return parts.join("; ");
}
