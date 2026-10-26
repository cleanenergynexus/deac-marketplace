export const usd = (n?: number | null, compact = true) =>
  n == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 0 }).format(n);
export const num = (n?: number | null, d = 0) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d }));
export const date = (d?: Date | null) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
export const csv = (s?: string | null) => (s ? s.split(",").map((x) => x.trim()).filter(Boolean) : []);
