"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PdfPages } from "@/components/PdfPages";
import { saveEnvelope } from "@/app/actions/esign";
import { DOC_KINDS, FIELD_TYPES, type FieldType, type SignField } from "@/lib/esign";

const PALETTE: { title: string; types: FieldType[] }[] = [
  { title: "Signing", types: ["SIGNATURE", "INITIALS", "DATE"] },
  { title: "Signer details", types: ["NAME", "TITLE", "COMPANY", "EMAIL", "PHONE"] },
  { title: "Address", types: ["ADDRESS", "STREET", "CITY", "STATE", "POSTAL", "COUNTRY"] },
  { title: "Other", types: ["TEXT", "CHECKBOX"] },
];

const COLORS: Partial<Record<FieldType, string>> = { SIGNATURE: "border-amber-500 bg-amber-100/70 text-amber-900", INITIALS: "border-amber-500 bg-amber-100/70 text-amber-900", DATE: "border-sky-500 bg-sky-100/70 text-sky-900" };
const color = (t: FieldType) => COLORS[t] ?? "border-brand-500 bg-brand-100/70 text-brand-800";

export type EditorSettings = { title: string; kind: string; projectId: string; message: string; autoApprove: boolean; listingNda: boolean };

/**
 * Place signing fields on a PDF: pick a field type, click the page to drop it, drag to move, drag the corner to
 * resize. Changes save on their own.
 */
export function SignFieldEditor({ id, pdfUrl, initial, settings: initialSettings, projects, isTemplate, locked }: {
  id: string;
  pdfUrl: string;
  initial: SignField[];
  settings: EditorSettings;
  projects: { id: string; label: string }[];
  isTemplate: boolean;
  locked: boolean;
}) {
  const [fields, setFields] = useState<SignField[]>(initial);
  const [settings, setSettings] = useState(initialSettings);
  const [tool, setTool] = useState<FieldType | null>("SIGNATURE");
  const [selected, setSelected] = useState<string | null>(null);
  const [save, setSave] = useState<"saved" | "saving" | "dirty" | { error: string }>("saved");
  const first = useRef(true);

  // Auto-save shortly after the last change.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (locked) return;
    setSave("dirty");
    const t = setTimeout(async () => {
      setSave("saving");
      const f = new FormData();
      f.set("id", id);
      f.set("fields", JSON.stringify(fields));
      f.set("title", settings.title);
      f.set("kind", settings.kind);
      f.set("projectId", settings.projectId);
      f.set("message", settings.message);
      if (settings.autoApprove) f.set("autoApprove", "on");
      if (settings.listingNda) f.set("listingNda", "on");
      const r = await saveEnvelope(f).catch(() => ({ error: "Couldn't save. Check your connection." }));
      setSave(r.error ? { error: r.error } : "saved");
    }, 700);
    return () => clearTimeout(t);
  }, [fields, settings, id, locked]);

  const sel = fields.find((f) => f.id === selected) ?? null;
  const update = useCallback((fid: string, patch: Partial<SignField>) => setFields((fs) => fs.map((f) => (f.id === fid ? { ...f, ...patch } : f))), []);
  const remove = (fid: string) => { setFields((fs) => fs.filter((f) => f.id !== fid)); setSelected(null); };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!selected || locked) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(selected); }
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const place = (page: number, x: number, y: number) => {
    if (locked) return;
    if (!tool) { setSelected(null); return; }
    const t = FIELD_TYPES[tool];
    const nf: SignField = {
      id: `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      type: tool, page, w: t.w, h: t.h,
      x: Math.min(Math.max(0, x - t.w / 2), 1 - t.w),
      y: Math.min(Math.max(0, y - t.h / 2), 1 - t.h),
      required: tool !== "CHECKBOX",
      ...(tool === "TEXT" ? { label: "Text" } : tool === "CHECKBOX" ? { label: "I agree" } : {}),
    };
    setFields((fs) => [...fs, nf]);
    setSelected(nf.id);
  };

  const counts = fields.reduce<Record<string, number>>((m, f) => ((m[f.type] = (m[f.type] ?? 0) + 1), m), {});
  const set = <K extends keyof EditorSettings>(k: K, v: EditorSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  return (
    <div className={`grid gap-4 ${locked ? "" : "lg:grid-cols-[17rem_minmax(0,1fr)]"}`}>
      {!locked && <aside className="space-y-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
        <div className="card space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{isTemplate ? "Template" : "Document"}</h2>
            <SaveStatus state={save} locked={locked} />
          </div>
          <label className="block"><span className="label">Title</span><input className="input" value={settings.title} disabled={locked} onChange={(e) => set("title", e.target.value)} /></label>
          <label className="block"><span className="label">Type</span>
            <select className="input" value={settings.kind} disabled={locked} onChange={(e) => set("kind", e.target.value)}>{DOC_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select>
          </label>
          <label className="block"><span className="label">Listing</span>
            <select className="input" value={settings.projectId} disabled={locked} onChange={(e) => set("projectId", e.target.value)}>
              <option value="">{isTemplate ? "Any listing (default)" : "None"}</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {(settings.kind === "NDA" || settings.kind === "LOI") && (
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" className="mt-0.5" checked={settings.autoApprove} disabled={locked} onChange={(e) => set("autoApprove", e.target.checked)} />
              <span>When an investor signs, {settings.kind === "NDA" ? (settings.projectId ? "confirm their NDA on this listing right away (opens the NDA tier)" : "record a master NDA (counts for every listing)") : "accept their letter of interest right away"}. Untick to review it in NDAs &amp; LOIs first.</span>
            </label>
          )}
          {isTemplate && settings.kind === "NDA" && (
            <label className="flex items-start gap-2 text-xs text-slate-600">
              <input type="checkbox" className="mt-0.5" checked={settings.listingNda} disabled={locked} onChange={(e) => set("listingNda", e.target.checked)} />
              <span>Investors sign this NDA themselves from the listing&apos;s NDA step {settings.projectId ? "(this listing)" : "(every listing without its own NDA template)"}.</span>
            </label>
          )}
          <label className="block"><span className="label">Message to the signer</span><textarea className="input min-h-16" value={settings.message} disabled={locked} onChange={(e) => set("message", e.target.value)} placeholder="Optional. Shown in the email and on the signing page." /></label>
        </div>

        {!locked && (
          <div className="card p-4">
            <h2 className="font-semibold">Fields</h2>
            <p className="mt-1 text-xs text-slate-500">Pick a field, then click the document where it goes. Drag to move, drag the corner to resize. Details are prefilled from the signer&apos;s record.</p>
            {PALETTE.map((g) => (
              <div key={g.title} className="mt-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.title}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {g.types.map((t) => (
                    <button key={t} type="button" onClick={() => setTool(tool === t ? null : t)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium ${tool === t ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:border-brand-400"}`}>
                      {FIELD_TYPES[t].label}{counts[t] ? <span className="ml-1 opacity-70">·{counts[t]}</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {sel && !locked && (
          <div className="card space-y-3 p-4">
            <div className="flex items-center justify-between"><h2 className="font-semibold">{FIELD_TYPES[sel.type].label}</h2><span className="text-xs text-slate-500">Page {sel.page + 1}</span></div>
            {(sel.type === "TEXT" || sel.type === "CHECKBOX") && (
              <label className="block"><span className="label">{sel.type === "CHECKBOX" ? "Checkbox text" : "Question / label"}</span><input className="input" value={sel.label ?? ""} onChange={(e) => update(sel.id, { label: e.target.value })} /></label>
            )}
            {sel.type !== "DATE" && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.required} onChange={(e) => update(sel.id, { required: e.target.checked })} /> Required</label>
            )}
            <div className="flex gap-2">
              <button type="button" className="btn-ghost flex-1 py-1.5" onClick={() => { const c = { ...sel, id: `f${Date.now().toString(36)}`, y: Math.min(sel.y + sel.h + 0.01, 1 - sel.h) }; setFields((fs) => [...fs, c]); setSelected(c.id); }}>Duplicate</button>
              <button type="button" className="btn-danger flex-1" onClick={() => remove(sel.id)}>Remove</button>
            </div>
          </div>
        )}
      </aside>}

      <div className="min-w-0 rounded-xl bg-slate-200/70 p-3 sm:p-6">
        {!locked && <p className="mb-3 text-center text-xs text-slate-600">{tool ? <>Click the page to place <b>{FIELD_TYPES[tool].label}</b>.</> : "Select a field type on the left to add fields."} {fields.length} field{fields.length === 1 ? "" : "s"} placed.</p>}
        <div className="mx-auto max-w-4xl">
          <PdfPages
            url={pdfUrl}
            onPageClick={place}
            overlay={(page) => fields.filter((f) => f.page === page).map((f) => (
              <FieldBox key={f.id} f={f} selected={f.id === selected} locked={locked} onSelect={() => setSelected(f.id)} onChange={(p) => update(f.id, p)} />
            ))}
          />
        </div>
      </div>
    </div>
  );
}

function SaveStatus({ state, locked }: { state: "saved" | "saving" | "dirty" | { error: string }; locked: boolean }) {
  if (locked) return <span className="text-xs text-slate-500">Sent · read only</span>;
  if (typeof state === "object") return <span className="text-xs text-red-600" title={state.error}>Not saved</span>;
  return <span className={`text-xs ${state === "saved" ? "text-emerald-700" : "text-slate-500"}`}>{state === "saved" ? "All changes saved" : "Saving…"}</span>;
}

/** A placed field: drag to move, drag the bottom-right handle to resize. Positions are page fractions. */
function FieldBox({ f, selected, locked, onSelect, onChange }: { f: SignField; selected: boolean; locked: boolean; onSelect: () => void; onChange: (p: Partial<SignField>) => void }) {
  const start = (e: React.PointerEvent, mode: "move" | "resize") => {
    if (locked) return;
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    const pageEl = (e.currentTarget as HTMLElement).closest("[data-page]") as HTMLElement;
    const r = pageEl.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, o = { ...f };
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / r.width, dy = (ev.clientY - sy) / r.height;
      if (mode === "move") onChange({ x: Math.min(Math.max(0, o.x + dx), 1 - o.w), y: Math.min(Math.max(0, o.y + dy), 1 - o.h) });
      else onChange({ w: Math.min(Math.max(0.015, o.w + dx), 1 - o.x), h: Math.min(Math.max(0.01, o.h + dy), 1 - o.y) });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${FIELD_TYPES[f.type].label} field`}
      onPointerDown={(e) => start(e, "move")}
      onClick={(e) => e.stopPropagation()}
      className={`absolute flex select-none items-center overflow-hidden rounded-sm border px-1 text-[10px] font-semibold leading-none ${color(f.type)} ${locked ? "" : "cursor-move"} ${selected ? "ring-2 ring-brand-600 ring-offset-1" : ""}`}
      style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
    >
      <span className="truncate">{f.type === "TEXT" || f.type === "CHECKBOX" ? (f.type === "CHECKBOX" ? "☐ " : "") + (f.label || FIELD_TYPES[f.type].label) : FIELD_TYPES[f.type].label}{f.required && f.type !== "DATE" ? " *" : ""}</span>
      {!locked && <span onPointerDown={(e) => start(e, "resize")} className="absolute bottom-0 right-0 h-2.5 w-2.5 cursor-se-resize bg-brand-600" />}
    </div>
  );
}
