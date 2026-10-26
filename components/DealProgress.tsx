import { STAGES, STAGE_INFO, stageRank, type Stage } from "@/lib/disclosure";

/** Vertical stepper: teaser -> NDA -> LOI -> full data room. `pending` marks the step waiting on the team. */
export function DealProgress({ stage, pending }: { stage: Stage; pending?: Stage | null }) {
  return (
    <ol className="space-y-3">
      {STAGES.map((s, i) => {
        const done = stageRank(s) <= stageRank(stage);
        const waiting = pending === s;
        return (
          <li key={s} className="flex items-start gap-3">
            <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-emerald-600 text-white" : waiting ? "bg-amber-400 text-white" : "bg-slate-200 text-slate-500"}`}>
              {done ? "✓" : i + 1}
            </span>
            <div className="text-sm">
              <div className={`font-semibold ${done ? "text-slate-900" : "text-slate-500"}`}>{STAGE_INFO[s].step}</div>
              <div className="text-xs text-slate-500">{done ? (s === "TEASER" ? "Open" : "Confirmed") : waiting ? "Awaiting DEAC confirmation" : STAGE_INFO[s].unlock.replace("Unlocks once ", "After ")}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Placeholder for content the investor hasn't unlocked yet. Nothing behind it is sent to the browser. */
export function Locked({ need, what }: { need: Stage; what?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <div className="text-2xl">🔒</div>
      <div className="mt-1 text-sm font-semibold text-slate-700">{what ?? "This section"} is locked</div>
      <p className="mt-1 text-xs text-slate-500">{STAGE_INFO[need].unlock}. See "Your access" for the next step.</p>
    </div>
  );
}
