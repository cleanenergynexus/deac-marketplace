// Structured mailing addresses on companies and contacts. Shared by server and client.
import { countryName } from "./phone";

export type Address = { street?: string | null; city?: string | null; region?: string | null; postalCode?: string | null; country?: string | null };

const t = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;

/** Reads the fields that AddressFields renders. */
export function addressFromForm(f: FormData) {
  const country = t(f, "country")?.toUpperCase() ?? null;
  const region = t(f, "region");
  return { street: t(f, "street"), city: t(f, "city"), region: country === "US" && region ? region.toUpperCase() : region, postalCode: t(f, "postalCode"), country };
}

export const hasAddress = (a: Address) => !!(a.street || a.city || a.region || a.postalCode || a.country);

/** "Dallas, TX 75201" in the US; "London SW1A 1AA" elsewhere. */
export function cityLine(a: Address) {
  const place = [a.city, a.region].filter(Boolean).join(", ");
  return [place, a.postalCode].filter(Boolean).join(" ");
}

/** Short place for lists: "Dallas, TX" or "Madrid, Spain". */
export function shortPlace(a: Address) {
  const foreign = a.country && a.country !== "US" ? countryName(a.country) : null;
  return [a.city, a.country === "US" || !a.country ? a.region : null, foreign].filter(Boolean).join(", ");
}

/** Address as display lines. The country line is left off for US addresses. */
export function addressLines(a: Address) {
  return [a.street, cityLine(a), a.country && a.country !== "US" ? countryName(a.country) : null].filter((x): x is string => !!x);
}

/** Google Maps search link for the address. */
export const mapsHref = (a: Address) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([a.street, cityLine(a), countryName(a.country)].filter(Boolean).join(", "))}`;
