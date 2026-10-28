import { createDeveloper } from "@/app/actions/admin";
import { DeveloperForm } from "@/components/DeveloperForm";
import { PageHeader } from "@/components/ui";
import { allStages } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";

export const dynamic = "force-dynamic";

export default async function NewDeveloper() {
  const stages = allStages(await getPipeline());
  return (<div><PageHeader title="Add company" subtitle="A development company and its first contact. Add more contacts on the company page." /><div className="card p-6"><DeveloperForm action={createDeveloper} stages={stages} /></div></div>);
}
