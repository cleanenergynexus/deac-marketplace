"use client";
import { useEffect, useRef, useState } from "react";
import { setTaskPriority, setTaskWorkState } from "@/app/actions/contacts";
import { addSprintTask } from "@/app/actions/sprints";
import { PRIORITIES, WORK_STATES, priorityOf, type WorkState } from "@/lib/tasks";
import { NO_PRIORITY_COLOR, PRIORITY_COLOR, WORK_STATE_COLOR } from "@/lib/sprint-colors";

const cell = "h-full w-full cursor-pointer appearance-none border-0 px-2 py-2 text-center text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white/70";

/** Colored Status cell. Saves as soon as a status is picked. */
export function StatusCell({ taskId, state }: { taskId: string; state: WorkState }) {
  return (
    <form action={setTaskWorkState} className="h-full">
      <input type="hidden" name="id" value={taskId} />
      <select name="state" defaultValue={state} key={state} aria-label="Status" onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cell} style={{ backgroundColor: WORK_STATE_COLOR[state] }}>
        {WORK_STATES.map((s) => <option key={s.value} value={s.value} className="bg-white text-slate-900">{s.label}</option>)}
      </select>
    </form>
  );
}

/** Colored Priority cell. Saves as soon as a priority is picked. */
export function PriorityCell({ taskId, priority }: { taskId: string; priority: string | null }) {
  const p = priorityOf(priority);
  return (
    <form action={setTaskPriority} className="h-full">
      <input type="hidden" name="id" value={taskId} />
      <select name="priority" defaultValue={p ?? ""} key={p ?? ""} aria-label="Priority" onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cell} style={{ backgroundColor: p ? PRIORITY_COLOR[p] : NO_PRIORITY_COLOR }}>
        <option value="" className="bg-white text-slate-900">—</option>
        {PRIORITIES.map((x) => <option key={x.value} value={x.value} className="bg-white text-slate-900">{x.label}{x.value === "CRITICAL" ? " ⚠" : ""}</option>)}
      </select>
    </form>
  );
}

/** "+ Add Task" (or "+ Add Sub-task") row: type a title and press Enter. Dates, priority and person can be set on the row after. */
export function AddTaskRow({ sprintId, parentId, label }: { sprintId: string; parentId?: string; label: string }) {
  const form = useRef<HTMLFormElement>(null);
  const tz = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (tz.current) tz.current.value = String(new Date().getTimezoneOffset()); });
  return (
    <form ref={form} className="flex items-center gap-2"
      action={async (f) => {
        setError(null);
        setBusy(true);
        try { await addSprintTask(f); form.current?.reset(); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't add the task."); } finally { setBusy(false); }
      }}>
      <input type="hidden" name="sprintId" value={sprintId} />
      {parentId && <input type="hidden" name="parentId" value={parentId} />}
      <input type="hidden" name="tz" ref={tz} defaultValue="0" />
      <input name="subject" required disabled={busy} placeholder={label} aria-label={label} className="w-full border-0 bg-transparent px-0 py-1 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-0" />
      {error && <span className="shrink-0 text-xs text-red-600">{error}</span>}
    </form>
  );
}
