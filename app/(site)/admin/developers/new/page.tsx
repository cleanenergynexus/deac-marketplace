import { createDeveloper } from "@/app/actions/admin";
import { DeveloperForm } from "@/components/DeveloperForm";
import { getAgents } from "@/lib/agents-db";
import { PageHeader } from "@/components/ui";
import { allStages } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";

export const dynamic = "force-dynamic";

export default async function NewDeveloper() {
  const [pipeline, agents] = await Promise.all([getPipeline(), getAgents()]);
  const stages = allStages(pipeline);
  return (<div><PageHeader title="Add company" subtitle="A development company and its first contact. Add more contacts on the company page." /><div className="card p-6"><DeveloperForm action={createDeveloper} stages={stages} agents={agents} /></div></div>);
}
