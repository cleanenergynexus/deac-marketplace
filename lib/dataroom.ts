// Project data room: pure helpers shared by the Explorer UI, the server actions and the listing editor.

export type DrFolder = { id: string; parentId: string | null; name: string };
export type DrFile = { id: string; folderId: string | null; name: string };

/** Built-in starter structure. Admins can replace it under Admin → Data room template. */
export const STANDARD_FOLDERS = [
  "01 Corporate & Sponsor",
  "02 Site & Real Estate",
  "03 Power & Interconnection",
  "04 Permitting & Environmental",
  "05 Engineering & Construction",
  "06 Financial Model & Economics",
  "07 Legal & Contracts",
  "08 Marketing & Teaser",
];

/** One folder of the data room template, with its subfolders. */
export type TemplateNode = { name: string; children: TemplateNode[] };
export const DEFAULT_TEMPLATE: TemplateNode[] = STANDARD_FOLDERS.map((name) => ({ name, children: [] }));
export const TEMPLATE_MAX_DEPTH = 5;
export const TEMPLATE_MAX_FOLDERS = 300;

/** Cleans a template: valid names only, no duplicate names among siblings, limited depth and size. */
export function normalizeTemplate(raw: unknown): TemplateNode[] {
  let count = 0;
  const walk = (list: unknown, depth: number): TemplateNode[] => {
    if (!Array.isArray(list) || depth > TEMPLATE_MAX_DEPTH) return [];
    const seen = new Set<string>();
    const out: TemplateNode[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object" || count >= TEMPLATE_MAX_FOLDERS) continue;
      const o = item as Record<string, unknown>;
      const name = cleanName(typeof o.name === "string" ? o.name : "");
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      count++;
      out.push({ name, children: walk(o.children, depth + 1) });
    }
    return out;
  };
  return walk(raw, 1);
}

/** Saved template JSON -> template. Missing or unreadable falls back to the built-in set. */
export function parseTemplate(json?: string | null): TemplateNode[] {
  if (!json) return DEFAULT_TEMPLATE;
  try { return normalizeTemplate(JSON.parse(json)); } catch { return DEFAULT_TEMPLATE; }
}

export const countTemplate = (nodes: TemplateNode[]): number => nodes.reduce((n, x) => n + 1 + countTemplate(x.children), 0);

/** Link stored on a listing document that points at a data room file. Access is checked on download. */
export const fileUrl = (fileId: string) => `/api/data-room/files/${fileId}`;

/** Trims a file or folder name and removes characters that break paths. Empty result = invalid. */
export function cleanName(name: string) {
  return name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+$/, "")
    .slice(0, 200);
}

/** Explorer-style "keep both": "Report.pdf" becomes "Report (2).pdf" when the name is taken (case-insensitive). */
export function uniqueName(name: string, taken: Iterable<string>) {
  const used = new Set([...taken].map((t) => t.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let i = 2; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!used.has(candidate.toLowerCase())) return candidate;
  }
}

/** Folder names from the top level down to `folderId` (empty for the top level). */
export function folderPath(folders: DrFolder[], folderId: string | null): DrFolder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: DrFolder[] = [];
  const seen = new Set<string>();
  for (let cur = folderId ? byId.get(folderId) : undefined; cur && !seen.has(cur.id); cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
    seen.add(cur.id);
    path.unshift(cur);
  }
  return path;
}

/** "Folder/Sub/file.pdf" for display. */
export function filePathLabel(folders: DrFolder[], file: DrFile) {
  return [...folderPath(folders, file.folderId).map((f) => f.name), file.name].join(" / ");
}

/** The folder plus every folder inside it, at any depth. */
export function descendantIds(folders: DrFolder[], folderId: string): Set<string> {
  const kids = new Map<string | null, string[]>();
  for (const f of folders) kids.set(f.parentId, [...(kids.get(f.parentId) ?? []), f.id]);
  const out = new Set<string>();
  const stack = [folderId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(kids.get(id) ?? []));
  }
  return out;
}

/** A folder can't be moved into itself or one of its own subfolders. */
export function canMoveFolder(folders: DrFolder[], folderId: string, targetId: string | null) {
  return targetId === null || !descendantIds(folders, folderId).has(targetId);
}

/** Distinct relative folder paths from an upload ("A/B/file.pdf" -> ["A"], ["A","B"]), parents first. */
export function uploadDirs(relativePaths: string[]): string[][] {
  const seen = new Map<string, string[]>();
  for (const rel of relativePaths) {
    const parts = rel.split("/").map(cleanName).filter(Boolean);
    parts.pop(); // the file itself
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i);
      seen.set(p.join("/"), p);
    }
  }
  return [...seen.values()].sort((a, b) => a.length - b.length);
}

/** Document name suggested when a file is shared on the listing: the file name without its extension. */
export const docNameFromFile = (name: string) => name.replace(/\.[A-Za-z0-9]{1,6}$/, "") || name;

export function formatBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 KB";
  if (n < 1024) return "1 KB";
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 100 || i === 0 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1)} ${units[i]}`;
}

const KINDS: [RegExp, string, string][] = [
  [/\.pdf$/i, "PDF Document", "pdf"],
  [/\.(xlsx|xlsm|xls|csv)$/i, "Spreadsheet", "sheet"],
  [/\.(docx?|rtf|odt)$/i, "Word Document", "doc"],
  [/\.(pptx?|key)$/i, "Presentation", "slides"],
  [/\.(png|jpe?g|gif|webp|tiff?|bmp|heic|svg)$/i, "Image", "image"],
  [/\.(dwg|dxf|kmz|kml|shp|geojson)$/i, "Drawing / GIS", "cad"],
  [/\.(zip|7z|rar|gz|tar)$/i, "Archive", "zip"],
  [/\.(mp4|mov|avi|mkv|webm)$/i, "Video", "video"],
  [/\.(txt|md|eml|msg)$/i, "Text", "text"],
];

/** Type column label and icon key for a file name. */
export function fileKind(name: string): { label: string; icon: string } {
  for (const [re, label, icon] of KINDS) if (re.test(name)) return { label, icon };
  const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase() : "";
  return { label: ext ? `${ext} File` : "File", icon: "file" };
}

/** Content types a browser may show inline. Everything else downloads (stops uploaded HTML/SVG running on our domain). */
export function inlineSafe(contentType: string) {
  return /^(application\/pdf|image\/(png|jpe?g|gif|webp)|text\/plain|video\/(mp4|webm)|audio\/)/i.test(contentType);
}

/** Blob pathname for a new upload. The display name is kept in the database; the path just needs to be safe. */
export function storagePath(projectId: string, name: string, unique = "") {
  const safe = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").replace(/^[-.]+/, "").slice(0, 120) || "file";
  return `data-room/${projectId}/${unique ? `${unique}-` : ""}${safe}`;
}
