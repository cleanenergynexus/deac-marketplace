// Where a listing is: a required country plus optional state / province, county and city. Shared by server and client.
import { US_STATES } from "./constants";
import { countryName } from "./phone";

export type Place = { country?: string | null; state?: string | null; county?: string | null; city?: string | null };

const US_STATE_SET = new Set(US_STATES);
export const isUS = (country?: string | null) => !country || country.toUpperCase() === "US";

/** Market picker leaf (lib/regions.ts) for each country outside the US. */
export const COUNTRY_MARKET: Record<string, string> = {
  CA: "CANADA", MX: "MEXICO",
  PR: "LATAM_CARIB", AR: "LATAM_CARIB", BR: "LATAM_CARIB", CL: "LATAM_CARIB", CO: "LATAM_CARIB", CR: "LATAM_CARIB", DO: "LATAM_CARIB", PA: "LATAM_CARIB", PE: "LATAM_CARIB",
  GB: "W_C_EUROPE", AT: "W_C_EUROPE", BE: "W_C_EUROPE", DK: "W_C_EUROPE", FI: "W_C_EUROPE", FR: "W_C_EUROPE", DE: "W_C_EUROPE", GR: "W_C_EUROPE", IE: "W_C_EUROPE",
  IT: "W_C_EUROPE", NL: "W_C_EUROPE", NO: "W_C_EUROPE", PT: "W_C_EUROPE", ES: "W_C_EUROPE", SE: "W_C_EUROPE", CH: "W_C_EUROPE",
  CZ: "E_EUROPE", PL: "E_EUROPE", RO: "E_EUROPE", TR: "E_EUROPE",
  BH: "MENA", EG: "MENA", IL: "MENA", KW: "MENA", MA: "MENA", OM: "MENA", QA: "MENA", SA: "MENA", AE: "MENA",
  KE: "SSA", NG: "SSA", ZA: "SSA",
  CN: "EAST_ASIA", HK: "EAST_ASIA", JP: "EAST_ASIA", KR: "EAST_ASIA", TW: "EAST_ASIA",
  ID: "SE_ASIA", MY: "SE_ASIA", PH: "SE_ASIA", SG: "SE_ASIA", TH: "SE_ASIA", VN: "SE_ASIA",
  IN: "SOUTH_ASIA", PK: "SOUTH_ASIA",
  AU: "OCEANIA", NZ: "OCEANIA",
};

/** Reads the country / state / county / city inputs (ListingLocationFields). US states are kept as their 2-letter code. */
export function locationFromForm(f: FormData) {
  const t = (k: string) => (f.get(k) as string | null)?.trim() || null;
  const country = (t("country") ?? "US").toUpperCase();
  const rawState = t("state") ?? "";
  const state = isUS(country) ? (US_STATE_SET.has(rawState.toUpperCase()) ? rawState.toUpperCase() : "") : rawState;
  return { country, state, county: t("county"), city: t("city") };
}

/** Short place for admin lists: "TX" in the US, "Ontario, Canada" or "Spain" elsewhere. */
export function placeShort(p: Place) {
  if (isUS(p.country)) return p.state || "United States";
  return [p.state, countryName(p.country)].filter(Boolean).join(", ");
}

/** Broadest place, for tiles and the public embed: the state in the US ("TX"), else the country ("Spain"). */
export const placeRegion = (p: Place) => (isUS(p.country) ? p.state || "United States" : countryName(p.country));

/** Full place: "Abilene, Taylor County, TX" or "Querétaro, Querétaro, Mexico". */
export function placeFull(p: Place) {
  return [p.city, p.county, p.state, isUS(p.country) ? null : countryName(p.country)].filter(Boolean).join(", ");
}

/** Middle part of a listing code: the state in the US (or "US" with no state), else the country code. */
export const codeRegion = (p: Place) => (isUS(p.country) ? p.state || "US" : (p.country ?? "XX").toUpperCase());
