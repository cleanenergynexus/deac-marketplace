"use client";
import { useState, useTransition, type FormEvent } from "react";
import { AssigneeOptions } from "@/components/AssigneeOptions";
import { DEFAULT_SPRINTS, MAX_SUBTASKS, MAX_TASKS, stageSprint, templateId, type SprintAssignee, type SprintTaskTemplate, type SprintTemplates, type StageSprint } from "@/lib/sprints";
import { PRIORITIES, priorityOf, type AssigneeOption } from "@/lib/tasks";
import { groupColor } from "@/lib/sprint-colors";

type State = { error?: string; ok?: string } | undefined;
type Stage = { value: string; label: string };

const swap = <T,>(xs: T[], i: number, j: number) => { if (j < 0 || j >= xs.length) return xs; const n = [...xs]; [n[i], n[j]] = [n[j], n[i]]; return n; };
const assigneeValue = (a: SprintAssignee) => (a.kind === "USER" ? a.id : a.kind);
const assigneeFrom = (v: string): SprintAssignee => (v === "MOVER" ? { kind: "MOVER" } : v === "NONE" ? { kind: "NONE" } : { kind: "USER", id: v });
const dayNum = (v: string) => (v.trim() === "" ? null : Math.max(0, Math.round(Number(v)) || 0));

/** Edits the sprint for each CRM stage: its goal, length, and tasks with their sub-tasks, timeline, priority and person. */
export function SprintTemplateEditor({ initial, stages, people, action }: { initial: SprintTemplates; stages: Stage[]; people: AssigneeOption[]; action: (s: State, f: FormData) => Promise<State> }) {
  const [cfg, setCfg] = useState<Record<string, StageSprint>>(() => Object.fromEntries(stages.map((s) => [s.value, stageSprint(initial, s.value)])));
  const [active, setActive] = useState(stages[0]?.value ?? "");
  const [state, setState] = useState<State>(undefined);
  const [pending, start] = useTransition();
  const sprint = cfg[active] ?? { goal: "", days: null, tasks: [] };
  const set = (next: StageSprint) => { setCfg((c) => ({ ...c, [active]: next })); setState(undefined); };
  const setTasks = (fn: (ts: SprintTaskTemplate[]) => SprintTaskTemplate[]) => set({ ...sprint, tasks: fn(sprint.tasks) });
  const editTask = (i: number, patch: Partial<SprintTaskTemplate>) => setTasks((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const known = new Set(people.map((p) => p.id));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("config", JSON.stringify({ stages: { ...initial.stages, ...cfg } }));
    start(async () => setState(await action(undefined, fd)));
  };

  const btn = "h-7 w-7 shrink-0 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30";
  const color = groupColor(stages.findIndex((s) => s.value === active));
  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[200px_1fr]">
      <nav className="card h-fit p-2">
        {stages.map((s, i) => (
          <button key={s.value} type="button" onClick={() => setActive(s.value)}
            className={`flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm ${active === s.value ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-700 hover:bg-slate-50"}`}>
            <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: groupColor(i) }} />{s.label}</span>
            <span className="text-xs text-slate-400">{cfg[s.value]?.tasks.length ?? 0}</span>
          </button>
        ))}
      </nav>

      <div className="space-y-4">
        <div className="card border-l-[6px] p-5" style={{ borderLeftColor: color }}>
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <label className="block"><span className="label">Sprint goal</span>
              <input value={sprint.goal} onChange={(e) => set({ ...sprint, goal: e.target.value })} className="input" placeholder="e.g. Screen the project and decide Advance, Hold or Decline." maxLength={300} />
            </label>
            <label className="block"><span className="label">Length (days)</span>
              <input type="number" min={0} max={365} value={sprint.days ?? ""} onChange={(e) => set({ ...sprint, days: dayNum(e.target.value) })} className="input" placeholder="—" />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">Task dates are days after the sprint starts (day 0 = the day the project enters this stage). The sprint length sets its target date and the projected close on the roadmap.</p>
        </div>

        {sprint.tasks.map((t, i) => (
          <div key={t.id} className="card p-4">
            <div className="flex items-center gap-1">
              <span className="mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs text-white" style={{ backgroundColor: color }}>{i + 1}</span>
              <input value={t.title} onChange={(e) => editTask(i, { title: e.target.value })} aria-label="Task" placeholder="Task" className="input font-medium" maxLength={200} />
              <button type="button" title="Move up" aria-label="Move task up" onClick={() => setTasks((ts) => swap(ts, i, i - 1))} disabled={i === 0} className={btn}>↑</button>
              <button type="button" title="Move down" aria-label="Move task down" onClick={() => setTasks((ts) => swap(ts, i, i + 1))} disabled={i === sprint.tasks.length - 1} className={btn}>↓</button>
              <button type="button" title="Remove task" aria-label={`Remove ${t.title}`} onClick={() => setTasks((ts) => ts.filter((_, j) => j !== i))} className={`${btn} hover:!text-red-600`}>×</button>
            </div>
            <div className="mt-2 grid gap-2 pl-8 sm:grid-cols-4">
              <label className="text-xs text-slate-500">Start (day)
                <input type="number" min={0} max={365} value={t.startDays ?? ""} onChange={(e) => editTask(i, { startDays: dayNum(e.target.value) })} className="input mt-1 py-1.5" placeholder="—" />
              </label>
              <label className="text-xs text-slate-500">Due (day)
                <input type="number" min={0} max={365} value={t.dueDays ?? ""} onChange={(e) => editTask(i, { dueDays: dayNum(e.target.value) })} className="input mt-1 py-1.5" placeholder="—" />
              </label>
              <label className="text-xs text-slate-500">Priority
                <select value={t.priority ?? ""} onChange={(e) => editTask(i, { priority: priorityOf(e.target.value) })} className="input mt-1 py-1.5">
                  <option value="">—</option>
                  {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </label>
              <label className="text-xs text-slate-500">Assign to
                <select value={assigneeValue(t.assignee)} onChange={(e) => editTask(i, { assignee: assigneeFrom(e.target.value) })} className="input mt-1 py-1.5">
                  <option value="MOVER">Whoever moves the project</option>
                  <option value="NONE">Unassigned</option>
                  {t.assignee.kind === "USER" && !known.has(t.assignee.id) && <option value={t.assignee.id}>Removed person (falls back to the mover)</option>}
                  <AssigneeOptions options={people} />
                </select>
              </label>
              <textarea value={t.details} rows={1} onChange={(e) => editTask(i, { details: e.target.value })} aria-label="Details" placeholder="Details (optional)" className="input resize-y py-1.5 text-sm sm:col-span-4" maxLength={2000} />
            </div>
            <ul className="mt-2 space-y-1 pl-8">
              {t.subtasks.map((x, k) => (
                <li key={x.id} className="flex items-center gap-1">
                  <span className="w-5 shrink-0 text-slate-300">↳</span>
                  <input value={x.title} onChange={(e) => editTask(i, { subtasks: t.subtasks.map((y, j) => (j === k ? { ...y, title: e.target.value } : y)) })} aria-label="Sub-task" placeholder="Sub-task" className="input py-1 text-sm" maxLength={200} />
                  <input type="number" min={0} max={365} value={x.dueDays ?? ""} onChange={(e) => editTask(i, { subtasks: t.subtasks.map((y, j) => (j === k ? { ...y, dueDays: dayNum(e.target.value) } : y)) })} aria-label="Sub-task due day" title="Due (day); empty = the task's due day" placeholder="Due" className="input !w-20 shrink-0 py-1 text-sm" />
                  <button type="button" title="Move up" aria-label="Move sub-task up" onClick={() => editTask(i, { subtasks: swap(t.subtasks, k, k - 1) })} disabled={k === 0} className={btn}>↑</button>
                  <button type="button" title="Remove sub-task" aria-label="Remove sub-task" onClick={() => editTask(i, { subtasks: t.subtasks.filter((_, j) => j !== k) })} className={`${btn} hover:!text-red-600`}>×</button>
                </li>
              ))}
            </ul>
            {t.subtasks.length < MAX_SUBTASKS && (
              <button type="button" onClick={() => editTask(i, { subtasks: [...t.subtasks, { id: templateId("s"), title: "", dueDays: null }] })} className="ml-8 mt-1 rounded px-2 py-1 text-sm text-brand-600 hover:bg-brand-50">+ Sub-task</button>
            )}
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-2">
          {sprint.tasks.length < MAX_TASKS && (
            <button type="button" onClick={() => setTasks((ts) => [...ts, { id: templateId("t"), title: "", details: "", startDays: 0, dueDays: sprint.days, priority: null, assignee: { kind: "MOVER" }, subtasks: [] }])} className="btn-ghost">+ Task</button>
          )}
          {DEFAULT_SPRINTS.stages[active] && (
            <button type="button" onClick={() => { if (confirm(`Replace the ${stages.find((s) => s.value === active)?.label} sprint with DEAC's default?`)) set(DEFAULT_SPRINTS.stages[active]); }} className="btn-ghost">Restore DEAC default</button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save templates"}</button>
          {state?.ok && <span role="status" className="text-sm font-medium text-emerald-700">✓ {state.ok}</span>}
          {state?.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
        </div>
      </div>
    </form>
  );
}
