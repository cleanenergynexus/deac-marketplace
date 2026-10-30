import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { agentCompanyWhere } from "@/lib/agents";
import { importerEnabled } from "@/lib/extract";
import { ImportWizard } from "@/components/ImportWizard";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
// Reading a long PDF can take a minute; give the server action room.
export const maxDuration = 300;

export default async function AgentImport({ searchParams }: { searchParams: Promise<{ developerId?: string }> }) {
  const me = await requireAgent();
  const { developerId } = await searchParams;
  const developers = await db.developer.findMany({ where: agentCompanyWhere(me.id), select: { id: true, company: true }, orderBy: { company: "asc" } });
  const developer = developers.find((d) => d.id === developerId);
  return (
    <div>
      <PageHeader title="Import a listing" subtitle="Paste a link to the project's web page, or upload its teaser or offering memo. Claude reads it and prefills the listing. You review it, and the DEAC team takes it from there." />
      <ImportWizard developers={developers} developerId={developer?.id} enabled={importerEnabled()} agent />
    </div>
  );
}
