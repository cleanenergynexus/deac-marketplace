"use client";
import { useMemo, useState, type ReactNode } from "react";
import { descendantIds, filePathLabel, type DrFile, type DrFolder } from "@/lib/dataroom";
import { FileIcon, FolderIcon } from "@/components/DataRoomIcons";

/**
 * Checkbox tree of a data room: tick the entire data room, whole folders (subfolders included) or single files.
 * A folder's box is only ticked when every file under it is picked (no partial state).
 */
export function DataRoomCheckTree<F extends DrFile>({ rootLabel, folders, files, checked, onChange, query = "", disabled, note }: {
  rootLabel: string;
  folders: DrFolder[];
  files: F[];
  checked: Set<string>;
  onChange: (next: Set<string>) => void;
  query?: string;
  /** Files that can't be picked (e.g. already on the listing). */
  disabled?: (f: F) => boolean;
  /** Shown at the end of a file's row, e.g. its tier badge. */
  note?: (f: F) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const kids = useMemo(() => {
    const m = new Map<string | null, DrFolder[]>();
    for (const f of folders) m.set(f.parentId, [...(m.get(f.parentId) ?? []), f]);
    for (const l of m.values()) l.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return m;
  }, [folders]);
  const pickable = files.filter((f) => !disabled?.(f));
  const filesIn = (folderId: string | null) => files.filter((f) => f.folderId === folderId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const allUnder = (folderId: string) => { const ids = descendantIds(folders, folderId); return pickable.filter((f) => f.folderId && ids.has(f.folderId)); };
  const toggle = (ids: string[], on: boolean) => { const n = new Set(checked); for (const id of ids) if (on) n.add(id); else n.delete(id); onChange(n); };
  const allTicked = (list: F[]) => list.length > 0 && list.every((f) => checked.has(f.id));

  const fileRow = (f: F, depth: number, showPath = false) => {
    const off = !!disabled?.(f);
    return (
      <label key={f.id} className={`flex items-center gap-2 rounded py-1 pr-2 text-sm ${off ? "text-slate-400" : "cursor-pointer hover:bg-slate-50"}`} style={{ paddingLeft: depth * 16 + 8 }}>
        <input type="checkbox" disabled={off} checked={checked.has(f.id)} onChange={(e) => toggle([f.id], e.target.checked)} />
        <FileIcon name={f.name} className="h-4 w-4" />
        <span className="truncate">{showPath ? filePathLabel(folders, f) : f.name}</span>
        {note && <span className="ml-auto shrink-0">{note(f)}</span>}
      </label>
    );
  };
  const tree = (parent: string | null, depth: number): ReactNode => (
    <>
      {(kids.get(parent) ?? []).map((d) => {
        const under = allUnder(d.id);
        const open = !collapsed.has(d.id);
        return (
          <div key={d.id}>
            <div className="flex items-center gap-2 rounded py-1 pr-2 text-sm hover:bg-slate-50" style={{ paddingLeft: depth * 16 + 8 }}>
              <input type="checkbox" aria-label={`Select all in ${d.name}`} disabled={!under.length} checked={allTicked(under)} onChange={(e) => toggle(under.map((f) => f.id), e.target.checked)} />
              <button type="button" aria-expanded={open} onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })} className="flex min-w-0 items-center gap-1.5">
                <FolderIcon open={open} className="h-4 w-4" /><span className="truncate font-medium">{d.name}</span>
                <span className="shrink-0 text-xs font-normal text-slate-400">{under.length ? `${under.filter((f) => checked.has(f.id)).length}/${under.length}` : "empty"}</span>
              </button>
            </div>
            {open && tree(d.id, depth + 1)}
          </div>
        );
      })}
      {filesIn(parent).map((f) => fileRow(f, depth))}
    </>
  );

  const q = query.trim().toLowerCase();
  if (!files.length) return <p className="p-6 text-center text-sm text-slate-500">This data room has no files yet.</p>;
  if (q) {
    const hits = files.filter((f) => f.name.toLowerCase().includes(q));
    return hits.length ? <>{hits.map((f) => fileRow(f, 0, true))}</> : <p className="p-6 text-center text-sm text-slate-500">No files match.</p>;
  }
  return (
    <>
      <label className="flex cursor-pointer items-center gap-2 rounded border-b border-slate-100 py-1.5 pl-2 pr-2 text-sm font-semibold hover:bg-slate-50">
        <input type="checkbox" aria-label="Select the entire data room" disabled={!pickable.length} checked={allTicked(pickable)} onChange={(e) => toggle(pickable.map((f) => f.id), e.target.checked)} />
        <FolderIcon open className="h-4 w-4" /><span className="truncate">Entire data room · {rootLabel}</span>
        <span className="ml-auto shrink-0 text-xs font-normal text-slate-500">{pickable.filter((f) => checked.has(f.id)).length} of {pickable.length} selected</span>
      </label>
      {tree(null, 1)}
    </>
  );
}
