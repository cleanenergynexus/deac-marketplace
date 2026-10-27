"use client";
import { useMemo, useState, useTransition } from "react";
import { DEFAULT_INPUTS, OPTIONS, valueScore } from "@/lib/valuation";
import { DEFAULT_SCORING, LEVEL_ORDER, NUMERIC_ORDER, NUMERIC_UNITS, SCORING_LABELS, maxRawScore, numericPoints, type LevelKey, type NumericKey, type ScoringConfig } from "@/lib/scoring";

type State = { error?: string; ok?: string } | undefined;

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Number box that lets you type freely ("-", "", "0.") and only reports valid numbers. */
function Num({ value, onChange, def, step = "any", className = "" }: { value: number; onChange: (n: number) => void; def: number; step?: string; className?: string }) {
  const [text, setText] = useState(String(value));
  const changed = value !== def;
  return (
    <input
      type="number"
      step={step}
      value={text}
      onChange={(e) => { setText(e.target.value); const n = Number(e.target.value); if (e.target.value.trim() !== "" && Number.isFinite(n)) onChange(n); }}
      onBlur={() => setText(String(value))}
      title={changed ? `Workbook default: ${def}` : undefined}
      className={`input !w-24 text-right ${changed ? "!border-amber-400 !bg-amber-50" : ""} ${className}`}
    />
  );
}

export function ScoringEditor({ initial, action }: { initial: ScoringConfig; action: (s: State, f: FormData) => Promise<State> }) {
  const [cfg, setCfg] = useState<ScoringConfig>(initial);
  const [version, setVersion] = useState(0); // remounts inputs after "restore defaults"
  const [state, setState] = useState<State>(undefined);
  const [pending, start] = useTransition();
  // Submitted by hand rather than through <form action>, because React resets forms after an action and these inputs are state-driven.
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("config", JSON.stringify(cfg));
    start(async () => setState(await action(undefined, fd)));
  };
  const d = DEFAULT_SCORING;

  const max = useMemo(() => maxRawScore(cfg), [cfg]);
  const sample = useMemo(() => ({ now: valueScore(DEFAULT_INPUTS, cfg), workbook: valueScore(DEFAULT_INPUTS) }), [cfg]);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(initial);

  const setLevel = (k: LevelKey, o: string, v: number) => setCfg((c) => ({ ...c, levels: { ...c.levels, [k]: { ...c.levels[k], points: { ...c.levels[k].points, [o]: v } } } }));
  const setLevelWeight = (k: LevelKey, v: number) => setCfg((c) => ({ ...c, levels: { ...c.levels, [k]: { ...c.levels[k], weight: v } } }));
  const setNumeric = (k: NumericKey, field: "weight" | "start" | "perUnit" | "max", v: number) => setCfg((c) => ({ ...c, numeric: { ...c.numeric, [k]: { ...c.numeric[k], [field]: v } } }));

  return (
    <form onSubmit={submit} className="space-y-6" key={version}>

      <div className="card sticky top-2 z-10 flex flex-wrap items-end gap-x-6 gap-y-3 p-4">
        <div>
          <div className="label">Best possible score</div>
          <div className="text-xl font-bold">{cfg.scaleTo100 ? "100" : fmt(max)} <span className="text-xs font-normal text-slate-500">{cfg.scaleTo100 ? `(raw ${fmt(max)}, scaled)` : "points"}</span></div>
        </div>
        <div>
          <div className="label">Workbook example site</div>
          <div className="text-xl font-bold">{sample.now} {sample.now !== sample.workbook && <span className="text-xs font-normal text-slate-500">(was {sample.workbook})</span>}</div>
        </div>
        <label className="block"><span className="label">Buy at or above</span><Num value={cfg.thresholds.buy} def={d.thresholds.buy} onChange={(v) => setCfg((c) => ({ ...c, thresholds: { ...c.thresholds, buy: v } }))} /></label>
        <label className="block"><span className="label">Negotiate at or above</span><Num value={cfg.thresholds.negotiate} def={d.thresholds.negotiate} onChange={(v) => setCfg((c) => ({ ...c, thresholds: { ...c.thresholds, negotiate: v } }))} /></label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={cfg.scaleTo100} onChange={(e) => setCfg((c) => ({ ...c, scaleTo100: e.target.checked }))} />
          Scale scores to 0–100
        </label>
        <div className="ml-auto flex items-center gap-3">
          <button type="button" className="btn-ghost" onClick={() => { setCfg(DEFAULT_SCORING); setState(undefined); setVersion((v) => v + 1); }}>Restore workbook defaults</button>
          <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save scoring"}</button>
        </div>
        {(state?.ok || state?.error || dirty) && (
          <p role="status" className={`w-full text-sm ${state?.error ? "text-red-700" : dirty ? "text-amber-700" : "text-emerald-700"}`}>
            {state?.error ?? (dirty ? "Unsaved changes. Saving re-scores every listing that has a saved score." : `✓ ${state?.ok}`)}
          </p>
        )}
      </div>

      <p className="text-sm text-slate-600">
        A listing&apos;s score is the sum of its points on every characteristic below, each multiplied by that characteristic&apos;s weight (1 = as entered, 2 = counts double, 0 = ignored).
        Highlighted boxes differ from the workbook; hover one to see the workbook value.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {LEVEL_ORDER.map((k) => (
          <section key={k} className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-semibold">{SCORING_LABELS[k]}</h3>
              <label className="flex items-center gap-2 text-xs text-slate-500">Weight <Num value={cfg.levels[k].weight} def={d.levels[k].weight} onChange={(v) => setLevelWeight(k, Math.max(0, v))} className="!w-20" /></label>
            </div>
            <table className="w-full">
              <thead><tr><th className="th pl-0">Selection</th><th className="th !text-right">Points</th><th className="th pr-0 !text-right">Counts as</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {OPTIONS[k].map((o) => (
                  <tr key={o}>
                    <td className="td pl-0">{o}</td>
                    <td className="td text-right"><Num value={cfg.levels[k].points[o]} def={d.levels[k].points[o]} onChange={(v) => setLevel(k, o, v)} className="ml-auto" /></td>
                    <td className="td pr-0 text-right text-slate-500">{fmt(cfg.levels[k].points[o] * cfg.levels[k].weight)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {k === "sellerMotivation" && <p className="mt-2 text-xs text-slate-500">Not part of the workbook score (all 0). Add points here to start counting it.</p>}
          </section>
        ))}
      </div>

      <h2 className="pt-2 text-lg font-semibold">Number-based characteristics</h2>
      <p className="text-sm text-slate-600">These use a sliding scale: points = starting points + points per unit × the entered number, never below 0 or above the maximum. Use a negative &quot;per unit&quot; when a bigger number is worse.</p>
      <div className="grid gap-4 lg:grid-cols-3">
        {NUMERIC_ORDER.map((k) => {
          const f = cfg.numeric[k];
          const samples = k === "monthsToPower" ? [0, 12, 24, 48] : k === "powerRate" ? [3, 4.5, 6, 8] : [0, 10, 20, 50];
          return (
            <section key={k} className="card p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold">{SCORING_LABELS[k]}</h3>
                <label className="flex items-center gap-2 text-xs text-slate-500">Weight <Num value={f.weight} def={d.numeric[k].weight} onChange={(v) => setNumeric(k, "weight", Math.max(0, v))} className="!w-20" /></label>
              </div>
              <div className="space-y-2 text-sm">
                <label className="flex items-center justify-between gap-3">Starting points <Num value={f.start} def={d.numeric[k].start} onChange={(v) => setNumeric(k, "start", v)} /></label>
                <label className="flex items-center justify-between gap-3">Points per {NUMERIC_UNITS[k]} <Num value={f.perUnit} def={d.numeric[k].perUnit} onChange={(v) => setNumeric(k, "perUnit", v)} /></label>
                <label className="flex items-center justify-between gap-3">Maximum points <Num value={f.max} def={d.numeric[k].max} onChange={(v) => setNumeric(k, "max", Math.max(0, v))} /></label>
              </div>
              <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                {samples.map((x) => <div key={x} className="flex justify-between"><span>{x} {NUMERIC_UNITS[k]}{k === "monthsToPower" && x !== 1 ? "s" : ""}</span><span>{fmt(numericPoints(cfg, k, x))} pts</span></div>)}
              </div>
            </section>
          );
        })}
      </div>
    </form>
  );
}
