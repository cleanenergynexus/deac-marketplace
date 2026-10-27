import { db } from "@/lib/db";
import { createProject } from "@/app/actions/admin";
import { NewListingTabs } from "@/components/NewListingTabs";
import { ProjectForm } from "@/components/ProjectForm";
import { PageHeader } from "@/components/ui";

export default async function NewProject({ searchParams }: { searchParams: Promise<{ developerId?: string }> }) {
  const { developerId } = await searchParams;
  const developers = await db.developer.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } });
  const developer = developers.find((d) => d.id === developerId);
  return (
    <div>
      <PageHeader title={developer ? `New project for ${developer.company}` : "New listing"} />
      <NewListingTabs active="manual" developer={developer} />
      <div className="card p-6"><ProjectForm developers={developers} developerId={developer?.id} action={createProject} /></div>
    </div>
  );
}
