"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ALL_LEAVES, REGIONS, expandMarkets, leavesOf, packMarkets, type MarketNode } from "@/lib/regions";

/** Tri-state checkbox: checked, unchecked, or partly selected. */
function Box({ checked, partial, onChange, label }: { checked: boolean; partial?: boolean; onChange: (v: boolean) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!partial && !checked; }, [partial, checked]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 shrink-0 cursor-pointer accent-brand-600" />;
}

// Nodes whose children are long lists (US states) open only in the right-hand panel.
const PANEL_ONLY = new Set(["USA"]);

/**
 * Drill-down market picker. Left: accordion tree (region > sub-region > country).
 * Right: the children of whatever you open, e.g. United States shows the states.
 * Submits as `regions` and `states` form fields.
 */
export function MarketPicker({ regions: initialRegions = [], states: initialStates = [] }: { regions?: string[]; states?: string[] }) {
  const [picked, setPicked] = useState<Set<string>>(() => expandMarkets(initialStates, initialRegions));
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [focus, setFocus] = useState<MarketNode | null>(null);
  // React resets a form after its server action finishes. That clears these checkboxes in the browser
  // even though our state still holds the selection, so redraw them from state after any reset.
  const root = useRef<HTMLDivElement>(null);
  const [redraw, setRedraw] = useState(0);
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const onReset = () => setTimeout(() => setRedraw((n) => n + 1));
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const status = (code: string) => {
    const ls = leavesOf(code);
    const n = ls.filter((l) => picked.has(l)).length;
    return { checked: n === ls.length, partial: n > 0 && n < ls.length, count: n, total: ls.length };
  };
  const toggle = (code: string, on: boolean) => {
    const next = new Set(picked);
    leavesOf(code).forEach((l) => (on ? next.add(l) : next.delete(l)));
    setPicked(next);
  };
  const openNode = (n: MarketNode) => {
    setFocus(n);
    if (!PANEL_ONLY.has(n.code)) setOpen((o) => { const x = new Set(o); x.has(n.code) && focus?.code === n.code ? x.delete(n.code) : x.add(n.code); return x; });
  };
  const all = picked.size === ALL_LEAVES.length;
  const packed = useMemo(() => packMarkets(picked), [picked]);

  const row = (n: MarketNode, depth: number): React.ReactNode => {
    const st = status(n.code);
    const kids = n.children ?? [];
    const isOpen = open.has(n.code);
    const active = focus?.code === n.code;
    return (
      <li key={n.code}>
        <div className={`flex items-center gap-2 rounded px-1.5 py-1 ${active ? "bg-brand-50" : "hover:bg-slate-50"}`} style={{ paddingLeft: 6 + depth * 18 }}>
          <Box label={n.label} checked={st.checked} partial={st.partial} onChange={(v) => toggle(n.code, v)} />
          {kids.length ? (
            <button type="button" onClick={() => openNode(n)} className={`flex flex-1 items-center justify-between text-left text-sm ${depth === 0 ? "font-semibold" : ""}`}>
              <span>{n.label}{st.partial && PANEL_ONLY.has(n.code) && <span className="ml-1 text-xs font-normal text-slate-500">({st.count} of {st.total})</span>}</span>
              <span className="text-slate-400">{PANEL_ONLY.has(n.code) ? "›" : isOpen ? "▾" : "▸"}</span>
            </button>
          ) : (
            <span className="flex-1 cursor-pointer text-sm" onClick={() => toggle(n.code, !st.checked)}>{n.label}</span>
          )}
        </div>
        {kids.length > 0 && isOpen && !PANEL_ONLY.has(n.code) && <ul>{kids.map((k) => row(k, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div ref={root} key={redraw} className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <label className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-1.5 pb-2 text-sm font-semibold">
          <Box label="Select All Regions" checked={all} onChange={(v) => setPicked(v ? new Set(ALL_LEAVES) : new Set())} />
          Select All Regions
        </label>
        <ul className="mt-1">{REGIONS.map((r) => row(r, 0))}</ul>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        {focus?.children?.length ? (
          <>
            <label className="flex cursor-pointer items-center justify-between gap-2 border-b border-slate-100 px-1.5 pb-2 text-sm font-semibold">
              <span className="flex items-center gap-2">
                <Box label={`Select all in ${focus.label}`} checked={status(focus.code).checked} partial={status(focus.code).partial} onChange={(v) => toggle(focus.code, v)} />
                {focus.label}: select all
              </span>
              <span className="text-xs font-normal text-slate-500">{status(focus.code).count} of {status(focus.code).total}</span>
            </label>
            <ul className={`mt-2 grid gap-x-3 gap-y-1 ${focus.children.length > 8 ? "max-h-80 overflow-y-auto sm:grid-cols-2" : ""}`}>
              {focus.children.map((c) => {
                const st = status(c.code);
                return (
                  <li key={c.code} className="flex items-center gap-2 px-1.5 py-0.5 text-sm">
                    <Box label={c.label} checked={st.checked} partial={st.partial} onChange={(v) => toggle(c.code, v)} />
                    {c.children?.length ? (
                      <button type="button" onClick={() => openNode(c)} className="flex flex-1 justify-between text-left">
                        <span>{c.label}</span><span className="text-slate-400">›</span>
                      </button>
                    ) : <span className="flex-1 cursor-pointer" onClick={() => toggle(c.code, !st.checked)}>{c.label}</span>}
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="p-2 text-sm text-slate-500">Click a region on the left to drill down. Open <b>North America › United States</b> to pick individual states.</p>
        )}
      </div>

      <p className="text-xs text-slate-500 md:col-span-2">Leave everything blank if you&apos;re open to any market.</p>
      {packed.regions.map((r) => <input key={r} type="hidden" name="regions" value={r} />)}
      {packed.states.map((s) => <input key={s} type="hidden" name="states" value={s} />)}
    </div>
  );
}
