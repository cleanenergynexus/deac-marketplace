import Link from "next/link";
import { STAGES, STAGE_INFO, stageRank, type Stage } from "@/lib/disclosure";

/** Stepper: teaser -> NDA -> LOI -> full data room. `pending` marks the step waiting on the team. */
export function DealProgress({ stage, pending }: { stage: Stage; pending?: Stage | null }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-4">
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

const CTA: Record<Stage, string> = { TEASER: "", NDA: "Sign NDA to Unlock", LOI: "Submit LOI to Unlock", DILIGENCE: "Confirm Interest to Unlock" };

/**
 * Locked section: the field labels under a blur with an unlock prompt on top.
 * Values are placeholders; the real data is never sent to the browser.
 */
export function Blurred({ need, what, labels, href }: { need: Stage; what: string; labels: string[]; href: string }) {
  return (
    <div className="relative min-h-[200px] overflow-hidden rounded-lg">
      <dl aria-hidden className="pointer-events-none grid select-none grid-cols-2 gap-x-8 blur-[3px]">
        {labels.map((l) => (
          <div key={l} className="border-b border-slate-200 py-3">
            <dt className="text-xs uppercase tracking-wide text-slate-400">{l}</dt>
            <dd className="mt-1 text-lg text-slate-400">00.0</dd>
          </div>
        ))}
      </dl>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 px-6 text-center">
        <div className="text-2xl">🔒</div>
        <p className="mt-1 max-w-sm text-sm text-slate-700">{what} {STAGE_INFO[need].unlock.replace("Unlocks", "unlock")}.</p>
        <Link href={href} scroll={false} className="btn-ghost mt-3 rounded-full px-5 py-2 font-semibold shadow-sm">{CTA[need]}</Link>
      </div>
    </div>
  );
}
