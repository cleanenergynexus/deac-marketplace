import type { AssigneeOption } from "@/lib/tasks";

/** The <option>s of an "Assign to" menu: team members first, then referral agents in their own group. */
export function AssigneeOptions({ options, me }: { options: AssigneeOption[]; me?: string }) {
  const team = options.filter((o) => !o.agent);
  const agents = options.filter((o) => o.agent);
  const item = (o: AssigneeOption) => <option key={o.id} value={o.id}>{o.id === me ? `${o.name} (me)` : o.name}</option>;
  if (!agents.length) return <>{team.map(item)}</>;
  return (
    <>
      {team.length > 0 && <optgroup label="Team">{team.map(item)}</optgroup>}
      <optgroup label="Referral Agents">{agents.map(item)}</optgroup>
    </>
  );
}
