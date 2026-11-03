"use client";
import { useMemo, useState, type ReactNode } from "react";
import { descendantIds, formatBytes, type DrFolder } from "@/lib/dataroom";
import { MAX_BINARY_BYTES, planSources, readKind } from "@/lib/wizard";
import { FileIcon, FolderIcon } from "@/components/DataRoomIcons";

export type PickFile = { id: string; folderId: string | null; name: string; size: number };

/** "N of M readable files · PDFs & images X of 22 MB" */
export function SourceSummary({ files, checked }: { files: PickFile[]; checked: Set<string> }) {
  const readable = files.filter((f) => readKind(f.name).kind);
  const picked = files.filter((f) => checked.has(f.id));
  const plan = planSources(picked);
  const binary = picked.filter((f) => ["pdf", "image"].includes(readKind(f.name).kind ?? "")).reduce((n, f) => n + f.size, 0);
  return <span className="text-xs text-slate-500">{plan.use.length} of {readable.length} readable files · PDFs & images {formatBytes(binary)} of {formatBytes(MAX_BINARY_BYTES)}</span>;
}

/** Folder tree with checkboxes for choosing which data room files Claude reads. */
export function SourceFilePicker({ folders, files, checked, onChange, generatedIds = [], emptyText }: {
  folders: DrFolder[]; files: PickFile[]; checked: Set<string>; onChange: (next: Set<string>) => void; generatedIds?: string[]; emptyText: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const readable = useMemo(() => files.filter((f) => readKind(f.name).kind), [files]);
  const kids = useMemo(() => {
    const m = new Map<string | null, DrFolder[]>();
    for (const f of folders) m.set(f.parentId, [...(m.get(f.parentId) ?? []), f]);
    for (const l of m.values()) l.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return m;
  }, [folders]);
  const filesIn = (folderId: string | null) => files.filter((f) => f.folderId === folderId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const readableUnder = (folderId: string) => { const ids = descendantIds(folders, folderId); return readable.filter((f) => f.folderId && ids.has(f.folderId)); };
  const toggle = (ids: string[], on: boolean) => { const n = new Set(checked); for (const id of ids) if (on) n.add(id); else n.delete(id); onChange(n); };
  const plan = planSources(files.filter((f) => checked.has(f.id)));

  const tree = (parent: string | null, depth: number): ReactNode => (
    <>
      {(kids.get(parent) ?? []).map((d) => {
        const under = readableUnder(d.id);
        const all = under.length > 0 && under.every((f) => checked.has(f.id));
        const open = !collapsed.has(d.id);
        const count = under.filter((f) => checked.has(f.id)).length;
        return (
          <div key={d.id}>
            <div className="flex items-center gap-2 rounded py-1 pr-2 text-sm hover:bg-slate-50" style={{ paddingLeft: depth * 16 + 8 }}>
              <input type="checkbox" aria-label={`Select all in ${d.name}`} disabled={!under.length} checked={all} onChange={(e) => toggle(under.map((f) => f.id), e.target.checked)} />
              <button type="button" onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); return n; })} className="flex min-w-0 items-center gap-1.5">
                <FolderIcon open={open} className="h-4 w-4" /><span className="truncate font-medium">{d.name}</span>
              </button>
              {count > 0 && <span className="ml-auto shrink-0 text-xs text-slate-500">{count} selected</span>}
            </div>
            {open && tree(d.id, depth + 1)}
          </div>
        );
      })}
      {filesIn(parent).map((f) => {
        const r = readKind(f.name);
        return (
          <label key={f.id} className={`flex items-center gap-2 rounded py-1 pr-2 text-sm ${r.kind ? "cursor-pointer hover:bg-slate-50" : "text-slate-400"}`} style={{ paddingLeft: depth * 16 + 8 }} title={r.kind ? undefined : r.reason}>
            <input type="checkbox" disabled={!r.kind} checked={checked.has(f.id)} onChange={(e) => toggle([f.id], e.target.checked)} />
            <FileIcon name={f.name} className="h-4 w-4" />
            <span className="truncate">{f.name}</span>
            {generatedIds.includes(f.id) && <span className="shrink-0 rounded bg-violet-100 px-1.5 text-[11px] text-violet-800">wizard</span>}
            <span className="ml-auto shrink-0 text-xs text-slate-400">{r.kind ? formatBytes(f.size) : "can't read"}</span>
          </label>
        );
      })}
    </>
  );

  if (!files.length) return <p className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">{emptyText}</p>;
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-2 text-xs">
        <button type="button" className="btn-ghost py-1 text-xs" onClick={() => onChange(new Set(readable.map((f) => f.id)))}>Select all</button>
        <button type="button" className="btn-ghost py-1 text-xs" onClick={() => onChange(new Set())}>Clear</button>
      </div>
      <div className="max-h-80 overflow-y-auto rounded border border-slate-200 p-1">{tree(null, 0)}</div>
      <p className="mt-2 text-xs text-slate-500">Reads PDF, Word (.docx), Excel (.xlsx, values as last saved), PowerPoint (.pptx), images and text files. Older .doc / .xls / .ppt files and drawings can&apos;t be read; save them as PDF.</p>
      {plan.skipped.length > 0 && (
        <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">
          <b>Won&apos;t be read:</b>
          <ul className="list-disc pl-5">{plan.skipped.map((s) => <li key={s.name}>{s.name}: {s.reason}</li>)}</ul>
        </div>
      )}
    </>
  );
}
