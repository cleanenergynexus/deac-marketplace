/** Format a typed dollar amount with thousands separators, keeping digits and one decimal point. "1234567.5" -> "1,234,567.5" */
export function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  const intPart = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/^0+(?=\d)/, "");
  const decPart = dot === -1 ? null : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart == null ? grouped : `${grouped || "0"}.${decPart}`;
}

/** Plain number from a formatted amount, or null when empty. */
export function parseMoney(s: string): number | null {
  const v = s.replace(/[^\d.]/g, "");
  return v ? Number(v) : null;
}
