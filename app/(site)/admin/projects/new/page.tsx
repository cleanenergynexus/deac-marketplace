import { db } from "@/lib/db";
import { createProject } from "@/app/actions/admin";
import { ProjectForm } from "@/components/ProjectForm";
import { PageHeader } from "@/components/ui";

export default async function NewProject({ searchParams }: { searchParams: Promise<{ developerId?: string }> }) {
  const { developerId } = await searchParams;
  const developers = await db.developer.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } });
  return (<div><PageHeader title="New listing" /><div className="card p-6"><ProjectForm developers={developers} developerId={developerId} action={createProject} /></div></div>);
}
