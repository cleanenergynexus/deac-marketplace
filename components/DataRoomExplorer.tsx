"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { upload, uploadPresigned } from "@vercel/blob/client";
import { createFolder, createStandardFolders, deleteItems, ensureFolders, moveItems, registerFile, renameItem, shareOnListing, unshareFromListing } from "@/app/actions/dataroom";
import { canMoveFolder, cleanName, descendantIds, fileKind, fileUrl, folderPath, formatBytes, storagePath, uploadDirs } from "@/lib/dataroom";
import { STAGES, TIER_LABEL, type Stage } from "@/lib/disclosure";
import { FileIcon, FolderIcon } from "@/components/DataRoomIcons";

export type ExFolder = { id: string; parentId: string | null; name: string; updatedAt: string };
export type ExFile = { id: string; folderId: string | null; name: string; size: number; contentType: string; updatedAt: string; uploadedBy: string | null; shared: Stage | null };
type Props = { projectId: string; rootLabel: string; folders: ExFolder[]; files: ExFile[]; storage: "blob" | "local" | "missing"; uploadMethod: "token" | "presigned" };

type Item = { key: string; kind: "folder"; id: string; name: string; updatedAt: string; folder: ExFolder } | { key: string; kind: "file"; id: string; name: string; updatedAt: string; file: ExFile };
type Upload = { id: number; name: string; pct: number; status: "uploading" | "done" | "error"; error?: string };
type SortKey = "name" | "modified" | "type" | "size";
type Menu = { x: number; y: number; onItem: boolean };
type DropHandlers = { onDragOver: (e: DragEvent) => void; onDragLeave: (e: DragEvent) => void; onDrop: (e: DragEvent) => void };

const DRAG_TYPE = "application/x-deac-dataroom";
const MULTIPART_OVER = 50 * 1024 * 1024;
let uploadSeq = 0;

/** Windows Explorer-style file manager for one project's data room. */
export function DataRoomExplorer({ projectId, rootLabel, folders, files, storage, uploadMethod }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [cwd, setCwd] = useState<string | null>(null);
  const [back, setBack] = useState<(string | null)[]>([]);
  const [fwd, setFwd] = useState<(string | null)[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });
  const [view, setView] = useState<"details" | "tiles">("details");
  const [menu, setMenu] = useState<Menu | null>(null);
  const [cut, setCut] = useState<{ folderIds: string[]; fileIds: string[] } | null>(null);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"share" | "move" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const dirInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  // Open the folder in the address (?folder=) so a link or a refresh lands in the same place.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("folder");
    if (id && folders.some((f) => f.id === id)) setCwd(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (cwd) url.searchParams.set("folder", cwd); else url.searchParams.delete("folder");
    window.history.replaceState(null, "", url);
    setExpanded((e) => new Set([...e, ...folderPath(folders, cwd).map((f) => f.id)]));
  }, [cwd, folders]);
  // A folder that was deleted elsewhere drops you back to its closest surviving parent.
  useEffect(() => { if (cwd && !folders.some((f) => f.id === cwd)) setCwd(null); }, [cwd, folders]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [menu]);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const childFolders = useMemo(() => {
    const m = new Map<string | null, ExFolder[]>();
    for (const f of folders) m.set(f.parentId, [...(m.get(f.parentId) ?? []), f]);
    for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    return m;
  }, [folders]);
  const sizeOf = useCallback((folderId: string) => {
    const ids = descendantIds(folders, folderId);
    return files.filter((f) => f.folderId && ids.has(f.folderId));
  }, [folders, files]);

  const searching = query.trim().length > 0;
  const items: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fs = searching ? folders.filter((f) => f.name.toLowerCase().includes(q)) : (childFolders.get(cwd) ?? []);
    const fl = searching ? files.filter((f) => f.name.toLowerCase().includes(q)) : files.filter((f) => f.folderId === cwd);
    const cmp = (a: Item, b: Item) => {
      let r = 0;
      if (sort.key === "modified") r = a.updatedAt.localeCompare(b.updatedAt);
      else if (sort.key === "size" && a.kind === "file" && b.kind === "file") r = a.file.size - b.file.size;
      else if (sort.key === "type" && a.kind === "file" && b.kind === "file") r = fileKind(a.name).label.localeCompare(fileKind(b.name).label);
      return (r || a.name.localeCompare(b.name, undefined, { numeric: true })) * sort.dir;
    };
    return [
      ...fs.map((f): Item => ({ key: `d:${f.id}`, kind: "folder", id: f.id, name: f.name, updatedAt: f.updatedAt, folder: f })).sort(cmp),
      ...fl.map((f): Item => ({ key: `f:${f.id}`, kind: "file", id: f.id, name: f.name, updatedAt: f.updatedAt, file: f })).sort(cmp),
    ];
  }, [folders, files, childFolders, cwd, query, searching, sort]);

  const sel = items.filter((i) => selected.has(i.key));
  const selFolderIds = sel.filter((i) => i.kind === "folder").map((i) => i.id);
  const selFileIds = sel.filter((i) => i.kind === "file").map((i) => i.id);
  const sharedSel = sel.filter((i) => i.kind === "file" && i.file.shared);
  const canUpload = storage !== "missing";

  // ---------- actions ----------
  const run = async (fn: () => Promise<{ error?: string } | void>) => {
    try {
      const r = await fn();
      if (r && r.error) setToast(r.error);
    } catch (e) {
      setToast((e as Error).message || "Something went wrong.");
    }
    startTransition(() => router.refresh());
  };

  const go = (id: string | null, push = true) => {
    if (id === cwd && !searching) return;
    if (push) { setBack((b) => [...b, cwd]); setFwd([]); }
    setCwd(id); setQuery(""); setSelected(new Set()); setAnchor(null); setRenaming(null);
  };
  const goBack = () => { if (!back.length) return; setFwd((f) => [cwd, ...f]); go(back[back.length - 1], false); setBack((b) => b.slice(0, -1)); };
  const goFwd = () => { if (!fwd.length) return; setBack((b) => [...b, cwd]); go(fwd[0], false); setFwd((f) => f.slice(1)); };
  const goUp = () => { if (cwd) go(folderById.get(cwd)?.parentId ?? null); };

  const open = (it: Item) => {
    if (it.kind === "folder") go(it.id);
    else window.open(fileUrl(it.id), "_blank", "noopener");
  };
  const download = (ids: string[]) => ids.forEach((id, i) => setTimeout(() => {
    const a = document.createElement("a");
    a.href = `${fileUrl(id)}?download=1`;
    a.download = "";
    document.body.appendChild(a); a.click(); a.remove();
  }, i * 400));

  const newFolder = () => run(async () => {
    const r = await createFolder(projectId, cwd);
    if (r.id) { setSelected(new Set([`d:${r.id}`])); setRenaming(`d:${r.id}`); }
    return r;
  });
  const commitRename = (it: Item, name: string) => {
    setRenaming(null);
    if (!cleanName(name) || name.trim() === it.name) return;
    run(() => renameItem(projectId, it.kind, it.id, name));
  };
  const remove = () => {
    if (!sel.length) return;
    const nested = selFolderIds.flatMap((id) => sizeOf(id));
    const shared = [...sel.filter((i) => i.kind === "file" && i.file.shared), ...nested.filter((f) => f.shared)].length;
    const what = sel.length === 1 ? `"${sel[0].name}"${sel[0].kind === "folder" ? " and everything in it" : ""}` : `these ${sel.length} items${selFolderIds.length ? " (folders include everything inside)" : ""}`;
    if (!confirm(`Delete ${what}? This can't be undone.${shared ? `\n\n${shared} file${shared > 1 ? "s are" : " is"} shared on the listing and will be removed from it too.` : ""}`)) return;
    setSelected(new Set());
    run(() => deleteItems(projectId, { folderIds: selFolderIds, fileIds: selFileIds }));
  };
  const move = (keys: string[], target: string | null) => {
    const folderIds = keys.filter((k) => k.startsWith("d:")).map((k) => k.slice(2));
    const fileIds = keys.filter((k) => k.startsWith("f:")).map((k) => k.slice(2));
    if (folderIds.some((id) => !canMoveFolder(folders, id, target))) { setToast("A folder can't be moved into itself or one of its subfolders."); return; }
    setCut(null);
    run(() => moveItems(projectId, { folderIds, fileIds }, target));
  };
  const paste = () => { if (cut) move([...cut.folderIds.map((id) => `d:${id}`), ...cut.fileIds.map((id) => `f:${id}`)], cwd); };

  // ---------- uploads ----------
  const patchUpload = (id: number, patch: Partial<Upload>) => setUploads((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)));
  const uploadEntries = async (entries: { file: File; rel: string }[], target: string | null) => {
    if (!entries.length) return;
    if (!canUpload) { setToast("File storage isn't connected yet. See the note above."); return; }
    const jobs = entries.map((e) => ({ ...e, id: ++uploadSeq }));
    setUploads((us) => [...us.filter((u) => u.status === "uploading"), ...jobs.map((j) => ({ id: j.id, name: j.rel, pct: 0, status: "uploading" as const }))]);
    let dirMap: Record<string, string> = {};
    const dirs = uploadDirs(entries.map((e) => e.rel));
    try {
      if (dirs.length) dirMap = await ensureFolders(projectId, target, dirs);
    } catch (e) {
      setToast((e as Error).message);
      jobs.forEach((j) => patchUpload(j.id, { status: "error", error: "Folder could not be created" }));
      return;
    }
    const queue = [...jobs];
    const worker = async () => {
      for (let j = queue.shift(); j; j = queue.shift()) {
        const job = j;
        try {
          const parts = job.rel.split("/").map(cleanName).filter(Boolean);
          parts.pop();
          const folderId = parts.length ? dirMap[parts.join("/")] ?? target : target;
          let key: string;
          if (storage === "blob") {
            const send = uploadMethod === "presigned" ? uploadPresigned : upload;
            const blob = await send(storagePath(projectId, job.file.name, crypto.randomUUID().slice(0, 8)), job.file, {
              access: "private", handleUploadUrl: "/api/data-room/upload", clientPayload: projectId,
              multipart: job.file.size > MULTIPART_OVER, contentType: job.file.type || undefined,
              onUploadProgress: ({ percentage }) => patchUpload(job.id, { pct: Math.min(99, Math.round(percentage)) }),
            });
            key = blob.pathname;
          } else {
            const body = new FormData();
            body.set("projectId", projectId);
            body.set("file", job.file);
            const res = await fetch("/api/data-room/local-upload", { method: "POST", body });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Upload failed");
            key = json.key;
          }
          const r = await registerFile({ projectId, folderId, name: job.file.name, storageKey: key, contentType: job.file.type });
          if (r.error) throw new Error(r.error);
          patchUpload(job.id, { pct: 100, status: "done" });
        } catch (e) {
          patchUpload(job.id, { status: "error", error: (e as Error).message });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    startTransition(() => router.refresh());
  };
  const onPickFiles = (list: FileList | null, folders = false) => {
    if (!list) return;
    uploadEntries([...list].map((file) => ({ file, rel: folders && file.webkitRelativePath ? file.webkitRelativePath : file.name })), cwd);
  };

  // ---------- drag and drop ----------
  const dragKeys = (it: Item) => (selected.has(it.key) ? [...selected] : [it.key]);
  const onDragStart = (e: DragEvent, it: Item) => {
    const keys = dragKeys(it);
    if (!selected.has(it.key)) setSelected(new Set([it.key]));
    e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(keys));
    e.dataTransfer.effectAllowed = "move";
  };
  const dropProps = (targetKey: string, target: string | null): DropHandlers => ({
    onDragOver: (e: DragEvent) => {
      const t = e.dataTransfer.types;
      if (!t.includes(DRAG_TYPE) && !t.includes("Files")) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = t.includes("Files") ? "copy" : "move";
      setDropTarget(targetKey);
    },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget((d) => (d === targetKey ? null : d)); },
    onDrop: (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      setDropTarget(null);
      const internal = e.dataTransfer.getData(DRAG_TYPE);
      if (internal) {
        const keys: string[] = JSON.parse(internal);
        if (target && keys.includes(`d:${target}`)) return;
        move(keys, target);
        return;
      }
      readDrop(e.dataTransfer).then((entries) => uploadEntries(entries, target));
    },
  });

  // ---------- selection & keyboard ----------
  const click = (e: ReactMouseEvent, it: Item) => {
    listRef.current?.focus();
    if (e.shiftKey && anchor) {
      const a = items.findIndex((i) => i.key === anchor);
      const b = items.findIndex((i) => i.key === it.key);
      const range = items.slice(Math.min(a, b), Math.max(a, b) + 1).map((i) => i.key);
      setSelected(new Set(e.ctrlKey || e.metaKey ? [...selected, ...range] : range));
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const s = new Set(selected);
      if (s.has(it.key)) s.delete(it.key); else s.add(it.key);
      setSelected(s);
    } else setSelected(new Set([it.key]));
    setAnchor(it.key);
  };
  const contextMenu = (e: ReactMouseEvent, it?: Item) => {
    e.preventDefault(); e.stopPropagation();
    if (it && !selected.has(it.key)) { setSelected(new Set([it.key])); setAnchor(it.key); }
    if (!it) setSelected(new Set());
    setMenu({ x: Math.min(e.clientX, window.innerWidth - 230), y: Math.min(e.clientY, window.innerHeight - 330), onItem: !!it });
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (renaming || (e.target as HTMLElement).tagName === "INPUT") return;
    const mod = e.ctrlKey || e.metaKey;
    const idx = items.findIndex((i) => i.key === anchor);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (e.altKey && e.key === "ArrowUp") return goUp();
      const next = items[Math.max(0, Math.min(items.length - 1, idx + (e.key === "ArrowDown" ? 1 : -1)))];
      if (next) { setSelected(new Set([next.key])); setAnchor(next.key); }
    } else if (e.key === "Enter" && sel.length === 1) open(sel[0]);
    else if (e.key === "Backspace" || (e.altKey && e.key === "ArrowLeft")) { e.preventDefault(); if (e.key === "Backspace") goUp(); else goBack(); }
    else if (e.altKey && e.key === "ArrowRight") goFwd();
    else if (e.key === "Delete") remove();
    else if (e.key === "F2" && sel.length === 1) setRenaming(sel[0].key);
    else if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSelected(new Set(items.map((i) => i.key))); }
    else if (mod && e.key.toLowerCase() === "x" && sel.length) setCut({ folderIds: selFolderIds, fileIds: selFileIds });
    else if (mod && e.key.toLowerCase() === "v") paste();
    else if (e.key === "Escape") { setSelected(new Set()); setCut(null); }
  };

  const toggleSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }));
  const date = (iso: string) => (mounted ? new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "");
  const isCut = (it: Item) => !!cut && (it.kind === "folder" ? cut.folderIds.includes(it.id) : cut.fileIds.includes(it.id));
  const path = folderPath(folders, cwd);
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const activeUploads = uploads.filter((u) => u.status === "uploading").length;

  // ---------- render ----------
  const tree = (parent: string | null, depth: number): ReactNode =>
    (childFolders.get(parent) ?? []).map((f) => {
      const kids = childFolders.get(f.id)?.length;
      const isOpen = expanded.has(f.id);
      return (
        <div key={f.id}>
          <div {...dropProps(`t:${f.id}`, f.id)} onClick={() => go(f.id)} onContextMenu={(e) => { e.preventDefault(); go(f.id); }}
            className={`flex cursor-pointer items-center gap-1 rounded py-1 pr-2 text-sm ${cwd === f.id && !searching ? "bg-brand-100 text-brand-900" : "hover:bg-slate-100"} ${dropTarget === `t:${f.id}` ? "ring-2 ring-brand-500" : ""}`}
            style={{ paddingLeft: depth * 14 + 4 }} title={f.name}>
            {kids ? (
              <button type="button" aria-label={`${isOpen ? "Collapse" : "Expand"} ${f.name}`} onClick={(e) => { e.stopPropagation(); setExpanded((s) => { const n = new Set(s); if (n.has(f.id)) n.delete(f.id); else n.add(f.id); return n; }); }}
                className="flex h-4 w-4 items-center justify-center text-[10px] text-slate-500">{isOpen ? "▼" : "▶"}</button>
            ) : <span className="w-4" />}
            <FolderIcon open={cwd === f.id} className="h-4 w-4" />
            <span className="truncate">{f.name}</span>
          </div>
          {isOpen && tree(f.id, depth + 1)}
        </div>
      );
    });

  const nameCell = (it: Item) => renaming === it.key ? (
    <RenameInput initial={it.name} isFile={it.kind === "file"} onDone={(v) => (v === null ? setRenaming(null) : commitRename(it, v))} />
  ) : <span className="truncate">{it.name}</span>;

  return (
    <div className="card flex flex-col overflow-hidden" onContextMenu={(e) => e.preventDefault()}>
      {/* Command bar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
        <ToolButton onClick={newFolder} icon="＋">New folder</ToolButton>
        <ToolButton onClick={() => fileInput.current?.click()} disabled={!canUpload} icon="⇪">Upload files</ToolButton>
        <ToolButton onClick={() => dirInput.current?.click()} disabled={!canUpload} icon="⇪">Upload folder</ToolButton>
        <Divider />
        <ToolButton onClick={() => sel.length === 1 && setRenaming(sel[0].key)} disabled={sel.length !== 1}>Rename</ToolButton>
        <ToolButton onClick={() => setCut({ folderIds: selFolderIds, fileIds: selFileIds })} disabled={!sel.length}>Cut</ToolButton>
        <ToolButton onClick={paste} disabled={!cut}>Paste</ToolButton>
        <ToolButton onClick={() => setDialog("move")} disabled={!sel.length}>Move to…</ToolButton>
        <ToolButton onClick={() => download(selFileIds)} disabled={!selFileIds.length}>Download</ToolButton>
        <ToolButton onClick={remove} disabled={!sel.length} danger>Delete</ToolButton>
        <Divider />
        <ToolButton onClick={() => setDialog("share")} disabled={!sel.length} icon="↗">Share on listing</ToolButton>
        <div className="ml-auto flex items-center gap-1">
          <ToolButton onClick={() => setView(view === "details" ? "tiles" : "details")}>{view === "details" ? "▦ Icons" : "☰ Details"}</ToolButton>
        </div>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { onPickFiles(e.target.files); e.target.value = ""; }} />
        <input ref={dirInput} type="file" multiple hidden onChange={(e) => { onPickFiles(e.target.files, true); e.target.value = ""; }} {...{ webkitdirectory: "", directory: "" }} />
      </div>

      {/* Address bar */}
      <div className="flex items-center gap-1 border-b border-slate-200 px-2 py-1.5">
        <NavButton label="Back" onClick={goBack} disabled={!back.length}>←</NavButton>
        <NavButton label="Forward" onClick={goFwd} disabled={!fwd.length}>→</NavButton>
        <NavButton label="Up one level" onClick={goUp} disabled={!cwd}>↑</NavButton>
        <nav aria-label="Folder path" className="flex min-w-0 flex-1 items-center overflow-x-auto rounded border border-slate-300 bg-white px-2 py-1 text-sm">
          <Crumb drop={dropProps("c:root", null)} active={dropTarget === "c:root"} onClick={() => go(null)}><FolderIcon className="h-4 w-4" /> {rootLabel}</Crumb>
          {path.map((f) => (
            <span key={f.id} className="flex items-center">
              <span className="px-1 text-slate-400">›</span>
              <Crumb drop={dropProps(`c:${f.id}`, f.id)} active={dropTarget === `c:${f.id}`} onClick={() => go(f.id)}>{f.name}</Crumb>
            </span>
          ))}
          {searching && <span className="ml-2 text-slate-500">› Search results</span>}
        </nav>
        <input value={query} onChange={(e) => { setQuery(e.target.value); setSelected(new Set()); }} placeholder="Search data room" aria-label="Search data room" className="input w-36 py-1 sm:w-56" />
      </div>

      {toast && <div role="alert" className="flex items-center justify-between gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{toast}<button onClick={() => setToast(null)} aria-label="Dismiss" className="px-1">×</button></div>}

      <div className="flex min-h-[460px]">
        {/* Navigation pane */}
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-r border-slate-200 p-2 sm:block">
          <div {...dropProps("t:root", null)} onClick={() => go(null)}
            className={`flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-sm font-medium ${cwd === null && !searching ? "bg-brand-100 text-brand-900" : "hover:bg-slate-100"} ${dropTarget === "t:root" ? "ring-2 ring-brand-500" : ""}`}>
            <FolderIcon open={cwd === null} className="h-4 w-4" /><span className="truncate">{rootLabel}</span>
          </div>
          {tree(null, 1)}
        </aside>

        {/* Content pane */}
        <div ref={listRef} tabIndex={0} onKeyDown={onKey} onContextMenu={(e) => contextMenu(e)} onClick={(e) => { if (e.target === e.currentTarget) setSelected(new Set()); }}
          {...dropProps("list", cwd)}
          className={`relative min-w-0 flex-1 overflow-auto outline-none ${dropTarget === "list" ? "bg-brand-50 ring-2 ring-inset ring-brand-500" : ""}`}>
          {!items.length ? (
            <EmptyState searching={searching} isRoot={cwd === null} hasAny={folders.length + files.length > 0} canUpload={canUpload}
              onStandard={() => run(() => createStandardFolders(projectId))} onUpload={() => fileInput.current?.click()} />
          ) : view === "details" ? (
            <table className="w-full select-none text-sm">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <SortTh k="name" sort={sort} onSort={toggleSort} className="w-[45%] pl-3">Name</SortTh>
                  {searching && <th className="px-2 py-1.5 font-medium">Folder</th>}
                  <SortTh k="modified" sort={sort} onSort={toggleSort} className="hidden md:table-cell">Date modified</SortTh>
                  <SortTh k="type" sort={sort} onSort={toggleSort} className="hidden lg:table-cell">Type</SortTh>
                  <SortTh k="size" sort={sort} onSort={toggleSort} className="hidden text-right sm:table-cell">Size</SortTh>
                  <th className="px-2 py-1.5 font-medium">On listing</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const isSel = selected.has(it.key);
                  const drop = it.kind === "folder" ? dropProps(it.key, it.id) : {};
                  return (
                    <tr key={it.key} draggable={renaming !== it.key} onDragStart={(e) => onDragStart(e, it)} {...drop}
                      onClick={(e) => click(e, it)} onDoubleClick={() => open(it)} onContextMenu={(e) => contextMenu(e, it)}
                      aria-selected={isSel}
                      className={`cursor-default ${isSel ? "bg-brand-100" : "hover:bg-slate-50"} ${dropTarget === it.key ? "ring-2 ring-inset ring-brand-500" : ""} ${isCut(it) ? "opacity-50" : ""}`}>
                      <td className="max-w-0 py-1.5 pl-3 pr-2">
                        <div className="flex min-w-0 items-center gap-2">{it.kind === "folder" ? <FolderIcon /> : <FileIcon name={it.name} />}{nameCell(it)}</div>
                      </td>
                      {searching && <td className="truncate px-2 py-1.5 text-xs text-slate-500">{[rootLabel, ...folderPath(folders, it.kind === "folder" ? it.folder.parentId : it.file.folderId).map((f) => f.name)].join(" › ")}</td>}
                      <td className="hidden whitespace-nowrap px-2 py-1.5 text-slate-500 md:table-cell">{date(it.updatedAt)}</td>
                      <td className="hidden whitespace-nowrap px-2 py-1.5 text-slate-500 lg:table-cell">{it.kind === "folder" ? "File folder" : fileKind(it.name).label}</td>
                      <td className="hidden whitespace-nowrap px-2 py-1.5 text-right text-slate-500 sm:table-cell">{it.kind === "file" ? formatBytes(it.file.size) : ""}</td>
                      <td className="whitespace-nowrap px-2 py-1.5">{it.kind === "file" ? it.file.shared && <TierBadge stage={it.file.shared} /> : <FolderShared files={sizeOf(it.id)} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="grid select-none grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1 p-3">
              {items.map((it) => {
                const isSel = selected.has(it.key);
                const drop = it.kind === "folder" ? dropProps(it.key, it.id) : {};
                return (
                  <div key={it.key} draggable={renaming !== it.key} onDragStart={(e) => onDragStart(e, it)} {...drop}
                    onClick={(e) => click(e, it)} onDoubleClick={() => open(it)} onContextMenu={(e) => contextMenu(e, it)} title={it.name}
                    className={`flex flex-col items-center gap-1 rounded p-2 text-center text-xs ${isSel ? "bg-brand-100" : "hover:bg-slate-50"} ${dropTarget === it.key ? "ring-2 ring-brand-500" : ""} ${isCut(it) ? "opacity-50" : ""}`}>
                    {it.kind === "folder" ? <FolderIcon className="h-12 w-12" /> : <FileIcon name={it.name} className="h-12 w-12" />}
                    <div className="line-clamp-2 w-full break-words">{renaming === it.key ? nameCell(it) : it.name}</div>
                    {it.kind === "file" && it.file.shared && <TierBadge stage={it.file.shared} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
        <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
        {sel.length > 0 && <span>{sel.length} selected{selFileIds.length ? ` · ${formatBytes(sel.reduce((s, i) => s + (i.kind === "file" ? i.file.size : 0), 0))}` : ""}</span>}
        {cut && <span>{cut.folderIds.length + cut.fileIds.length} cut. Open a folder and Paste (Ctrl+V) to move.</span>}
        <span className="ml-auto">{files.length} files · {formatBytes(totalSize)} in this data room</span>
      </div>

      {uploads.length > 0 && (
        <div className="border-t border-slate-200 px-3 py-2 text-xs">
          <div className="mb-1 flex items-center justify-between font-medium">
            <span>{activeUploads ? `Uploading ${activeUploads} file${activeUploads > 1 ? "s" : ""}…` : "Uploads finished"}</span>
            {!activeUploads && <button onClick={() => setUploads([])} className="text-brand-600">Clear</button>}
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {uploads.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                {u.status === "error" ? <span className="text-red-700">{u.error}</span> : u.status === "done" ? <span className="text-emerald-700">Done</span> : (
                  <span className="h-1.5 w-28 overflow-hidden rounded bg-slate-200"><span className="block h-full bg-brand-500 transition-all" style={{ width: `${u.pct}%` }} /></span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {menu && (
        <div role="menu" className="fixed z-50 w-56 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.onItem ? (
            <>
              {sel.length === 1 && <MenuItem onClick={() => { setMenu(null); open(sel[0]); }} bold>Open</MenuItem>}
              {selFileIds.length > 0 && <MenuItem onClick={() => { setMenu(null); download(selFileIds); }}>Download</MenuItem>}
              <MenuSep />
              <MenuItem onClick={() => { setMenu(null); setCut({ folderIds: selFolderIds, fileIds: selFileIds }); }}>Cut</MenuItem>
              <MenuItem onClick={() => { setMenu(null); setDialog("move"); }}>Move to…</MenuItem>
              {sel.length === 1 && <MenuItem onClick={() => { setMenu(null); setRenaming(sel[0].key); }}>Rename</MenuItem>}
              <MenuItem onClick={() => { setMenu(null); remove(); }} danger>Delete</MenuItem>
              <MenuSep />
              <MenuItem onClick={() => { setMenu(null); setDialog("share"); }}>Share on listing…</MenuItem>
              {sharedSel.length > 0 && <MenuItem onClick={() => { setMenu(null); run(() => unshareFromListing(projectId, sharedSel.map((i) => i.id))); }}>Remove from listing</MenuItem>}
            </>
          ) : (
            <>
              <MenuItem onClick={() => { setMenu(null); newFolder(); }}>New folder</MenuItem>
              <MenuItem onClick={() => { setMenu(null); fileInput.current?.click(); }} disabled={!canUpload}>Upload files…</MenuItem>
              <MenuItem onClick={() => { setMenu(null); dirInput.current?.click(); }} disabled={!canUpload}>Upload folder…</MenuItem>
              <MenuSep />
              <MenuItem onClick={() => { setMenu(null); paste(); }} disabled={!cut}>Paste</MenuItem>
              {cwd === null && !searching && <MenuItem onClick={() => { setMenu(null); run(() => createStandardFolders(projectId)); }}>Add standard folders</MenuItem>}
              <MenuItem onClick={() => { setMenu(null); setSelected(new Set(items.map((i) => i.key))); }}>Select all</MenuItem>
              <MenuItem onClick={() => { setMenu(null); startTransition(() => router.refresh()); }}>Refresh</MenuItem>
            </>
          )}
        </div>
      )}

      {dialog === "share" && (
        <ShareDialog
          count={selFileIds.length + selFolderIds.reduce((n, id) => n + sizeOf(id).length, 0)}
          onClose={() => setDialog(null)}
          onShare={(access) => { setDialog(null); run(() => shareOnListing(projectId, [...selFileIds, ...selFolderIds.flatMap((id) => sizeOf(id).map((f) => f.id))], access)); }} />
      )}
      {dialog === "move" && (
        <MoveDialog folders={folders} childFolders={childFolders} rootLabel={rootLabel} moving={selFolderIds}
          onClose={() => setDialog(null)} onMove={(target) => { setDialog(null); move(sel.map((i) => i.key), target); }} />
      )}
    </div>
  );
}

// ---------- pieces ----------

/** Reads files (and whole folders) dropped from the desktop. */
async function readDrop(dt: DataTransfer): Promise<{ file: File; rel: string }[]> {
  type Entry = { isFile: boolean; isDirectory: boolean; name: string; file?: (cb: (f: File) => void, err: (e: unknown) => void) => void; createReader?: () => { readEntries: (cb: (es: Entry[]) => void, err: (e: unknown) => void) => void } };
  const roots = [...dt.items].filter((i) => i.kind === "file").map((i) => (i as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.() ?? null);
  if (!roots.length || roots.some((r) => !r)) return [...dt.files].map((file) => ({ file, rel: file.name }));
  const out: { file: File; rel: string }[] = [];
  const walk = async (e: Entry, prefix: string): Promise<void> => {
    if (e.isFile && e.file) {
      out.push({ file: await new Promise<File>((res, rej) => e.file!(res, rej)), rel: prefix + e.name });
    } else if (e.isDirectory && e.createReader) {
      const reader = e.createReader();
      for (;;) {
        const batch = await new Promise<Entry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${prefix}${e.name}/`);
      }
    }
  };
  for (const r of roots) await walk(r!, "");
  return out;
}

function RenameInput({ initial, isFile, onDone }: { initial: string; isFile: boolean; onDone: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Like Explorer, select the name but not the extension.
    const dot = isFile ? initial.lastIndexOf(".") : -1;
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial, isFile]);
  const finish = (v: string | null) => { if (done.current) return; done.current = true; onDone(v); };
  return (
    <input ref={ref} defaultValue={initial} aria-label="New name" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") finish(e.currentTarget.value); if (e.key === "Escape") finish(null); }}
      onBlur={(e) => finish(e.currentTarget.value)} className="w-full min-w-0 rounded border border-brand-500 px-1 py-0.5 text-sm outline-none" />
  );
}

function ToolButton({ children, onClick, disabled, danger, icon }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; icon?: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1 rounded px-2 py-1 disabled:cursor-not-allowed disabled:opacity-40 ${danger ? "text-red-700 hover:bg-red-50" : "text-slate-700 hover:bg-slate-200"}`}>
      {icon && <span aria-hidden className="text-base leading-none">{icon}</span>}{children}
    </button>
  );
}
const Divider = () => <span className="mx-1 hidden h-5 w-px bg-slate-300 sm:block" />;

function NavButton({ children, label, onClick, disabled }: { children: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="h-7 w-7 rounded text-slate-700 hover:bg-slate-200 disabled:opacity-30">{children}</button>;
}

function Crumb({ children, onClick, active, drop }: { children: ReactNode; onClick: () => void; active: boolean; drop: DropHandlers }) {
  return <button type="button" onClick={onClick} {...drop} className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1 hover:bg-slate-100 ${active ? "ring-2 ring-brand-500" : ""}`}>{children}</button>;
}

function SortTh({ k, sort, onSort, children, className = "" }: { k: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (k: SortKey) => void; children: ReactNode; className?: string }) {
  return (
    <th className={`px-2 py-1.5 font-medium ${className}`} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => onSort(k)} className="hover:text-slate-900">{children}{sort.key === k ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</button>
    </th>
  );
}

const TIER_TONE: Record<Stage, string> = { TEASER: "bg-violet-100 text-violet-800", NDA: "bg-amber-100 text-amber-800", LOI: "bg-brand-100 text-brand-700", DILIGENCE: "bg-emerald-100 text-emerald-800" };
function TierBadge({ stage }: { stage: Stage }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${TIER_TONE[stage]}`}>{TIER_LABEL[stage]}</span>;
}
function FolderShared({ files }: { files: ExFile[] }) {
  const n = files.filter((f) => f.shared).length;
  return n ? <span className="text-xs text-slate-500">{n} of {files.length} shared</span> : null;
}

function MenuItem({ children, onClick, disabled, danger, bold }: { children: ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; bold?: boolean }) {
  return <button type="button" role="menuitem" onClick={onClick} disabled={disabled} className={`block w-full px-4 py-1.5 text-left hover:bg-slate-100 disabled:opacity-40 ${danger ? "text-red-700" : ""} ${bold ? "font-semibold" : ""}`}>{children}</button>;
}
const MenuSep = () => <div className="my-1 border-t border-slate-100" />;

function EmptyState({ searching, isRoot, hasAny, canUpload, onStandard, onUpload }: { searching: boolean; isRoot: boolean; hasAny: boolean; canUpload: boolean; onStandard: () => void; onUpload: () => void }) {
  if (searching) return <p className="p-8 text-center text-sm text-slate-500">No files or folders match your search.</p>;
  return (
    <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center text-sm text-slate-500">
      <FolderIcon className="h-12 w-12 opacity-60" />
      <p>{isRoot && !hasAny ? "This data room is empty." : "This folder is empty."} {canUpload && "Drag files or whole folders here from your computer, or use Upload."}</p>
      <div className="flex gap-2">
        {isRoot && !hasAny && <button type="button" onClick={onStandard} className="btn-ghost">Create standard folders</button>}
        {canUpload && <button type="button" onClick={onUpload} className="btn">Upload files</button>}
      </div>
      {isRoot && !hasAny && <a href="/admin/data-room-template" className="text-xs text-brand-600">Edit the standard folders</a>}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div role="dialog" aria-label={title} className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ShareDialog({ count, onClose, onShare }: { count: number; onClose: () => void; onShare: (s: Stage) => void }) {
  const [access, setAccess] = useState<Stage>("NDA");
  return (
    <Modal title="Share on listing" onClose={onClose}>
      {count ? (
        <>
          <p className="mb-3 text-sm text-slate-600">Adds {count} file{count > 1 ? "s" : ""} to the listing&apos;s Documents tab. Investors can open {count > 1 ? "them" : "it"} once they reach this tier. Files already on the listing move to this tier.</p>
          <div className="space-y-1">
            {STAGES.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="radio" name="tier" checked={access === s} onChange={() => setAccess(s)} />
                <TierBadge stage={s} />
                <span className="text-slate-500">{s === "TEASER" ? "every approved member" : s === "NDA" ? "after NDA is confirmed" : s === "LOI" ? "after LOI is accepted" : "after full diligence access"}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button type="button" onClick={() => onShare(access)} className="btn">Share {count} file{count > 1 ? "s" : ""}</button></div>
        </>
      ) : <><p className="text-sm text-slate-600">The selected folders have no files yet.</p><div className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="btn-ghost">Close</button></div></>}
    </Modal>
  );
}

function MoveDialog({ folders, childFolders, rootLabel, moving, onClose, onMove }: { folders: ExFolder[]; childFolders: Map<string | null, ExFolder[]>; rootLabel: string; moving: string[]; onClose: () => void; onMove: (t: string | null) => void }) {
  const [target, setTarget] = useState<string | null>(null);
  const blocked = (id: string | null) => moving.some((m) => !canMoveFolder(folders, m, id));
  const rows = (parent: string | null, depth: number): ReactNode => (childFolders.get(parent) ?? []).map((f) => (
    <div key={f.id}>
      <button type="button" disabled={blocked(f.id)} onClick={() => setTarget(f.id)} style={{ paddingLeft: depth * 16 + 8 }}
        className={`flex w-full items-center gap-2 rounded py-1 pr-2 text-left text-sm disabled:opacity-40 ${target === f.id ? "bg-brand-100" : "hover:bg-slate-50"}`}>
        <FolderIcon className="h-4 w-4" /><span className="truncate">{f.name}</span>
      </button>
      {rows(f.id, depth + 1)}
    </div>
  ));
  return (
    <Modal title="Move to folder" onClose={onClose}>
      <div className="max-h-72 overflow-y-auto rounded border border-slate-200 p-1">
        <button type="button" onClick={() => setTarget(null)} className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm font-medium ${target === null ? "bg-brand-100" : "hover:bg-slate-50"}`}>
          <FolderIcon className="h-4 w-4" />{rootLabel}
        </button>
        {rows(null, 1)}
      </div>
      <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button type="button" onClick={() => onMove(target)} className="btn">Move here</button></div>
    </Modal>
  );
}
