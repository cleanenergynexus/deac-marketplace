import Link from "next/link";
import { toggleAgentTask } from "@/app/actions/agent";
import { AGENT_LINKS, type AgentTask, type AgentTaskLinks } from "@/lib/agent-portal";
import { taskState } from "@/lib/crm";
import { CrmIcon } from "@/components/CrmIcons";
import { LocalTime } from "@/components/LocalTime";

/** A referral agent's own tasks, with a button to tick each one off. Names link to the agent's portal pages they can open. */
export function AgentTaskList({ tasks, can, empty = "No tasks assigned to you." }: { tasks: AgentTask[]; can: AgentTaskLinks; empty?: string }) {
  if (!tasks.length) return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2">
      {tasks.map((t) => {
        const state = taskState(t);
        return (
          <li key={t.id} className="flex gap-3 rounded-lg border border-slate-200 p-3 text-sm">
            <form action={toggleAgentTask}>
              <input type="hidden" name="id" value={t.id} />
              <button aria-label={t.doneAt ? "Mark task not done" : "Mark task done"} title={t.doneAt ? "Mark not done" : "Mark done"}
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${t.doneAt ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-500 hover:text-emerald-500"}`}>
                <CrmIcon name="TASK" />
              </button>
            </form>
            <div className="min-w-0 flex-1">
              <div className={`font-semibold ${t.doneAt ? "text-slate-400 line-through" : "text-slate-900"}`}>{t.subject || "Task"}</div>
              {t.body && <p className="mt-1 whitespace-pre-wrap text-slate-700">{t.body}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {t.doneAt ? <span className="text-emerald-700">Completed <LocalTime value={t.doneAt} time={false} /></span>
                  : t.dueAt ? <span className={state === "overdue" ? "font-semibold text-red-600" : state === "due-today" ? "font-semibold text-amber-700" : ""}>{state === "overdue" ? "Overdue · " : state === "due-today" ? "Due today · " : "Due "}<LocalTime value={t.dueAt} time={false} /></span>
                  : <span>No due date</span>}
                {t.contact && <Name href={can.contact.has(t.contact.id) ? AGENT_LINKS.contact(t.contact.id) : null}>{t.contact.name} · {t.contact.developer.company}</Name>}
                {t.investor && <Name href={can.investor.has(t.investor.id) ? AGENT_LINKS.investor(t.investor.id) : null}>{t.investor.name}{t.investor.firm ? ` · ${t.investor.firm}` : ""}</Name>}
                {t.project && <Name href={can.project.has(t.project.id) ? AGENT_LINKS.project(t.project.id) : null} mono title={t.project.title}>{t.project.code}</Name>}
                {t.by && <span>from {t.by}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Name({ href, mono, title, children }: { href: string | null; mono?: boolean; title?: string; children: React.ReactNode }) {
  const cls = mono ? "rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600" : "";
  return href ? <Link href={href} title={title} className={`${cls} text-brand-600`}>{children}</Link> : <span title={title} className={cls}>{children}</span>;
}
