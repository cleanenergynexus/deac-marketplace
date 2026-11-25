import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { RoadmapStrip } from "@/components/RoadmapStrip";
import { Badge, PageHeader } from "@/components/ui";
import { dealTypeLabel } from "@/lib/constants";
import { funnelStages, projectStage } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";
import { OFF_RAMP_STAGES, progress, roadmap, schedule } from "@/lib/sprints";
import { getSprintTemplates } from "@/lib/sprints-db";
import { getTaskPeople, visibleTaskWhere } from "@/lib/tasks-db";
import { taskWorkState } from "@/lib/tasks";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

const VIEWS = [
  { value: "open", label: "In Progress" },
  { value: "ended", label: "Closed & Passed" },
  { value: "all", label: "All Projects" },
] as const;

/** Every project's roadmap on one page: where each one is, how its current sprint is going, and when it should close. */
export default async function SprintsOverview({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.value === sp.view)?.value ?? "open";
  const [me, people] = await Promise.all([requireAdmin(), getTaskPeople()]);
  const now = new Date();
  const [projects, pipeline, templates] = await Promise.all([
    db.project.findMany({
      select: {
        id: true, code: true, title: true, dealType: true, pipelineStage: true, developer: { select: { company: true, stage: true } },
        sprints: { select: { stage: true, startedAt: true, targetAt: true, tasks: { where: visibleTaskWhere(me, people), select: { doneAt: true, workState: true, dueAt: true } } } },
      },
      orderBy: { code: "asc" },
    }),
    getPipeline(),
    getSprintTemplates(),
  ]);

  const list = projects.map((p) => {
    const stages = funnelStages(pipeline, p.dealType);
    const current = projectStage(pipeline, p, p.developer.stage);
    const rows = roadmap(stages, current, p.sprints);
    const { closeAt } = schedule(rows, templates, now);
    const active = rows.find((r) => r.position === "ACTIVE")!;
    const tasks = active.sprint?.tasks ?? [];
    return {
      p, rows, closeAt, active,
      ended: current === "CLOSED" || OFF_RAMP_STAGES.includes(current),
      prog: active.sprint ? progress(tasks) : null,
      stuck: tasks.filter((t) => taskWorkState(t) === "STUCK").length,
      overdue: tasks.filter((t) => !t.doneAt && t.dueAt && t.dueAt < now).length,
    };
  });
  const shown = list.filter((x) => (view === "all" ? true : view === "ended" ? x.ended : !x.ended))
    .sort((a, b) => (a.closeAt?.getTime() ?? Infinity) - (b.closeAt?.getTime() ?? Infinity));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sprints"
        subtitle="Every project's roadmap to close. Each CRM stage has a sprint of tasks and sub-tasks that moves the project to the next stage; it starts from the stage's template when the project enters the stage. Soonest projected close first."
        action={<Link href="/admin/sprints/templates" className="btn-ghost">Sprint Templates</Link>}
      />
      <nav className="flex gap-1 border-b border-slate-200">
        {VIEWS.map((v) => (
          <Link key={v.value} href={v.value === "open" ? "/admin/sprints" : `/admin/sprints?view=${v.value}`}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${view === v.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {v.label} <span className="text-xs text-slate-400">{list.filter((x) => (v.value === "all" ? true : v.value === "ended" ? x.ended : !x.ended)).length}</span>
          </Link>
        ))}
      </nav>
      {shown.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Project</th><th className="th">Roadmap</th><th className="th">Current Sprint</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map(({ p, rows, closeAt, active, prog, stuck, overdue }) => (
                <tr key={p.id} className="align-middle">
                  <td className="td w-56">
                    <Link href={`/admin/projects/${p.id}/sprints`} className="font-medium text-brand-600">{p.title}</Link>
                    <div className="text-xs text-slate-500"><span className="font-mono">{p.code}</span> · {p.developer.company} · {dealTypeLabel(p.dealType)}</div>
                  </td>
                  <td className="td"><RoadmapStrip compact rows={rows.map((r) => ({ value: r.value, label: r.label, position: r.position, progress: r.sprint ? progress(r.sprint.tasks) : null }))} /></td>
                  <td className="td min-w-[11rem] text-sm">
                    <div className="font-medium">{active.label}</div>
                    {prog ? (
                      <>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${prog.pct}%` }} /></div>
                        <div className="mt-1 flex flex-wrap gap-1 text-xs text-slate-500">{prog.done}/{prog.total} done{stuck > 0 && <Badge tone="red">{stuck} stuck</Badge>}{overdue > 0 && <Badge tone="amber">{overdue} overdue</Badge>}</div>
                      </>
                    ) : <Link href={`/admin/projects/${p.id}/sprints`} className="text-xs text-brand-600">Start sprint</Link>}
                    {closeAt && <div className="mt-1 whitespace-nowrap text-xs text-slate-500">Projected close <b className="text-slate-700">{date(closeAt)}</b></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No projects here.</p>}
    </div>
  );
}
