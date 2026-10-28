"use client";
import { useActionState } from "react";
import { updateTeamMember } from "@/app/actions/admin";
import { STAFF_LEVELS } from "@/lib/tasks";

type Props = { id: string; staffLevel: string; managerId: string | null; managers: { id: string; name: string }[] };

/** Inline access level + "reports to" editor on the Team page. */
export function TeamMemberForm({ id, staffLevel, managerId, managers }: Props) {
  const [state, action, pending] = useActionState(updateTeamMember, undefined);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <select name="staffLevel" defaultValue={staffLevel} aria-label="Access level" className="input !w-32 py-1.5">
        {STAFF_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
      </select>
      <select name="managerId" defaultValue={managerId ?? ""} aria-label="Reports to" className="input !w-48 py-1.5">
        <option value="">No manager</option>
        {managers.filter((m) => m.id !== id).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <button className="btn-ghost py-1.5" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
      {state?.error && <span className="w-full text-xs text-red-600">{state.error}</span>}
      {state?.ok && !pending && <span className="text-xs text-emerald-700">Saved</span>}
    </form>
  );
}
