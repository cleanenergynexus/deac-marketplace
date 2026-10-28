"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createTask } from "@/app/actions/contacts";

type Props = {
  assignees: { id: string; name: string }[];
  me: string;
  allowUnassigned: boolean;
  contacts: { id: string; name: string; company: string; developerId: string }[];
  /** Investor CRM contacts, ids prefixed "inv:". Any listing can be picked with them. */
  investors?: { id: string; name: string; company: string; developerId: string }[];
  projects: { id: string; label: string; developerId: string }[];
};

/** New task on the Tasks page: title, due date, who it's for, and the CRM contact / project it's about. */
export function TaskForm({ assignees, me, allowUnassigned, contacts, investors = [], projects }: Props) {
  const [contactId, setContactId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const tz = useRef<HTMLInputElement>(null);
  useEffect(() => { if (tz.current) tz.current.value = String(new Date().getTimezoneOffset()); });
  const company = contacts.find((c) => c.id === contactId)?.developerId;
  const shown = company ? projects.filter((p) => p.developerId === company) : projects;

  return (
    <form
      action={async (f) => {
        setError(null);
        setSaved(false);
        try { await createTask(f); setContactId(""); setSaved(true); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't create the task."); }
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <input type="hidden" name="tz" ref={tz} defaultValue="0" />
      <label className="text-xs text-slate-500 sm:col-span-2">Task
        <input name="subject" required className="input mt-1" placeholder="e.g. Send NDA to Maria" />
      </label>
      <label className="text-xs text-slate-500">Due date
        <input type="date" name="dueAt" className="input mt-1" />
      </label>
      <label className="text-xs text-slate-500">Assign to
        <select name="assigneeId" defaultValue={me} className="input mt-1">
          {allowUnassigned && <option value="">Unassigned</option>}
          {assignees.map((a) => <option key={a.id} value={a.id}>{a.id === me ? `${a.name} (me)` : a.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-500">Contact
        <select name="contactId" value={contactId} onChange={(e) => setContactId(e.target.value)} className="input mt-1">
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
        <select name="projectId" defaultValue="" key={company ?? "all"} className="input mt-1">
          <option value="">—</option>
          {shown.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>
      <label className="text-xs text-slate-500 sm:col-span-2">Details (optional)
        <input name="body" className="input mt-1" />
      </label>
      <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-4">
        <Submit />
        {saved && <span className="text-sm text-emerald-700">Task created.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn" disabled={pending}>{pending ? "Saving…" : "Create task"}</button>;
}
