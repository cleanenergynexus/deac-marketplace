import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { setProjectPipelineStage } from "@/app/actions/admin";
import { ConfirmButton } from "@/components/ConfirmButton";
import { SprintGroup, span } from "@/components/SprintGroup";
import { RoadmapStrip } from "@/components/RoadmapStrip";
import { PageHeader, Stat } from "@/components/ui";
import { loadRoadmap } from "@/lib/sprints-db";
import { nextStage, progress, stageSprint } from "@/lib/sprints";
import { assigneeOptions, staffLevel, taskWorkState } from "@/lib/tasks";
import { getTaskEditing, getTaskPeople, visibleTaskWhere } from "@/lib/tasks-db";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

/** A project's roadmap to close: one sprint per CRM stage, each a group of tasks and sub-tasks. */
export default async function ProjectSprintsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [me, people] = await Promise.all([requireAdmin(), getTaskPeople()]);
  const now = new Date();
  const [r, editing] = await Promise.all([loadRoadmap(id, visibleTaskWhere(me, people), now), getTaskEditing(me, people)]);
  if (!r) notFound();
  const { project: p, rows, dates, closeAt, templates, stages, current } = r;
  const assigning = { options: assigneeOptions(me, people), allowUnassigned: staffLevel(me.staffLevel) === "ADMIN" };
  const active = rows.find((x) => x.position === "ACTIVE");
  const activeTasks = active?.sprint ? active.sprint.tasks.flatMap((t) => [t, ...t.subtasks]) : [];
  const left = activeTasks.filter((t) => !t.doneAt).length;
  const next = nextStage(stages, current);
  const all = rows.flatMap((x) => x.sprint?.tasks.flatMap((t) => [t, ...t.subtasks]) ?? []);
  const overall = progress(all);
  const stuck = all.filter((t) => taskWorkState(t) === "STUCK").length;
  const overdue = all.filter((t) => !t.doneAt && t.dueAt && t.dueAt < now).length;

  return (
    <div className="space-y-6">
      <Link href={`/admin/projects/${p.id}`} className="text-sm text-brand-600">← {p.code} · {p.title}</Link>
      <PageHeader
        title="Sprints"
        subtitle={<>The roadmap to close for <b>{p.title}</b> ({p.developer.company}). Each CRM stage has a sprint: the tasks and sub-tasks that move the project to the next stage. A sprint starts from its <Link href="/admin/sprints/templates" className="text-brand-600">template</Link> when the project enters the stage.</>}
        action={
          <div className="flex flex-wrap gap-2">
            {next && (
              <form action={setProjectPipelineStage}>
                <input type="hidden" name="id" value={p.id} /><input type="hidden" name="stage" value={next.value} />
                {left ? <ConfirmButton message={`${left} task${left === 1 ? " is" : "s are"} still open in this sprint. Move the project to ${next.label} anyway?`} className="btn">Move to {next.label} →</ConfirmButton> : <button className="btn">Move to {next.label} →</button>}
              </form>
            )}
            <Link href="/admin/sprints" className="btn-ghost">All Sprints</Link>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Current Stage" value={active?.label ?? "—"} sub={active?.sprint ? `${progress(activeTasks).done}/${activeTasks.length} tasks done` : "Sprint not started"} />
        <Stat label="Projected Close" value={closeAt ? date(closeAt) : current === "CLOSED" ? "Closed" : "—"} sub={closeAt ? "From each stage's sprint length" : undefined} />
        <Stat label="All Sprint Tasks" value={`${overall.pct}%`} sub={`${overall.done} of ${overall.total} done`} />
        <Stat label="Needs Attention" value={stuck + overdue} sub={`${stuck} stuck · ${overdue} overdue`} />
      </div>

      <div className="card p-4"><RoadmapStrip rows={rows.map((x, i) => ({ value: x.value, label: x.label, position: x.position, progress: x.sprint ? progress(x.sprint.tasks.flatMap((t) => [t, ...t.subtasks])) : null, dates: dates[i] ? span(dates[i]!.start, dates[i]!.end) : null, projected: dates[i]?.projected ?? false }))} /></div>

      <div>
        {rows.map((x, i) => (
          <SprintGroup key={x.value} index={i} stage={x} dates={dates[i]} template={stageSprint(templates, x.value)} projectId={p.id} editing={editing} assigning={assigning} now={now} />
        ))}
      </div>
    </div>
  );
}
