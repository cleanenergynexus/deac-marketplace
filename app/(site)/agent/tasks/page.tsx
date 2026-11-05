import { requireAgent } from "@/lib/auth";
import { agentTasks, getPartner } from "@/lib/agent-portal";
import { taskState } from "@/lib/crm";
import { AgentTaskList } from "@/components/AgentTaskList";
import { PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

/** Tasks the DEAC team assigned to this referral agent. */
export default async function AgentTasksPage() {
  const me = await requireAgent();
  const [{ open, done, can }, partner] = await Promise.all([agentTasks(me.id), getPartner(me.partnerId)]);
  const overdue = open.filter((t) => taskState(t) === "overdue").length;
  return (
    <div className="space-y-6">
      <PageHeader title="My Tasks" subtitle={`Tasks the DEAC team assigned to you. Tick one off when it's done${partner ? ` and ${partner.name} is notified` : ""}.`} />
      <Section title={`Outstanding (${open.length})${overdue ? ` · ${overdue} overdue` : ""}`}>
        <AgentTaskList tasks={open} can={can} empty="Nothing outstanding. New tasks from the DEAC team show up here, and you get an email for each one." />
      </Section>
      {done.length > 0 && (
        <Section title="Recently Completed">
          <AgentTaskList tasks={done} can={can} />
        </Section>
      )}
    </div>
  );
}
