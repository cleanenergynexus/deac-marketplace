export const usd = (n?: number | null, compact = true) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 0 }).format(n);
export const num = (n?: number | null, d = 0) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
export const date = (d?: Date | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
export const csv = (s?: string | null) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);

const MINOR_WORDS = new Set("a an the and but or nor for so yet as at by in of on to up via vs per from with into onto off over than".split(" "));

/** Title Case for headings: "site & real estate" → "Site & Real Estate". Short words stay lowercase unless first or last; acronyms are kept. */
export function titleCase(s: string): string {
  const parts = s.split(/(\s+)/);
  const words = parts.map((p, i) => (/[A-Za-z]/.test(p) ? i : -1)).filter((i) => i >= 0);
  return parts
    .map((p, i) => {
      const n = words.indexOf(i);
      if (n < 0) return p;
      const prev = n > 0 ? parts[words[n - 1]] : "";
      const force = n === 0 || n === words.length - 1 || /[:—–]$/.test(prev) || p.startsWith("(");
      return p
        .split("-")
        .map((h, k) =>
          h.replace(/^([^A-Za-z]*)([A-Za-z][A-Za-z']*)/, (m, pre: string, w: string) =>
            /[A-Z]/.test(w) || (!force && k === 0 && MINOR_WORDS.has(w)) ? m : pre + w[0].toUpperCase() + w.slice(1),
          ),
        )
        .join("-");
    })
    .join("");
}
