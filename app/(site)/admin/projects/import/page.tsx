import { db } from "@/lib/db";
import { importerEnabled } from "@/lib/extract";
import { ImportWizard } from "@/components/ImportWizard";
import { NewListingTabs } from "@/components/NewListingTabs";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
// Reading a long PDF can take a minute; give the server action room.
export const maxDuration = 300;

export default async function ImportProject({ searchParams }: { searchParams: Promise<{ developerId?: string }> }) {
  const { developerId } = await searchParams;
  const developers = await db.developer.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } });
  const developer = developers.find((d) => d.id === developerId);
  return (
    <div>
      <PageHeader title={developer ? `Import a project for ${developer.company}` : "Import a project"} subtitle="Paste a link to a listing web page, or upload a teaser or offering memo. Claude reads it and prefills the listing for you to review." />
      <NewListingTabs active="import" developer={developer} />
      <ImportWizard developers={developers} developerId={developer?.id} enabled={importerEnabled()} />
    </div>
  );
}
