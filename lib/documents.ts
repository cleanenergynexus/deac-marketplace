import { isStage, type Stage } from "./disclosure";

/** One row of the listing editor's document list. `id` is empty for a new row. */
export type DocRow = { id: string; name: string; url: string; access: Stage };

/** Parses the editor's JSON. Rows without a name are dropped; bad tiers fall back to LOI. */
export function parseDocRows(json: unknown): DocRow[] | null {
  if (typeof json !== "string") return null;
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!Array.isArray(raw)) return null;
  return raw.flatMap((r) => {
    if (!r || typeof r !== "object") return [];
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    if (!name) return [];
    return [{ id: typeof o.id === "string" ? o.id : "", name: name.slice(0, 200), url: typeof o.url === "string" ? o.url.trim() : "", access: isStage(o.access) ? o.access : "LOI" }];
  });
}

/** What to write so the project's documents match the editor rows. */
export function planDocChanges(existing: { id: string; name: string; url: string; access: string }[], rows: DocRow[]) {
  const byId = new Map(existing.map((d) => [d.id, d]));
  const kept = new Set<string>();
  const create: Omit<DocRow, "id">[] = [];
  const update: DocRow[] = [];
  for (const r of rows) {
    const cur = r.id ? byId.get(r.id) : undefined;
    if (!cur) { create.push({ name: r.name, url: r.url, access: r.access }); continue; }
    if (kept.has(cur.id)) continue;
    kept.add(cur.id);
    if (cur.name !== r.name || cur.url !== r.url || cur.access !== r.access) update.push(r);
  }
  const remove = existing.filter((d) => !kept.has(d.id)).map((d) => d.id);
  return { create, update, remove };
}
