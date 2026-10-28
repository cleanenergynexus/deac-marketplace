// Phone numbers are stored in E.164 ("+12145550142", optional " ext. 12") and shown in each country's
// international style, e.g. US "+1 (214) 555-0142", UK "+44 20 7946 0958". Shared by server and client.

export type Country = {
  iso: string;
  name: string;
  dial: string;
  /** Digit groups for the national number, keyed by its length. Falls back to groups of three or four. */
  groups?: Record<number, number[] | ((national: string) => number[])>;
  /** Italy and a few others keep the leading 0 after the country code. */
  keepZero?: boolean;
};

// The first entries show at the top of pickers; the rest are alphabetical.
export const COUNTRIES: Country[] = [
  { iso: "US", name: "United States", dial: "1" },
  { iso: "PR", name: "Puerto Rico", dial: "1" },
  { iso: "CA", name: "Canada", dial: "1" },
  { iso: "MX", name: "Mexico", dial: "52", groups: { 10: [2, 4, 4] } },
  { iso: "GB", name: "United Kingdom", dial: "44", groups: { 10: (n) => (n[0] === "2" ? [2, 4, 4] : [4, 6]), 9: [4, 5] } },
  { iso: "AR", name: "Argentina", dial: "54", groups: { 10: [2, 4, 4], 11: [1, 2, 4, 4] } },
  { iso: "AU", name: "Australia", dial: "61", groups: { 9: [1, 4, 4] } },
  { iso: "AT", name: "Austria", dial: "43" },
  { iso: "BH", name: "Bahrain", dial: "973", groups: { 8: [4, 4] } },
  { iso: "BE", name: "Belgium", dial: "32", groups: { 8: [1, 3, 2, 2], 9: [3, 2, 2, 2] } },
  { iso: "BR", name: "Brazil", dial: "55", groups: { 10: [2, 4, 4], 11: [2, 5, 4] } },
  { iso: "CL", name: "Chile", dial: "56", groups: { 9: [1, 4, 4] } },
  { iso: "CN", name: "China", dial: "86", groups: { 11: [3, 4, 4], 10: [2, 4, 4] } },
  { iso: "CO", name: "Colombia", dial: "57", groups: { 10: [3, 3, 4] } },
  { iso: "CR", name: "Costa Rica", dial: "506", groups: { 8: [4, 4] } },
  { iso: "CZ", name: "Czechia", dial: "420", groups: { 9: [3, 3, 3] } },
  { iso: "DK", name: "Denmark", dial: "45", groups: { 8: [2, 2, 2, 2] } },
  { iso: "DO", name: "Dominican Republic", dial: "1" },
  { iso: "EG", name: "Egypt", dial: "20", groups: { 10: [2, 4, 4], 9: [1, 4, 4] } },
  { iso: "FI", name: "Finland", dial: "358" },
  { iso: "FR", name: "France", dial: "33", groups: { 9: [1, 2, 2, 2, 2] } },
  { iso: "DE", name: "Germany", dial: "49", groups: { 10: [3, 7], 11: [3, 8] } },
  { iso: "GR", name: "Greece", dial: "30", groups: { 10: [3, 3, 4] } },
  { iso: "HK", name: "Hong Kong", dial: "852", groups: { 8: [4, 4] } },
  { iso: "IN", name: "India", dial: "91", groups: { 10: [5, 5] } },
  { iso: "ID", name: "Indonesia", dial: "62" },
  { iso: "IE", name: "Ireland", dial: "353", groups: { 9: [2, 3, 4] } },
  { iso: "IL", name: "Israel", dial: "972", groups: { 9: [2, 3, 4], 8: [1, 3, 4] } },
  { iso: "IT", name: "Italy", dial: "39", keepZero: true, groups: { 10: (n) => (n[0] === "0" ? [2, 4, 4] : [3, 3, 4]), 9: [2, 3, 4] } },
  { iso: "JP", name: "Japan", dial: "81", groups: { 10: [2, 4, 4], 9: [1, 4, 4] } },
  { iso: "KE", name: "Kenya", dial: "254", groups: { 9: [3, 3, 3] } },
  { iso: "KW", name: "Kuwait", dial: "965", groups: { 8: [4, 4] } },
  { iso: "MY", name: "Malaysia", dial: "60", groups: { 9: [2, 3, 4], 10: [2, 4, 4] } },
  { iso: "MA", name: "Morocco", dial: "212", groups: { 9: [3, 2, 2, 2] } },
  { iso: "NL", name: "Netherlands", dial: "31", groups: { 9: [1, 4, 4] } },
  { iso: "NZ", name: "New Zealand", dial: "64", groups: { 9: [2, 3, 4], 8: [1, 3, 4] } },
  { iso: "NG", name: "Nigeria", dial: "234", groups: { 10: [3, 3, 4] } },
  { iso: "NO", name: "Norway", dial: "47", groups: { 8: [3, 2, 3] } },
  { iso: "OM", name: "Oman", dial: "968", groups: { 8: [4, 4] } },
  { iso: "PK", name: "Pakistan", dial: "92", groups: { 10: [3, 7] } },
  { iso: "PA", name: "Panama", dial: "507", groups: { 8: [4, 4], 7: [3, 4] } },
  { iso: "PE", name: "Peru", dial: "51", groups: { 9: [3, 3, 3] } },
  { iso: "PH", name: "Philippines", dial: "63", groups: { 10: [3, 3, 4] } },
  { iso: "PL", name: "Poland", dial: "48", groups: { 9: [3, 3, 3] } },
  { iso: "PT", name: "Portugal", dial: "351", groups: { 9: [3, 3, 3] } },
  { iso: "QA", name: "Qatar", dial: "974", groups: { 8: [4, 4] } },
  { iso: "RO", name: "Romania", dial: "40", groups: { 9: [3, 3, 3] } },
  { iso: "SA", name: "Saudi Arabia", dial: "966", groups: { 9: [2, 3, 4] } },
  { iso: "SG", name: "Singapore", dial: "65", groups: { 8: [4, 4] } },
  { iso: "ZA", name: "South Africa", dial: "27", groups: { 9: [2, 3, 4] } },
  { iso: "KR", name: "South Korea", dial: "82", groups: { 10: [2, 4, 4], 9: [1, 4, 4] } },
  { iso: "ES", name: "Spain", dial: "34", groups: { 9: [3, 3, 3] } },
  { iso: "SE", name: "Sweden", dial: "46", groups: { 9: (n) => (n[0] === "8" ? [1, 3, 3, 2] : [2, 3, 2, 2]) } },
  { iso: "CH", name: "Switzerland", dial: "41", groups: { 9: [2, 3, 2, 2] } },
  { iso: "TW", name: "Taiwan", dial: "886", groups: { 9: [1, 4, 4] } },
  { iso: "TH", name: "Thailand", dial: "66", groups: { 9: [1, 4, 4], 8: [1, 3, 4] } },
  { iso: "TR", name: "Türkiye", dial: "90", groups: { 10: [3, 3, 2, 2] } },
  { iso: "AE", name: "United Arab Emirates", dial: "971", groups: { 9: [2, 3, 4], 8: [1, 3, 4] } },
  { iso: "VN", name: "Vietnam", dial: "84", groups: { 9: [2, 3, 4], 10: [3, 3, 4] } },
];

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));
export const country = (iso?: string | null) => (iso ? BY_ISO.get(iso.toUpperCase()) : undefined);
export const countryName = (iso?: string | null) => country(iso)?.name ?? iso ?? "";
/** Emoji flag from the two-letter code. */
export const flag = (iso: string) => String.fromCodePoint(...[...iso.toUpperCase()].map((ch) => 0x1f1a5 + ch.charCodeAt(0)));

const PR_AREA = new Set(["787", "939"]);
const isNanp = (c?: Country) => c?.dial === "1";

export type ParsedPhone = { country: Country; national: string; ext: string | null };

/**
 * Reads a typed or stored number. A leading + (or 00 / 011) means it carries its country code;
 * otherwise it's a national number in `defaultIso` (the US when not given).
 * Returns null when it doesn't look like a phone number, so callers can keep the text as typed.
 */
export function parsePhone(raw?: string | null, defaultIso = "US"): ParsedPhone | null {
  if (!raw?.trim()) return null;
  let text = raw.trim();
  let ext: string | null = null;
  const e = text.match(/\s*(?:;ext=|[,;]?\s*ext\.?|extension|x|#)\s*(\d{1,6})\s*$/i);
  if (e && e.index! > 0) { ext = e[1]; text = text.slice(0, e.index); }
  if (/[a-z]/i.test(text)) return null;
  let digits = text.replace(/\D/g, "");
  const fallback = country(defaultIso) ?? BY_ISO.get("US")!;
  let international = text.startsWith("+");
  if (!international && digits.startsWith("00")) { international = true; digits = digits.slice(2); }
  else if (!international && isNanp(fallback) && digits.startsWith("011")) { international = true; digits = digits.slice(3); }

  let c: Country | undefined;
  let national: string;
  if (international) {
    const dial = [1, 2, 3].map((n) => digits.slice(0, n)).find((d) => COUNTRIES.some((x) => x.dial === d));
    if (!dial) return null;
    national = digits.slice(dial.length);
    c = fallback.dial === dial ? fallback : dial === "1" && PR_AREA.has(national.slice(0, 3)) ? BY_ISO.get("PR") : COUNTRIES.find((x) => x.dial === dial);
    if (c && !c.keepZero && !isNanp(c)) national = national.replace(/^0/, "");
  } else {
    c = fallback;
    national = digits;
    if (isNanp(c) && national.length === 11 && national.startsWith("1")) national = national.slice(1);
    else if (!isNanp(c) && !c.keepZero) national = national.replace(/^0/, "");
  }
  if (!c) return null;
  if (isNanp(c)) {
    if (national.length !== 10) return null;
    if (c.iso === "US" && PR_AREA.has(national.slice(0, 3))) c = BY_ISO.get("PR")!;
  } else if (national.length < 6 || national.length + c.dial.length > 15) return null;
  return { country: c, national, ext };
}

function group(digits: string, rule?: number[] | ((national: string) => number[])) {
  let sizes = typeof rule === "function" ? rule(digits) : rule;
  if (!sizes) {
    sizes = [];
    let left = digits.length;
    while (left > 4) { const n = left === 6 || left === 8 ? Math.min(left / 2, 4) : 3; sizes.push(n); left -= n; }
    sizes.push(left);
  }
  const out: string[] = [];
  let i = 0;
  for (const n of sizes) { out.push(digits.slice(i, i + n)); i += n; }
  if (i < digits.length) out.push(digits.slice(i));
  return out.filter(Boolean).join(" ");
}

/** The national part only, e.g. "(214) 555-0142" or "20 7946 0958". */
export function formatNational(p: ParsedPhone) {
  const n = p.national;
  const body = isNanp(p.country) ? `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}` : group(n, p.country.groups?.[n.length]);
  return p.ext ? `${body} ext. ${p.ext}` : body;
}

/** For display: "+1 (214) 555-0142". Anything that isn't recognisable as a number comes back as typed. */
export function formatPhone(stored?: string | null, defaultIso = "US") {
  if (!stored?.trim()) return "";
  const p = parsePhone(stored, defaultIso);
  return p ? `+${p.country.dial} ${formatNational(p)}` : stored.trim();
}

/** What gets saved: "+12145550142" (plus " ext. 12"). Unrecognisable text is kept as typed rather than lost. */
export function normalizePhone(raw?: string | null, defaultIso = "US"): string | null {
  if (!raw?.trim()) return null;
  const p = parsePhone(raw, defaultIso);
  if (!p) return raw.trim();
  return `+${p.country.dial}${p.national}${p.ext ? ` ext. ${p.ext}` : ""}`;
}

/** tel: link target, with the extension dialled after a pause. */
export function telHref(stored?: string | null) {
  const p = parsePhone(stored);
  if (!p) return `tel:${(stored ?? "").replace(/[^\d+]/g, "")}`;
  return `tel:+${p.country.dial}${p.national}${p.ext ? `,${p.ext}` : ""}`;
}

/** Reads a phone field plus the country picked next to it (`<name>Country`) from a submitted form. */
export function phoneFromForm(f: FormData, name: string, fallbackIso = "US") {
  const raw = (f.get(name) as string | null)?.trim();
  const iso = (f.get(`${name}Country`) as string | null)?.trim() || fallbackIso;
  return normalizePhone(raw, iso);
}
