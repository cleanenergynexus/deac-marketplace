"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { logContactActivity } from "@/app/actions/contacts";
import { CALL_OUTCOMES, EMAIL_DIRECTIONS, LOG_KINDS, type LogKind } from "@/lib/crm";
import { CrmIcon } from "@/components/CrmIcons";

type Props = {
  contactId: string;
  contactEmail: string | null;
  projects: { id: string; label: string }[];
  initialKind: LogKind;
  /** Team members this person can assign tasks to, and who they are (the default assignee). */
  assignees: { id: string; name: string }[];
  me: string;
  allowUnassigned: boolean;
};

const PLACEHOLDER: Record<LogKind, string> = {
  NOTE: "Start typing to leave a note…",
  EMAIL: "Paste or summarize the email…",
  CALL: "What was discussed? Next steps?",
  MEETING: "Who attended, what was agreed…",
  TASK: "Details (optional)",
};

/** Log box above the contact timeline: pick Note, Email, Call, Meeting or Task, fill it in, save. */
export function ActivityComposer({ contactId, contactEmail, projects, initialKind, assignees, me, allowUnassigned }: Props) {
  const [kind, setKind] = useState<LogKind>(initialKind);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const tz = useRef<HTMLInputElement>(null);
  useEffect(() => setKind(initialKind), [initialKind]);
  useEffect(() => { if (tz.current) tz.current.value = String(new Date().getTimezoneOffset()); });

  const mailto = contactEmail ? `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;

  return (
    <form
      id="composer"
      action={async (f) => { await logContactActivity(f); setSubject(""); setBody(""); }}
      className="card space-y-3 p-4"
    >
      <input type="hidden" name="contactId" value={contactId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="tz" ref={tz} defaultValue="0" />
      <div role="tablist" aria-label="What are you logging?" className="flex flex-wrap gap-1">
        {LOG_KINDS.map((k) => (
          <button key={k.value} type="button" role="tab" aria-selected={kind === k.value} onClick={() => setKind(k.value)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${kind === k.value ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            <CrmIcon name={k.value} className="h-3.5 w-3.5" />{k.label}
          </button>
        ))}
      </div>

      {(kind === "EMAIL" || kind === "MEETING" || kind === "TASK") && (
        <input name="subject" value={subject} onChange={(e) => setSubject(e.target.value)} required className="input"
          placeholder={kind === "TASK" ? "Task, e.g. Send NDA to Maria" : kind === "EMAIL" ? "Subject" : "Meeting title"} />
      )}
      <textarea name="body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} required={kind === "NOTE" || kind === "CALL"} className="input" placeholder={PLACEHOLDER[kind]} />

      <div className="flex flex-wrap items-end gap-3">
        {kind === "CALL" && (
          <label className="text-xs text-slate-500">Outcome
            <select name="outcome" defaultValue="CONNECTED" className="input mt-1 w-40 py-1.5">{CALL_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          </label>
        )}
        {kind === "EMAIL" && (
          <label className="text-xs text-slate-500">Direction
            <select name="outcome" defaultValue="SENT" className="input mt-1 w-48 py-1.5">{EMAIL_DIRECTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          </label>
        )}
        {kind === "TASK" ? (
          <>
            <label className="text-xs text-slate-500">Due date
              <input type="date" name="dueAt" className="input mt-1 w-40 py-1.5" />
            </label>
            <label className="text-xs text-slate-500">Assign to
              <select name="assigneeId" defaultValue={me} className="input mt-1 w-48 py-1.5">
                {allowUnassigned && <option value="">Unassigned</option>}
                {assignees.map((a) => <option key={a.id} value={a.id}>{a.id === me ? `${a.name} (me)` : a.name}</option>)}
              </select>
            </label>
          </>
        ) : (
          <label className="text-xs text-slate-500">When <span className="text-slate-400">(blank = now)</span>
            <input type="datetime-local" name="when" className="input mt-1 w-52 py-1.5" />
          </label>
        )}
        {projects.length > 0 && (
          <label className="text-xs text-slate-500">About project
            <select name="projectId" defaultValue="" className="input mt-1 w-56 py-1.5">
              <option value="">—</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        )}
        <div className="ml-auto flex items-center gap-2">
          {kind === "EMAIL" && mailto && <a href={mailto} className="btn-ghost" title="Opens your email app with this subject and text">Write in email app</a>}
          <Submit kind={kind} />
        </div>
      </div>
    </form>
  );
}

function Submit({ kind }: { kind: LogKind }) {
  const { pending } = useFormStatus();
  const label = { NOTE: "Save note", EMAIL: "Log email", CALL: "Log call", MEETING: "Log meeting", TASK: "Create task" }[kind];
  return <button className="btn" disabled={pending}>{pending ? "Saving…" : label}</button>;
}
