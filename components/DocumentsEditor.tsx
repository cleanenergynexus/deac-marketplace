"use client";
import { useState } from "react";
import { STAGES, type Stage } from "@/lib/disclosure";
import type { DocRow } from "@/lib/documents";

const TIER_LABEL: Record<Stage, string> = { TEASER: "Public", NDA: "After NDA", LOI: "After LOI", DILIGENCE: "Full data room" };
// Inputs belong to a form that doesn't exist, so React's reset of the listing form after a save leaves them alone.
// Only the hidden JSON field is submitted.
const DETACHED = "documents-editor-detached";

/** Document list inside the listing form: rename, relink, change tier or remove each row; add new ones at the bottom. Saved with the listing. */
export function DocumentsEditor({ initial }: { initial: DocRow[] }) {
  const [rows, setRows] = useState<DocRow[]>(initial);
  const [draft, setDraft] = useState<{ name: string; url: string; access: Stage }>({ name: "", url: "", access: "TEASER" });
  const set = (i: number, patch: Partial<DocRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const add = () => {
    if (!draft.name.trim()) return;
    setRows((rs) => [...rs, { id: "", ...draft, name: draft.name.trim(), url: draft.url.trim() }]);
    setDraft({ name: "", url: "", access: draft.access });
  };
  const tierSelect = (value: Stage, onChange: (s: Stage) => void, label: string) => (
    <select form={DETACHED} aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Stage)} className="input w-auto shrink-0 sm:w-40">
      {STAGES.map((s) => <option key={s} value={s}>{TIER_LABEL[s]}</option>)}
    </select>
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="documents" value={JSON.stringify(rows)} />
      <p className="mb-3 text-xs text-slate-500">
        Each document&apos;s access tier controls when investors can see it: Public (visible immediately), After NDA, After LOI, or Full data room (after they confirm interest post-LOI). Locked documents show to investors by name with a lock, so they know what&apos;s coming. Add the link when the file is ready.
      </p>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.id || `new-${i}`} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
            <input form={DETACHED} aria-label="Document name" value={r.name} onChange={(e) => set(i, { name: e.target.value })} className="input min-w-0 flex-[2]" />
            <input form={DETACHED} aria-label="Link" value={r.url} onChange={(e) => set(i, { url: e.target.value })} placeholder="Link (Drive, SharePoint…)" className="input min-w-0 flex-1 text-xs" />
            {tierSelect(r.access, (access) => set(i, { access }), "Access tier")}
            <button type="button" aria-label={`Remove ${r.name}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="px-2 text-lg leading-none text-slate-400 hover:text-red-600">×</button>
          </li>
        ))}
        {!rows.length && <li className="py-2 text-sm text-slate-500">No documents yet.</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 sm:flex-nowrap">
        <input form={DETACHED} aria-label="New document name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="e.g. Environmental Report" className="input min-w-0 flex-[2]" />
        <input form={DETACHED} aria-label="New document link" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Link (optional)" className="input min-w-0 flex-1 text-xs" />
        {tierSelect(draft.access, (access) => setDraft({ ...draft, access }), "New document access tier")}
        <button type="button" onClick={add} disabled={!draft.name.trim()} className="btn shrink-0 whitespace-nowrap">+ Add Document</button>
      </div>
    </div>
  );
}

/** Deletes the listing (submits the surrounding form to `action`) after a confirmation. */
export function DeleteListingButton({ action, title }: { action: (f: FormData) => Promise<void>; title: string }) {
  return (
    <button type="submit" formAction={action} formNoValidate className="btn-ghost text-red-700 hover:bg-red-50"
      onClick={(e) => { if (!confirm(`Delete "${title}"? This removes the listing, its documents, NDAs, LOIs and analysis requests. It can't be undone.`)) e.preventDefault(); }}>
      Delete Listing
    </button>
  );
}
