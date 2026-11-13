"use client";
import { useEffect, useState } from "react";
import { docNameFromFile, type DrFile, type DrFolder } from "@/lib/dataroom";
import { STAGES, TIER_LABEL, type Stage } from "@/lib/disclosure";
import { DataRoomCheckTree } from "@/components/DataRoomCheckTree";

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
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const picked = files.filter((f) => checked.has(f.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div role="dialog" aria-label="Add from data room" className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold">Add from Data Room</h3>
        <p className="mb-3 text-sm text-slate-600">Tick the entire data room, whole folders or single files to add to the listing&apos;s documents. Investors can open them once they reach the tier you pick.</p>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search files" aria-label="Search files" className="input mb-2" />
        <div className="min-h-[200px] flex-1 overflow-y-auto rounded border border-slate-200 p-1">
          <DataRoomCheckTree rootLabel="All folders" folders={folders} files={files} checked={checked} onChange={setChecked} query={query}
            disabled={(f) => taken.has(f.id)} note={(f) => taken.has(f.id) && <span className="text-xs">on listing</span>} />
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
