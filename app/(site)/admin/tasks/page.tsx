import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { deleteActivity, toggleTask } from "@/app/actions/contacts";
import { AssigneeSelect } from "@/components/AssigneeSelect";
import { withCurrent } from "@/components/ActivityFeed";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CrmIcon } from "@/components/CrmIcons";
import { LocalTime } from "@/components/LocalTime";
import { TaskForm } from "@/components/TaskForm";
import { Badge, PageHeader } from "@/components/ui";
import { taskState } from "@/lib/crm";
import { sortTasks, staffLevel, staffLevelLabel, TASK_STATUSES, taskScope, taskScopes, taskStatus, visibleStaff, type TaskScope } from "@/lib/tasks";
import { getTeam, visibleTaskWhere } from "@/lib/tasks-db";

export const dynamic = "force-dynamic";

type Search = { scope?: string; status?: string; who?: string };

/** Everyone's tasks from the Developer and Investor CRMs, limited by access level: Admin all, Manager their team, Support their own. */
export default async function Tasks({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const [me, team] = await Promise.all([requireAdmin(), getTeam()]);
  const level = staffLevel(me.staffLevel);
  const scope = taskScope(sp.scope, level);
  const status = taskStatus(sp.status);
  const people = visibleStaff(me, team);
  const allowUnassigned = level === "ADMIN";
  const assignees = people.map((u) => ({ id: u.id, name: u.name }));

  // Whose tasks this view covers. "who" narrows Team / All views to one person (or "none" = unassigned).
  const scopeIds: Record<TaskScope, string[] | null> = { mine: [me.id], team: people.map((u) => u.id), all: null };
  const ids = scopeIds[scope];
  const who = scope !== "mine" && sp.who && (sp.who === "none" ? allowUnassigned : people.some((u) => u.id === sp.who)) ? sp.who : undefined;
  const assigneeFilter: Prisma.ActivityWhereInput = who === "none" ? { assigneeId: null } : who ? { assigneeId: who } : ids ? { assigneeId: { in: ids } } : {};
  const where: Prisma.ActivityWhereInput = { AND: [visibleTaskWhere(me, team), assigneeFilter] };

  const [open, done, contacts, projects, investors] = await Promise.all([
    db.activity.findMany({ where: { ...where, doneAt: null }, include: taskInclude }),
    status === "done" ? db.activity.findMany({ where: { ...where, doneAt: { not: null } }, include: taskInclude, orderBy: { doneAt: "desc" }, take: 200 }) : [],
    db.contact.findMany({ select: { id: true, name: true, developerId: true, developer: { select: { company: true } } }, orderBy: { name: "asc" } }),
    db.project.findMany({ select: { id: true, code: true, title: true, developerId: true }, orderBy: { code: "asc" } }),
    db.investor.findMany({ select: { id: true, name: true, firm: true }, orderBy: { name: "asc" } }),
  ]);
  const overdue = open.filter((t) => taskState(t) === "overdue");
  const shown = sortTasks(status === "done" ? done : status === "overdue" ? overdue : open);

  // Outstanding / overdue per person, for the Team and All views.
  const perPerson = scope === "mine" ? [] : [
    ...(scope === "all" ? team : people).map((u) => ({ id: u.id, name: u.name, level: u.staffLevel, open: open.filter((t) => t.assigneeId === u.id).length, overdue: overdue.filter((t) => t.assigneeId === u.id).length })),
    ...(scope === "all" ? [{ id: "none", name: "Unassigned", level: null, open: open.filter((t) => !t.assigneeId).length, overdue: overdue.filter((t) => !t.assigneeId).length }] : []),
  ].filter((p) => p.open || p.id === me.id || scope === "team");

  const link = (next: Partial<Search>) => {
    const q = new URLSearchParams(Object.entries({ scope, status, who, ...next }).filter(([, v]) => v) as [string, string][]);
    return `/admin/tasks?${q}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tasks"
        subtitle={level === "ADMIN" ? "Every task in the Developer and Investor CRMs. You can assign tasks to anyone on the team." : level === "MANAGER" ? "Your tasks and your team's. You can assign tasks to yourself and the people who report to you." : "Tasks assigned to you."}
        action={<Badge tone="slate">{staffLevelLabel(level)} access</Badge>}
      />

      <details className="card p-4" open={!open.length}>
        <summary className="cursor-pointer text-sm font-semibold">New task</summary>
        <div className="mt-4">
          <TaskForm assignees={assignees} me={me.id} allowUnassigned={allowUnassigned}
            contacts={contacts.map((c) => ({ id: c.id, name: c.name, company: c.developer.company, developerId: c.developerId }))}
            investors={investors.map((i) => ({ id: `inv:${i.id}`, name: i.name, company: i.firm ?? "Investor", developerId: "" }))}
            projects={projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.title}`, developerId: p.developerId }))} />
        </div>
      </details>

      <nav className="flex gap-1 border-b border-slate-200">
        {taskScopes(level).map((s) => (
          <Link key={s.value} href={link({ scope: s.value, who: undefined })} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${s.value === scope ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>{s.label}</Link>
        ))}
      </nav>

      {perPerson.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {perPerson.map((p) => (
            <Link key={p.id} href={link({ who: who === p.id ? undefined : p.id })} className={`card flex items-center justify-between p-3 text-sm hover:border-brand-500 ${who === p.id ? "border-brand-500 ring-1 ring-brand-500" : ""}`}>
              <span className="min-w-0"><span className="block truncate font-medium">{p.name}{p.id === me.id ? " (me)" : ""}</span>{p.level && <span className="text-xs text-slate-500">{staffLevelLabel(p.level)}</span>}</span>
              <span className="text-right text-xs"><span className="block font-semibold text-slate-800">{p.open} open</span>{p.overdue > 0 && <span className="font-semibold text-red-600">{p.overdue} overdue</span>}</span>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {TASK_STATUSES.map((s) => (
          <Link key={s.value} href={link({ status: s.value })} className={`rounded-full px-3 py-1 text-xs font-medium ${s.value === status ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {s.label}{s.value === "open" ? ` (${open.length})` : s.value === "overdue" ? ` (${overdue.length})` : ""}
          </Link>
        ))}
        {who && <Link href={link({ who: undefined })} className="text-xs text-brand-600">Showing {who === "none" ? "unassigned tasks" : team.find((u) => u.id === who)?.name} · clear</Link>}
      </div>

      {!shown.length ? (
        <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {status === "done" ? "No completed tasks yet." : status === "overdue" ? "Nothing overdue." : scope === "mine" ? "No outstanding tasks. Create one above or from a contact record." : "No outstanding tasks."}
        </p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th w-10"></th><th className="th">Task</th><th className="th">Due</th><th className="th">Assigned to</th><th className="th">Contact</th><th className="th">Company</th><th className="th">Project</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((t) => {
                const state = taskState(t);
                return (
                  <tr key={t.id} className="align-top">
                    <td className="td">
                      <form action={toggleTask}>
                        <input type="hidden" name="id" value={t.id} />
                        <button aria-label={t.doneAt ? "Mark task not done" : "Mark task done"} title={t.doneAt ? "Mark not done" : "Mark done"}
                          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${t.doneAt ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500"}`}>
                          <CrmIcon name="TASK" className="h-4 w-4" />
                        </button>
                      </form>
                    </td>
                    <td className="td">
                      <div className={`font-medium ${t.doneAt ? "text-slate-400 line-through" : "text-slate-900"}`}>{t.subject || "Task"}</div>
                      {t.body && <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">{t.body}</div>}
                      {t.by && <div className="mt-0.5 text-xs text-slate-400">Created by {t.by}</div>}
                    </td>
                    <td className="td whitespace-nowrap text-xs">
                      {t.doneAt ? <span className="text-emerald-700">Done <LocalTime value={t.doneAt} time={false} /></span>
                        : t.dueAt ? <span className={state === "overdue" ? "font-semibold text-red-600" : state === "due-today" ? "font-semibold text-amber-700" : "text-slate-600"}>{state === "overdue" ? "Overdue · " : state === "due-today" ? "Today · " : ""}<LocalTime value={t.dueAt} time={false} /></span>
                        : <span className="text-slate-400">No date</span>}
                    </td>
                    <td className="td">
                      {t.doneAt || (assignees.length < 2 && !allowUnassigned) ? <span className="whitespace-nowrap text-sm">{t.assignee?.name ?? "Unassigned"}</span>
                        : <AssigneeSelect taskId={t.id} assigneeId={t.assigneeId} options={withCurrent(assignees, t.assignee)} allowUnassigned={allowUnassigned} className="!w-44 text-sm" />}
                    </td>
                    <td className="td text-sm">
                      {t.contact ? <Link href={`/admin/developers/contacts/${t.contact.id}?tab=tasks`} className="text-brand-600">{t.contact.name}</Link>
                        : t.investor ? <Link href={`/admin/investors/${t.investor.id}?tab=tasks`} className="text-brand-600">{t.investor.name}</Link>
                        : <span className="text-slate-400">—</span>}
                      {t.investor && <div className="text-[11px] text-slate-400">Investor</div>}
                    </td>
                    <td className="td text-sm">
                      {t.developer ? <Link href={`/admin/developers/${t.developer.id}`} className="text-slate-700 hover:text-brand-600">{t.developer.company}</Link>
                        : t.investor?.firmId ? <Link href={`/admin/investors/companies/${t.investor.firmId}`} className="text-slate-700 hover:text-brand-600">{t.investor.firm}</Link>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="td text-sm">{t.project ? <Link href={`/admin/projects/${t.project.id}`} title={t.project.title} className="whitespace-nowrap rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 hover:text-brand-600">{t.project.code}</Link> : <span className="text-slate-400">—</span>}</td>
                    <td className="td text-right">
                      <form action={deleteActivity}>
                        <input type="hidden" name="id" value={t.id} />
                        <ConfirmButton message="Delete this task?" className="text-xs text-slate-400 hover:text-red-600">Delete</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const taskInclude = {
  assignee: { select: { id: true, name: true } },
  contact: { select: { id: true, name: true } },
  developer: { select: { id: true, company: true } },
  investor: { select: { id: true, name: true, firm: true, firmId: true } },
  project: { select: { id: true, code: true, title: true } },
} satisfies Prisma.ActivityInclude;
