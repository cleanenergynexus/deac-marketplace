import { Field } from "@/components/ui";

export type AgentOption = { id: string; name: string; company: string | null };

/** "Referred by" picker on CRM forms. The chosen referral agent sees this record (read-only) in their portal. */
export function ReferredBySelect({ agents, value, className }: { agents: AgentOption[]; value?: string | null; className?: string }) {
  return (
    <Field label="Referred by agent" className={className}>
      <select name="referredById" defaultValue={value ?? ""} className="input">
        <option value="">No referral agent</option>
        {agents.map((a) => <option key={a.id} value={a.id}>{a.name}{a.company ? ` (${a.company})` : ""}</option>)}
      </select>
    </Field>
  );
}
