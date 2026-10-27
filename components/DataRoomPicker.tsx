"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { descendantIds, docNameFromFile, filePathLabel, type DrFile, type DrFolder } from "@/lib/dataroom";
import { STAGES, TIER_LABEL, type Stage } from "@/lib/disclosure";
import { FileIcon, FolderIcon } from "@/components/DataRoomIcons";

/** Pick data room files to add as listing documents, all at one access tier. */
export function DataRoomPicker({ folders, files, taken, onPick, onClose }: {
  folders: DrFolder[];
  files: DrFile[];
  /** File ids already on the listing. */
  taken: Set<string>;
  onPick: (picked: { id: string; name: string }[], access: Stage) => void;
  onClose: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [access, setAccess] = useState<Stage>("NDA");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const kids = useMemo(() => {
    const m = new Map<string | null, DrFolder[]>();
    for (const f of folders) m.set(f.parentId, [...(m.get(f.parentId) ?? []), f]);
    for (const l of m.values()) l.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return m;
  }, [folders]);
  const filesIn = (folderId: string | null) => files.filter((f) => f.folderId === folderId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const available = (list: DrFile[]) => list.filter((f) => !taken.has(f.id));
  const allUnder = (folderId: string) => { const ids = descendantIds(folders, folderId); return available(files.filter((f) => f.folderId && ids.has(f.folderId))); };
  const toggle = (ids: string[], on: boolean) => setChecked((c) => { const n = new Set(c); for (const id of ids) if (on) n.add(id); else n.delete(id); return n; });

  const fileRow = (f: DrFile, depth: number, showPath = false) => {
    const isTaken = taken.has(f.id);
    return (
      <label key={f.id} className={`flex items-center gap-2 rounded py-1 pr-2 text-sm ${isTaken ? "text-slate-400" : "cursor-pointer hover:bg-slate-50"}`} style={{ paddingLeft: depth * 16 + 8 }}>
        <input type="checkbox" disabled={isTaken} checked={checked.has(f.id)} onChange={(e) => toggle([f.id], e.target.checked)} />
        <FileIcon name={f.name} className="h-4 w-4" />
        <span className="truncate">{showPath ? filePathLabel(folders, f) : f.name}</span>
        {isTaken && <span className="ml-auto shrink-0 text-xs">on listing</span>}
      </label>
    );
  };
  const tree = (parent: string | null, depth: number): ReactNode => (
    <>
      {(kids.get(parent) ?? []).map((d) => {
        const under = allUnder(d.id);
        // Folder box is only ticked when every file in it is picked (no partial state).
        const all = under.length > 0 && under.every((f) => checked.has(f.id));
        const open = !collapsed.has(d.id);
        return (
          <div key={d.id}>
            <div className="flex items-center gap-2 rounded py-1 pr-2 text-sm hover:bg-slate-50" style={{ paddingLeft: depth * 16 + 8 }}>
              <input type="checkbox" aria-label={`Select all in ${d.name}`} disabled={!under.length} checked={all} onChange={(e) => toggle(under.map((f) => f.id), e.target.checked)} />
              <button type="button" onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })} className="flex min-w-0 items-center gap-1.5">
                <FolderIcon open={open} className="h-4 w-4" /><span className="truncate font-medium">{d.name}</span>
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
  const picked = files.filter((f) => checked.has(f.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div role="dialog" aria-label="Add from data room" className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Add from data room</h3>
        <p className="mb-3 text-sm text-slate-600">Tick files (or a whole folder) to add to the listing&apos;s documents. Investors can open them once they reach the tier you pick.</p>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files" aria-label="Search files" className="input mb-2" />
        <div className="min-h-[200px] flex-1 overflow-y-auto rounded border border-slate-200 p-1">
          {!files.length ? <p className="p-6 text-center text-sm text-slate-500">This project&apos;s data room has no files yet.</p>
            : q ? files.filter((f) => f.name.toLowerCase().includes(q)).map((f) => fileRow(f, 0, true))
            : tree(null, 0)}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600">Access tier</span>
          <select value={access} onChange={(e) => setAccess(e.target.value as Stage)} aria-label="Access tier" className="input w-auto">
            {STAGES.map((s) => <option key={s} value={s}>{TIER_LABEL[s]}</option>)}
          </select>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="button" disabled={!picked.length} onClick={() => onPick(picked.map((f) => ({ id: f.id, name: docNameFromFile(f.name) })), access)} className="btn">
              Add {picked.length || ""} document{picked.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
