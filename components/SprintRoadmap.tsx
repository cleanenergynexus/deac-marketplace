import { RoadmapStrip } from "@/components/RoadmapStrip";
import { SprintGroup, span, type SprintMode } from "@/components/SprintGroup";
import { progress, stageSprint } from "@/lib/sprints";
import type { loadRoadmap } from "@/lib/sprints-db";

type Roadmap = NonNullable<Awaited<ReturnType<typeof loadRoadmap>>>;

/** A project's stages as a chevron strip, then one board group per stage. Shared by the team's and the agent portal's Sprints pages. */
export function SprintRoadmap({ roadmap: r, mode, now }: { roadmap: Roadmap; mode: SprintMode; now: Date }) {
  return (
    <>
      <div className="card p-4"><RoadmapStrip rows={r.rows.map((x, i) => ({ value: x.value, label: x.label, position: x.position, progress: x.sprint ? progress(x.sprint.tasks.flatMap((t) => [t, ...t.subtasks])) : null, dates: r.dates[i] ? span(r.dates[i]!.start, r.dates[i]!.end) : null, projected: r.dates[i]?.projected ?? false }))} /></div>
      <div>
        {r.rows.map((x, i) => (
          <SprintGroup key={x.value} index={i} stage={x} dates={r.dates[i]} template={stageSprint(r.templates, x.value)} projectId={r.project.id} mode={mode} now={now} />
        ))}
      </div>
    </>
  );
}
