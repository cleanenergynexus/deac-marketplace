"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MAX_LABEL, MAX_STAGES, type PipelineConfig, type PipelineStage } from "@/lib/pipeline";

type State = { error?: string; ok?: string; config?: PipelineConfig } | undefined;
type Row = PipelineStage & { key: string };
type Funnel = { value: string; label: string };

let seq = 0;
const rows = (list: readonly PipelineStage[]): Row[] => list.map((s) => ({ ...s, key: `r${seq++}` }));

/**
 * Edits a CRM's columns for each deal type: rename, add, reorder, remove, or copy another funnel's columns.
 * `tiles` is how many board tiles sit in each column today, per funnel, so removing a busy column is a deliberate choice.
 * `defaults` is what "Restore defaults" puts back; `board` is the board's address (the funnel is added to it).
 */
export function FunnelEditor({ initial, defaults, board, funnels, start: startFunnel, tiles, action }: {
  initial: PipelineConfig;
  defaults: PipelineConfig;
  board: string;
  funnels: Funnel[];
  start: string;
  tiles: Record<string, Record<string, number>>;
  action: (s: State, f: FormData) => Promise<State>;
}) {
  const [cfg, setCfg] = useState<Record<string, Row[]>>(() => Object.fromEntries(funnels.map((f) => [f.value, rows(initial.funnels[f.value])])));
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [active, setActive] = useState(startFunnel);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<State>(undefined);
  const [pending, start] = useTransition();
  const router = useRouter();

  const list = cfg[active];
  const plain = (c: Record<string, Row[]>): PipelineConfig => ({ funnels: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.map(({ value, label }) => ({ value, label }))])) });
  const dirty = JSON.stringify(plain(cfg)) !== saved;
  const count = (value: string) => tiles[active]?.[value] ?? 0;
  const set = (next: Row[]) => { setCfg((c) => ({ ...c, [active]: next })); setState(undefined); };

  const rename = (key: string, label: string) => set(list.map((r) => (r.key === key ? { ...r, label } : r)));
  const move = (i: number, d: -1 | 1) => { const n = [...list]; [n[i], n[i + d]] = [n[i + d], n[i]]; set(n); };
  const remove = (r: Row) => {
    const n = count(r.value);
    const first = list.find((x) => x.key !== r.key)?.label;
    if (n && !confirm(`${n} tile${n === 1 ? "" : "s"} in "${r.label}" will move to "${first}" when you save. Remove the column?`)) return;
    set(list.filter((x) => x.key !== r.key));
  };
  const add = () => {
    const label = draft.replace(/\s+/g, " ").trim();
    if (!label) return;
    set([...list, { value: "", label, key: `r${seq++}` }]); // the server gives new columns their stored value
    setDraft("");
  };
  const copyFrom = (from: string) => {
    if (!from || from === active) return;
    if (!confirm(`Replace the ${funnels.find((f) => f.value === active)?.label} columns with the ${funnels.find((f) => f.value === from)?.label} columns?`)) return;
    set(rows(cfg[from]));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.values(cfg).some((l) => l.some((r) => !r.label.trim()))) { setState({ error: "Every column needs a name." }); return; }
    const fd = new FormData();
    fd.set("config", JSON.stringify(plain(cfg)));
    start(async () => {
      const res = await action(undefined, fd);
      setState(res);
      if (res?.config) {
        // Take the saved version back: new columns now have their stored value, so tile counts line up after the refresh.
        const saved = res.config;
        setCfg(Object.fromEntries(funnels.map((f) => [f.value, rows(saved.funnels[f.value])])));
        setSaved(JSON.stringify(saved));
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Funnel" className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
          {funnels.map((f) => (
            <button key={f.value} type="button" onClick={() => setActive(f.value)} aria-pressed={f.value === active}
              className={`rounded-md px-3 py-1.5 font-medium ${f.value === active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
              {f.label} <span className="ml-1 text-xs text-slate-400">{cfg[f.value].length}</span>
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Copy columns from" value="" onChange={(e) => copyFrom(e.target.value)} className="input !w-56 py-1.5">
            <option value="">Copy columns from…</option>
            {funnels.filter((f) => f.value !== active).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <button type="button" className="btn-ghost" onClick={() => confirm(`Put this funnel back to the original ${defaults.funnels[active].length} columns?`) && set(rows(defaults.funnels[active]))}>Restore defaults</button>
        </div>
      </div>

      <div className="card divide-y divide-slate-100">
        {list.map((r, i) => (
          <div key={r.key} className="flex items-center gap-2 px-4 py-2" data-column={r.label}>
            <span className="w-6 text-right text-xs text-slate-400">{i + 1}</span>
            <input aria-label={`Column ${i + 1} name`} value={r.label} maxLength={MAX_LABEL} onChange={(e) => rename(r.key, e.target.value)} className={`input flex-1 py-1.5 ${r.label.trim() ? "" : "!border-red-400"}`} />
            <span className="w-16 text-right text-xs text-slate-500">{r.value ? `${count(r.value)} tile${count(r.value) === 1 ? "" : "s"}` : <span className="text-emerald-700">new</span>}</span>
            <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="btn-ghost px-2 py-1 disabled:opacity-30">↑</button>
            <button type="button" aria-label="Move down" disabled={i === list.length - 1} onClick={() => move(i, 1)} className="btn-ghost px-2 py-1 disabled:opacity-30">↓</button>
            <button type="button" aria-label={`Remove ${r.label}`} disabled={list.length <= 1} onClick={() => remove(r)} className="btn-ghost px-2 py-1 text-red-600 disabled:opacity-30" title={list.length <= 1 ? "A funnel needs at least one column" : "Remove column"}>✕</button>
          </div>
        ))}
        <div className="flex items-center gap-2 bg-slate-50 px-4 py-3">
          <span className="w-6" />
          <input value={draft} maxLength={MAX_LABEL} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="New column name, e.g. Term Sheet" className="input flex-1 py-1.5" aria-label="New column name" />
          <button type="button" onClick={add} disabled={!draft.trim() || list.length >= MAX_STAGES} className="btn-ghost">Add column</button>
        </div>
      </div>

      <div>
        <div className="label mb-1">Preview</div>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {list.map((r) => <span key={r.key} className="shrink-0 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold uppercase text-slate-500">{r.label || "…"}</span>)}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending || !dirty}>{pending ? "Saving…" : "Save funnels"}</button>
        {dirty && !pending && <span className="text-sm text-amber-700">Unsaved changes</span>}
        {state?.ok && <span className="text-sm text-emerald-700" role="status">{state.ok} <Link href={`${board}?funnel=${active}`} className="font-medium underline">Open the board</Link></span>}
        {state?.error && <span className="text-sm text-red-600" role="alert">{state.error}</span>}
      </div>
    </form>
  );
}
