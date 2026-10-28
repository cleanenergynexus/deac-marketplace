"use client";
import { assignTask } from "@/app/actions/contacts";

export type Assignee = { id: string; name: string };

/** Who a task is assigned to. Saves as soon as someone is picked. */
export function AssigneeSelect({ taskId, assigneeId, options, allowUnassigned, className = "" }: { taskId: string; assigneeId: string | null; options: Assignee[]; allowUnassigned: boolean; className?: string }) {
  // Keep the current assignee in the list even if this person couldn't otherwise pick them.
  return (
    <form action={assignTask}>
      <input type="hidden" name="id" value={taskId} />
      <select name="assigneeId" defaultValue={assigneeId ?? ""} key={assigneeId ?? ""} aria-label="Assigned to" onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`input py-0.5 text-xs ${className}`}>
        {(allowUnassigned || !assigneeId) && <option value="" disabled={!allowUnassigned}>Unassigned</option>}
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </form>
  );
}
