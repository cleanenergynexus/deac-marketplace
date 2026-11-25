import { groupColor } from "@/lib/sprint-colors";
import { POSITION_LABEL, type StagePosition } from "@/lib/sprints";

export type StripStage = { value: string; label: string; position: StagePosition; progress: { done: number; total: number; pct: number } | null; dates?: string | null; projected?: boolean };

/**
 * A project's stages left to right as chevrons: done stages filled, the current one outlined in its color with its
 * sprint's progress, upcoming ones grey. `compact` is the one-line version for the Sprints overview table.
 */
export function RoadmapStrip({ rows, compact = false }: { rows: StripStage[]; compact?: boolean }) {
  return (
    <ol className={`flex ${compact ? "min-w-[460px]" : "min-w-0 flex-wrap gap-y-2"}`}>
      {rows.map((r, i) => {
        const color = groupColor(i);
        const done = r.position === "DONE", active = r.position === "ACTIVE";
        const faded = r.position === "UPCOMING" || r.position === "NOT_REACHED";
        const clip = i === 0 ? "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)" : "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)";
        return (
          <li key={r.value} className={`relative -ml-1 first:ml-0 ${compact ? "flex-1" : "min-w-[8.5rem] flex-1"}`} title={`${r.label}: ${POSITION_LABEL[r.position]}${r.progress ? ` · ${r.progress.done}/${r.progress.total} tasks done` : ""}${r.dates ? ` · ${r.projected ? "projected " : ""}${r.dates}` : ""}`}>
            <div className={`${compact ? "h-7 px-4 text-[11px]" : "h-14 px-5 text-sm"} flex flex-col justify-center overflow-hidden`}
              style={{ clipPath: clip, backgroundColor: done ? color : active ? `${color}22` : "#eef0f4", color: done ? "white" : faded ? "#94a3b8" : "#0f172a", boxShadow: active ? `inset 0 -3px 0 ${color}` : undefined }}>
              <span className="truncate font-semibold">{done ? "✓ " : ""}{r.label}</span>
              {!compact && <span className="truncate text-xs opacity-80">{r.progress ? `${r.progress.done}/${r.progress.total} done` : POSITION_LABEL[r.position]}{r.dates ? ` · ${r.projected ? "~" : ""}${r.dates}` : ""}</span>}
            </div>
            {active && r.progress && r.progress.total > 0 && (
              <div className={`absolute bottom-0 left-3 right-4 ${compact ? "h-[3px]" : "h-[3px]"}`}><div className="h-full" style={{ width: `${r.progress.pct}%`, backgroundColor: color }} /></div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
