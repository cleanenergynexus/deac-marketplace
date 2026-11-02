"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createTask, updateTask } from "@/app/actions/contacts";
import type { TaskPickers } from "@/lib/tasks-db";

/** A saved task, as the edit form needs it. */
export type EditableTask = {
  id: string;
  subject: string | null;
  body: string;
  dueAt: Date | null;
  assigneeId: string | null;
  contactId: string | null;
  investorId: string | null;
  projectId: string | null;
};

type Props = TaskPickers & {
  assignees: { id: string; name: string }[];
  me: string;
  allowUnassigned: boolean;
  /** Editing an existing task instead of creating one. */
  task?: EditableTask;
  /** Called after a successful save (e.g. to close the edit dialog). */
  onDone?: () => void;
  onCancel?: () => void;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** The due date as the browser's own calendar day, for a date input. */
const dayInput = (d: Date | null) => (d ? `${new Date(d).getFullYear()}-${pad(new Date(d).getMonth() + 1)}-${pad(new Date(d).getDate())}` : "");

/** New task (or edit an existing one): title, due date, who it's for, and the CRM contact / project it's about. */
export function TaskForm({ assignees, me, allowUnassigned, contacts, investors = [], projects, task, onDone, onCancel }: Props) {
  const editing = !!task;
  const [contactId, setContactId] = useState(task?.investorId ? `inv:${task.investorId}` : task?.contactId ?? "");
  const [projectId, setProjectId] = useState(task?.projectId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const tz = useRef<HTMLInputElement>(null);
  useEffect(() => { if (tz.current) tz.current.value = String(new Date().getTimezoneOffset()); });
  const company = contacts.find((c) => c.id === contactId)?.developerId;
  const shown = company ? projects.filter((p) => p.developerId === company) : projects;
  const people = task?.assigneeId && !assignees.some((a) => a.id === task.assigneeId) ? [{ id: task.assigneeId, name: "Current assignee" }, ...assignees] : assignees;
  const pickContact = (id: string) => {
    setContactId(id);
    const dev = contacts.find((c) => c.id === id)?.developerId;
    // A project from another company can't stay linked.
    if (dev && projectId && projects.find((p) => p.id === projectId)?.developerId !== dev) setProjectId("");
  };

  return (
    <form
      ref={form}
      action={async (f) => {
        setError(null);
        setSaved(false);
        try {
          if (task) { await updateTask(f); onDone?.(); return; }
          await createTask(f);
          form.current?.reset();
          setContactId("");
          setProjectId("");
          setSaved(true);
        } catch (e) { setError(e instanceof Error ? e.message : "Couldn't save the task."); }
      }}
      className={`grid gap-3 sm:grid-cols-2 ${editing ? "" : "lg:grid-cols-4"}`}
    >
      <input type="hidden" name="tz" ref={tz} defaultValue="0" />
      {task && <input type="hidden" name="id" value={task.id} />}
      <label className="text-xs text-slate-500 sm:col-span-2">Task
        <input name="subject" required defaultValue={task?.subject ?? ""} className="input mt-1" placeholder="e.g. Send NDA to Maria" />
      </label>
      <label className="text-xs text-slate-500">Due date
        <input type="date" name="dueAt" defaultValue={dayInput(task?.dueAt ?? null)} className="input mt-1" />
      </label>
      <label className="text-xs text-slate-500">Assign to
        <select name="assigneeId" defaultValue={task ? task.assigneeId ?? "" : me} className="input mt-1">
          {(allowUnassigned || (task && !task.assigneeId)) && <option value="">Unassigned</option>}
          {people.map((a) => <option key={a.id} value={a.id}>{a.id === me ? `${a.name} (me)` : a.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-500">Contact
        <select name="contactId" value={contactId} onChange={(e) => pickContact(e.target.value)} className="input mt-1">
          <option value="">—</option>
          {investors.length > 0 ? (
            <>
              <optgroup label="Developer CRM">{contacts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.company}</option>)}</optgroup>
              <optgroup label="Investor CRM">{investors.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.company}</option>)}</optgroup>
            </>
          ) : contacts.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.company}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-500">Project
        <select name="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} className="input mt-1">
          <option value="">—</option>
          {shown.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-500 sm:col-span-2">Details (optional)
        <textarea name="body" rows={editing ? 3 : 1} defaultValue={task?.body ?? ""} className="input mt-1" />
      </label>
      <div className={`flex items-center gap-3 sm:col-span-2 ${editing ? "" : "lg:col-span-4"}`}>
        <Submit label={editing ? "Save changes" : "Create task"} />
        {onCancel && <button type="button" onClick={onCancel} className="btn-ghost">Cancel</button>}
        {saved && <span className="text-sm text-emerald-700">Task created.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn" disabled={pending}>{pending ? "Saving…" : label}</button>;
}
