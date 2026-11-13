import type { ReactNode } from "react";
import { fileUrl, formatBytes } from "@/lib/dataroom";
import { atLeast, type Stage } from "@/lib/disclosure";
import { FileIcon, FolderIcon } from "@/components/DataRoomIcons";

export type ListingDrFolder = { id: string; parentId: string | null; name: string };
export type ListingDrFile = { id: string; folderId: string | null; name: string; size: number; stage: Stage };

/** Investor-facing tier badges (also used on the Documents tab). */
export const DOC_BADGE: Record<Stage, { label: string; cls: string }> = {
  TEASER: { label: "Open", cls: "border-emerald-500 text-emerald-700" },
  NDA: { label: "After NDA", cls: "border-amber-500 text-amber-700" },
  LOI: { label: "After LOI", cls: "border-red-400 text-red-600" },
  DILIGENCE: { label: "Full data room", cls: "border-violet-400 text-violet-700" },
};

/**
 * Folders that have nothing shared on this listing still show (empty), so investors see how the data room is organized.
 * Set to false to show only folders that hold a shared file.
 */
export const SHOW_EMPTY_FOLDERS = true;

export function TierPill({ stage, open }: { stage: Stage; open: boolean }) {
  return <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${DOC_BADGE[stage].cls}`}>{open ? "" : "🔒 "}{DOC_BADGE[stage].label}</span>;
}

/**
 * The listing's data room as investors see it: the folder tree, with only the files shared on this listing.
 * Files above the investor's tier show by name with a lock; unshared files never reach this component.
 */
export function ListingDataRoom({ folders, files, stage, showEmpty = SHOW_EMPTY_FOLDERS }: { folders: ListingDrFolder[]; files: ListingDrFile[]; stage: Stage; showEmpty?: boolean }) {
  const kids = new Map<string | null, ListingDrFolder[]>();
  for (const f of folders) kids.set(f.parentId, [...(kids.get(f.parentId) ?? []), f]);
  for (const l of kids.values()) l.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const known = new Set(folders.map((f) => f.id));
  // A file whose folder is gone shows at the top level.
  const filesIn = (id: string | null) => files.filter((f) => (f.folderId && known.has(f.folderId) ? f.folderId : null) === id).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const count = new Map<string, { total: number; open: number }>();
  const tally = (id: string): { total: number; open: number } => {
    const own = filesIn(id);
    const c = { total: own.length, open: own.filter((f) => atLeast(stage, f.stage)).length };
    for (const k of kids.get(id) ?? []) { const x = tally(k.id); c.total += x.total; c.open += x.open; }
    count.set(id, c);
    return c;
  };
  for (const r of kids.get(null) ?? []) tally(r.id);

  const fileRow = (f: ListingDrFile, depth: number) => {
    const open = atLeast(stage, f.stage);
    return (
      <li key={f.id} className="flex items-center gap-3 border-b border-slate-100 py-2 pr-1" style={{ paddingLeft: depth * 20 + 4 }}>
        <FileIcon name={f.name} className="h-5 w-5" />
        <span className="min-w-0 flex-1 truncate">
          {open ? <a href={fileUrl(f.id)} target="_blank" rel="noreferrer" className="font-medium text-brand-600 hover:underline">{f.name}</a> : <span className="text-slate-500">{f.name}</span>}
        </span>
        <span className="hidden text-xs text-slate-400 sm:inline">{formatBytes(f.size)}</span>
        <TierPill stage={f.stage} open={open} />
      </li>
    );
  };
  const tree = (parent: string | null, depth: number): ReactNode[] => [
    ...(kids.get(parent) ?? []).filter((d) => showEmpty || (count.get(d.id)?.total ?? 0) > 0).map((d) => {
      const c = count.get(d.id) ?? { total: 0, open: 0 };
      const locked = c.total - c.open;
      return (
        <li key={d.id}>
          <details open={c.total > 0} className="group">
            <summary className={`flex cursor-pointer list-none items-center gap-2 border-b border-slate-100 py-2 pr-1 hover:bg-slate-50 ${c.total ? "" : "text-slate-400"}`} style={{ paddingLeft: depth * 20 + 4 }}>
              <span className="w-3 text-[10px] text-slate-400 group-open:rotate-90">▶</span>
              <FolderIcon open={c.total > 0} className="h-5 w-5" />
              <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
              <span className="whitespace-nowrap text-xs text-slate-500">
                {c.total ? <>{c.total} file{c.total === 1 ? "" : "s"}{locked > 0 && <span className="ml-1 text-slate-400">· 🔒 {locked} locked</span>}</> : "Nothing shared yet"}
              </span>
            </summary>
            <ul>{tree(d.id, depth + 1)}</ul>
          </details>
        </li>
      );
    }),
    ...filesIn(parent).map((f) => fileRow(f, depth)),
  ];

  const open = files.filter((f) => atLeast(stage, f.stage)).length;
  return (
    <div className="space-y-4">
      <p className="text-slate-700">How the project&apos;s data room is organized and what is shared with you. Locked files open as you move through the NDA, letter of interest and full diligence.</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="font-semibold">{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} shared · ${open} open to you` : "No files shared yet"}</span>
        <span className="ml-auto flex flex-wrap gap-1.5">{(Object.keys(DOC_BADGE) as Stage[]).map((s) => <TierPill key={s} stage={s} open={atLeast(stage, s)} />)}</span>
      </div>
      {folders.length || files.length ? (
        <ul className="rounded-lg border border-slate-200 px-2">{tree(null, 0)}</ul>
      ) : <p className="text-sm text-slate-500">The data room is being prepared.</p>}
    </div>
  );
}
