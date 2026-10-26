"use client";
import { useMemo, useState, useTransition } from "react";
import {
  ASSET_TYPES, DEFAULT_INPUTS, DEFAULT_OPERATING, FACTOR_LABELS, OPTIONS, TENANT_QUALITY,
  evaluate, evaluateOperating, type OperatingInputs, type ValuationInputs,
} from "@/lib/valuation";

const money = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
const toneCls = { green: "bg-emerald-600", amber: "bg-amber-500", red: "bg-red-600" } as const;

type Props = {
  initial?: ValuationInputs | null;
  onSave?: (inputs: ValuationInputs) => Promise<{ score: number }>;
};

export function Calculator({ initial, onSave }: Props) {
  const [mode, setMode] = useState<"bid" | "operating">("bid");
  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-sm">
        <button onClick={() => setMode("bid")} className={`rounded-md px-3 py-1.5 ${mode === "bid" ? "bg-brand-600 text-white" : ""}`}>Powered land / shell bid</button>
        <button onClick={() => setMode("operating")} className={`rounded-md px-3 py-1.5 ${mode === "operating" ? "bg-brand-600 text-white" : ""}`}>Operating data center</button>
      </div>
      {mode === "bid" ? <BidCalculator initial={initial} onSave={onSave} /> : <OperatingCalculator />}
    </div>
  );
}

function BidCalculator({ initial, onSave }: Props) {
  const [i, setI] = useState<ValuationInputs>(initial ?? DEFAULT_INPUTS);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const r = useMemo(() => evaluate(i), [i]);
  const set = <K extends keyof ValuationInputs>(k: K, v: ValuationInputs[K]) => { setI((p) => ({ ...p, [k]: v })); setSaved(null); };

  const sel = (k: keyof typeof OPTIONS & keyof ValuationInputs, label: string) => (
    <Row label={label}>
      <select value={i[k] as string} onChange={(e) => set(k, e.target.value)} className="input">{OPTIONS[k].map((o) => <option key={o}>{o}</option>)}</select>
    </Row>
  );
  const numIn = (k: keyof ValuationInputs, label: string, step = "any") => (
    <Row label={label}>
      <input type="number" step={step} value={(i[k] as number) ?? 0} onChange={(e) => set(k, (e.target.value === "" ? 0 : Number(e.target.value)) as never)} className="input" />
    </Row>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="card p-5">
        <h3 className="mb-3 font-semibold">Site</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Row label="Asset type"><select value={i.assetType} onChange={(e) => set("assetType", e.target.value)} className="input">{ASSET_TYPES.map((o) => <option key={o}>{o}</option>)}</select></Row>
          {numIn("mw", "MW available")}
          {numIn("acres", "Acres")}
          {numIn("askingPrice", "Asking price ($)")}
        </div>
        <h3 className="mb-3 mt-6 font-semibold">Factors</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {sel("powerStatus", "Power status")}
          {numIn("monthsToPower", "Months to power", "1")}
          {numIn("powerRateCents", "Power rate (¢/kWh)")}
          {sel("marketTier", "Market tier")}
          {sel("infrastructure", "Infrastructure readiness")}
          {numIn("expansionMw", "Expansion potential (MW)")}
          {sel("environmentalRisk", "Environmental risk")}
          {sel("sellerMotivation", "Seller motivation")}
          {sel("fiber", "Fiber / connectivity")}
          {sel("water", "Water availability")}
          {sel("entitlements", "Entitlements / zoning")}
          {sel("backupPower", "Backup power / generators")}
          {sel("substation", "Substation proximity")}
          {sel("density", "Density readiness")}
          {sel("transmission", "Transmission voltage")}
        </div>
      </div>

      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <div className={`rounded-xl p-5 text-white ${toneCls[r.recommendation.tone]}`}>
          <div className="text-xs uppercase tracking-wide opacity-80">Recommendation</div>
          <div className="text-3xl font-extrabold">{r.recommendation.label}</div>
          <div className="mt-1 text-sm">Value score <b>{r.score}</b> · Buy ≥70 · Negotiate 50–69 · Walk away &lt;50</div>
        </div>
        <div className="card p-5 text-sm">
          <Line k="Base benchmark" v={`${money(r.base)}/MW`} />
          <Line k="Adjustment factor" v={r.adjustmentFactor.toFixed(2) + "×"} />
          <Line k="Adjusted value" v={`${money(r.adjustedValueMw)}/MW`} bold />
          <div className="my-3 border-t border-slate-100" />
          <table className="w-full">
            <thead><tr className="text-xs text-slate-500"><th className="text-left font-medium"></th><th className="text-right font-medium">$/MW</th><th className="text-right font-medium">Total</th></tr></thead>
            <tbody>
              {([["Good value", "good"], ["Market value", "market"], ["High value", "high"]] as const).map(([l, k]) => (
                <tr key={k}><td className="py-1">{l}</td><td className="py-1 text-right">{money(r.perMw[k])}</td><td className="py-1 text-right font-semibold">{r.total ? money(r.total[k]) : "enter MW"}</td></tr>
              ))}
            </tbody>
          </table>
          {r.askingVsMarket != null && (
            <p className={`mt-3 rounded p-2 text-xs ${r.askingVsMarket > 0.1 ? "bg-red-50 text-red-700" : r.askingVsMarket < -0.15 ? "bg-emerald-50 text-emerald-700" : "bg-slate-50"}`}>
              Asking price is {Math.abs(r.askingVsMarket * 100).toFixed(0)}% {r.askingVsMarket >= 0 ? "above" : "below"} market value.
            </p>
          )}
        </div>
        <div className="card p-5 text-sm">
          <div className="mb-2 font-semibold">Factor adjustments</div>
          {Object.entries(r.factors).map(([k, f]) => (
            <div key={k} className="flex justify-between py-0.5">
              <span className="text-slate-600">{FACTOR_LABELS[k]}</span>
              <span className={f.adj > 0 ? "text-emerald-700" : f.adj < 0 ? "text-red-600" : "text-slate-500"}>{f.adj > 0 ? "+" : ""}{f.adj.toFixed(2)} <span className="text-slate-400">({f.weight.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}×)</span></span>
            </div>
          ))}
        </div>
        {onSave && (
          <button className="btn w-full" disabled={pending} onClick={() => start(async () => { const res = await onSave(i); setSaved(`Saved · score ${res.score}`); })}>
            {pending ? "Saving…" : saved ?? "Save score to this lead"}
          </button>
        )}
        <p className="text-xs text-slate-500">Simplified sales-comparison model based on 2026 benchmarks (Cushman & Wakefield, datacenterHawk). Not a formal appraisal.</p>
      </div>
    </div>
  );
}

function OperatingCalculator() {
  const [i, setI] = useState<OperatingInputs>(DEFAULT_OPERATING);
  const r = useMemo(() => evaluateOperating(i), [i]);
  const n = (k: keyof OperatingInputs, label: string) => (
    <Row label={label}><input type="number" step="any" value={i[k] as number} onChange={(e) => setI({ ...i, [k]: Number(e.target.value) })} className="input" /></Row>
  );
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="card grid gap-3 p-5 sm:grid-cols-2">
        {n("mwIt", "MW IT load")}
        {n("leaseRateKwMo", "Lease rate ($/kW/month)")}
        {n("occupancyPct", "Occupancy (%)")}
        <Row label="Tenant quality"><select value={i.tenantQuality} onChange={(e) => setI({ ...i, tenantQuality: e.target.value })} className="input">{TENANT_QUALITY.map((t) => <option key={t}>{t}</option>)}</select></Row>
        {n("leaseTermYears", "Lease term remaining (yrs)")}
        {n("escalatorPct", "Annual escalator (%)")}
        {n("powerCostCents", "Power cost (¢/kWh)")}
        {n("powerEscalatorPct", "Power escalator (%/yr)")}
        {n("opexPct", "Maintenance / OpEx (% revenue)")}
        {n("capRatePct", "Base cap rate (%)")}
      </div>
      <div className="card space-y-1 p-5 text-sm xl:self-start">
        <Line k="Gross annual revenue" v={money(r.revenue)} />
        <Line k="Less: power cost" v={money(-r.powerCost)} />
        <Line k="Less: maintenance / OpEx" v={money(-r.opex)} />
        <Line k="Net operating income" v={money(r.noi)} bold />
        <Line k="Adjusted cap rate" v={`${r.adjCapRate.toFixed(2)}%`} />
        <div className="my-2 border-t border-slate-100" />
        <Line k="Implied value" v={money(r.value)} bold />
        <Line k="Value per MW" v={money(r.valuePerMw)} />
        <p className="pt-2 text-xs text-slate-500">From the workbook&apos;s Operating DC Value sheet (marked inactive there). Escalators are informational only, as in the workbook.</p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}
function Line({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className={`flex justify-between py-0.5 ${bold ? "font-semibold" : ""}`}><span className="text-slate-600">{k}</span><span>{v}</span></div>;
}
