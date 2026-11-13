"use client";
// Forms for collaborating on a listing: tasks, the discussion with the DEAC team, and an agent's edits to the details.
import { useActionState, useEffect, useRef } from "react";
import { agentCreateTask, agentEditListing, agentPostComment } from "@/app/actions/agent";
import { teamPostComment } from "@/app/actions/listing-collab";
import { AGENT_EDIT_FIELDS, type FieldValue } from "@/lib/listing-collab";
import { MoneyInput } from "@/components/MoneyInput";

type State = { error?: string; ok?: boolean } | undefined;

function Result({ state, ok }: { state: State; ok: string }) {
  if (state?.error) return <p role="alert" className="text-sm text-red-600">{state.error}</p>;
  if (state?.ok) return <p role="status" className="text-sm text-emerald-700">{ok}</p>;
  return null;
}

/** Clears the form after a successful save (React keeps the typed values otherwise when the action returns state). */
function useResetOnOk(state: State) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return ref;
}

/** New task on a listing, for the agent or someone on the DEAC team. */
export function AgentTaskForm({ projectId, assignees, disabled }: { projectId: string; assignees: { id: string; name: string }[]; disabled?: boolean }) {
  const [state, action, pending] = useActionState<State, FormData>(agentCreateTask, undefined);
  const ref = useResetOnOk(state);
  const tz = useRef<HTMLInputElement>(null);
  useEffect(() => { if (tz.current) tz.current.value = String(new Date().getTimezoneOffset()); });
  return (
    <form ref={ref} action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input ref={tz} type="hidden" name="tz" defaultValue="0" />
      <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-700">Task</span><input name="subject" required maxLength={200} className="input" placeholder="e.g. Get the updated utility letter from the developer" /></label>
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Assign to</span>
        <select name="assigneeId" className="input" defaultValue={assignees[0]?.id}>
          <option value={assignees[0]?.id}>{assignees[0]?.name}</option>
          {assignees.length > 1 && <optgroup label="DEAC Team">{assignees.slice(1).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</optgroup>}
        </select>
      </label>
      <label className="block text-sm"><span className="mb-1 block font-medium text-slate-700">Due date (optional)</span><input type="date" name="dueAt" className="input" /></label>
      <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-700">Details (optional)</span><textarea name="body" rows={3} className="input" /></label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <button className="btn" disabled={pending || disabled}>{pending ? "Adding…" : "Add Task"}</button>
        <Result state={state} ok="Task added. The person it's for gets an email." />
        {disabled && <span className="text-sm text-slate-500">Turned off in the preview.</span>}
      </div>
    </form>
  );
}

/** Reply box under a listing's discussion. `team` posts as the signed-in team member, otherwise as the agent. */
export function CommentForm({ projectId, team, disabled, placeholder }: { projectId: string; team?: boolean; disabled?: boolean; placeholder?: string }) {
  const [state, action, pending] = useActionState<State, FormData>(team ? teamPostComment : agentPostComment, undefined);
  const ref = useResetOnOk(state);
  return (
    <form ref={ref} action={action} className="space-y-2">
      <input type="hidden" name="projectId" value={projectId} />
      <textarea name="body" required rows={3} maxLength={5000} className="input" aria-label="Message" placeholder={placeholder ?? "Write a message…"} />
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending || disabled}>{pending ? "Posting…" : "Post Message"}</button>
        <Result state={state} ok="Posted." />
        {disabled && <span className="text-sm text-slate-500">Turned off in the preview.</span>}
      </div>
    </form>
  );
}

/** The listing details a referral agent can edit. Changes save straight away and are logged for the DEAC team. */
export function AgentEditListingForm({ projectId, values, disabled }: { projectId: string; values: Record<string, FieldValue>; disabled?: boolean }) {
  const [state, action, pending] = useActionState<State, FormData>(agentEditListing, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      <div className="grid gap-3 sm:grid-cols-2">
        {AGENT_EDIT_FIELDS.map((f) => {
          const v = values[f.key];
          const wide = f.kind === "long" || f.key === "title";
          return (
            <label key={f.key} className={`block text-sm ${wide ? "sm:col-span-2" : ""}`}>
              <span className="mb-1 block font-medium text-slate-700">{f.label}{f.help && <span className="ml-1 font-normal text-slate-500">({f.help})</span>}</span>
              {f.kind === "long" ? <textarea name={f.key} defaultValue={v ?? ""} rows={f.key === "summary" ? 5 : 3} className="input" />
                : f.kind === "select" ? (
                  <select name={f.key} defaultValue={v ?? ""} className="input">
                    <option value="">—</option>
                    {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                )
                : f.kind === "money" ? <MoneyInput name={f.key} defaultValue={typeof v === "number" ? v : null} />
                : <input name={f.key} defaultValue={v ?? ""} inputMode={f.kind === "text" ? undefined : "decimal"} className="input" required={f.key === "title" || f.key === "mw"} />}
            </label>
          );
        })}
        <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-medium text-slate-700">Note for the DEAC team (optional)</span><input name="note" maxLength={1000} className="input" placeholder="e.g. Developer confirmed the new interconnection date" /></label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn" disabled={pending || disabled}>{pending ? "Saving…" : "Save Changes"}</button>
        <Result state={state} ok="Saved. Your DEAC partner has been told what changed." />
        {disabled && <span className="text-sm text-slate-500">Turned off in the preview.</span>}
      </div>
    </form>
  );
}
