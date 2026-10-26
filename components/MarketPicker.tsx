"use client";
import { useEffect, useRef, useState } from "react";
import { REGIONS, SUB_REGIONS } from "@/lib/regions";
import { US_STATES } from "@/lib/constants";

/** Tri-state checkbox: checked, unchecked, or partly selected. */
function Box({ checked, partial, onChange, label, bold }: { checked: boolean; partial?: boolean; onChange: (v: boolean) => void; label: string; bold?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!partial && !checked; }, [partial, checked]);
  return (
    <label className={`flex cursor-pointer items-center gap-2 text-sm ${bold ? "font-semibold" : ""}`}>
      <input ref={ref} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-brand-600" />
      {label}
    </label>
  );
}

/** Region tree + US states picker. Submits as `regions` and `states` form fields. */
export function MarketPicker({ regions: initialRegions = [], states: initialStates = [] }: { regions?: string[]; states?: string[] }) {
  const [regions, setRegions] = useState<Set<string>>(new Set(initialRegions));
  const [states, setStates] = useState<Set<string>>(new Set(initialStates));

  const setMany = (set: Set<string>, codes: readonly string[], on: boolean) => {
    const next = new Set(set);
    codes.forEach((c) => (on ? next.add(c) : next.delete(c)));
    return next;
  };
  const allCodes = SUB_REGIONS.map((r) => r.code);
  const allRegions = allCodes.every((c) => regions.has(c));
  const allStates = US_STATES.every((s) => states.has(s));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <Box bold label="Select All Regions" checked={allRegions} partial={regions.size > 0} onChange={(v) => setRegions(setMany(regions, allCodes, v))} />
        <div className="mt-3 space-y-3">
          {REGIONS.map((r) => {
            const kids = r.children.map((c) => c.code);
            const all = kids.every((k) => regions.has(k));
            const some = kids.some((k) => regions.has(k));
            return (
              <div key={r.code}>
                <Box bold label={r.label} checked={all} partial={some} onChange={(v) => setRegions(setMany(regions, kids, v))} />
                <div className="ml-6 mt-1 space-y-1">
                  {r.children.map((c) => (
                    <Box key={c.code} label={c.label} checked={regions.has(c.code)} onChange={(v) => setRegions(setMany(regions, [c.code], v))} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <Box bold label="Select all US states" checked={allStates} partial={states.size > 0} onChange={(v) => setStates(setMany(states, US_STATES, v))} />
          <span className="text-xs text-slate-500">{states.size} selected</span>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1 sm:grid-cols-7">
          {US_STATES.map((s) => (
            <button type="button" key={s} onClick={() => setStates(setMany(states, [s], !states.has(s)))}
              className={`rounded border px-1 py-1 text-xs ${states.has(s) ? "border-brand-500 bg-brand-50 font-semibold text-brand-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {s}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Leave everything blank if you're open to any market.</p>
      </div>
      {[...regions].map((r) => <input key={r} type="hidden" name="regions" value={r} />)}
      {[...states].map((s) => <input key={s} type="hidden" name="states" value={s} />)}
    </div>
  );
}
