import Link from "next/link";
import type { Activity } from "@prisma/client";
import { deleteActivity, toggleTask } from "@/app/actions/contacts";
import { activityTitle, groupByMonth, isLogKind, taskState } from "@/lib/crm";
import { CrmIcon } from "@/components/CrmIcons";
import { LocalTime } from "@/components/LocalTime";
import { ConfirmButton } from "@/components/ConfirmButton";
import { AssigneeSelect, type Assignee } from "@/components/AssigneeSelect";

export type FeedItem = Activity & {
  contact?: { id: string; name: string } | null;
  project?: { id: string; code: string; title: string } | null;
  assignee?: Assignee | null;
};
/** Lets tasks in the feed be reassigned: who this person can assign to, and whether "Unassigned" is allowed (Admins). */
export type Assigning = { options: Assignee[]; allowUnassigned: boolean };

const TONE: Record<string, string> = {
  NOTE: "bg-amber-50 text-amber-700", EMAIL: "bg-brand-50 text-brand-600", CALL: "bg-emerald-50 text-emerald-700",
  MEETING: "bg-violet-50 text-violet-700", TASK: "bg-slate-100 text-slate-700", STAGE: "bg-slate-100 text-slate-500", SYSTEM: "bg-slate-100 text-slate-500",
};

/** Contact / company timeline grouped by month, newest first. Tasks can be ticked off; logged entries can be deleted. */
export function ActivityFeed({ items, showContact = false, empty = "Nothing logged yet.", assigning }: { items: FeedItem[]; showContact?: boolean; empty?: string; assigning?: Assigning }) {
  if (!items.length) return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="space-y-5">
      {groupByMonth(items).map((g) => (
        <section key={g.month}>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{g.month}</h3>
          <ul className="space-y-2">
            {g.items.map((a) => {
              const task = a.kind === "TASK" ? taskState(a) : null;
              return (
                <li key={a.id} className="card flex gap-3 p-4 text-sm">
                  {a.kind === "TASK" ? (
                    <form action={toggleTask}>
                      <input type="hidden" name="id" value={a.id} />
                      <button aria-label={a.doneAt ? "Mark task not done" : "Mark task done"} title={a.doneAt ? "Mark not done" : "Mark done"}
                        className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${a.doneAt ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500"}`}>
                        <CrmIcon name="TASK" />
                      </button>
                    </form>
                  ) : (
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full ${TONE[a.kind] ?? TONE.SYSTEM}`}><CrmIcon name={a.kind} /></span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className={`font-semibold ${a.doneAt ? "text-slate-400 line-through" : "text-slate-900"}`}>{activityTitle(a)}</span>
                      <span className="text-xs text-slate-500"><LocalTime value={a.createdAt} /></span>
                    </div>
                    {a.body && <p className="mt-1 whitespace-pre-wrap text-slate-700">{a.body}</p>}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      {task && task !== "done" && a.dueAt && (
                        <span className={task === "overdue" ? "font-semibold text-red-600" : task === "due-today" ? "font-semibold text-amber-700" : ""}>
                          {task === "overdue" ? "Overdue · " : task === "due-today" ? "Due today · " : "Due "}<LocalTime value={a.dueAt} time={false} />
                        </span>
                      )}
                      {a.doneAt && <span className="text-emerald-700">Completed <LocalTime value={a.doneAt} time={false} /></span>}
                      {a.kind === "TASK" && (assigning && !a.doneAt && (assigning.options.length > 1 || assigning.allowUnassigned) ? (
                        <span className="inline-flex items-center gap-1">For <AssigneeSelect taskId={a.id} assigneeId={a.assigneeId} options={withCurrent(assigning.options, a.assignee)} allowUnassigned={assigning.allowUnassigned} className="!w-40" /></span>
                      ) : (
                        <span>For {a.assignee?.name ?? "nobody yet"}</span>
                      ))}
                      {showContact && a.contact && <Link href={`/admin/developers/contacts/${a.contact.id}`} className="text-brand-600">{a.contact.name}</Link>}
                      {a.project && <Link href={`/admin/projects/${a.project.id}`} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600 hover:text-brand-600" title={a.project.title}>{a.project.code}</Link>}
                      {a.by && <span>by {a.by}</span>}
                      {isLogKind(a.kind) && (
                        <form action={deleteActivity} className="ml-auto">
                          <input type="hidden" name="id" value={a.id} />
                          <ConfirmButton message="Delete this entry from the timeline?" className="text-slate-400 hover:text-red-600">Delete</ConfirmButton>
                        </form>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Assignee options, keeping the task's current assignee listed even when this person couldn't pick them. */
export function withCurrent(options: Assignee[], current?: Assignee | null): Assignee[] {
  return current && !options.some((o) => o.id === current.id) ? [current, ...options] : options;
}
