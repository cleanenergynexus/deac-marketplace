import { db } from "@/lib/db";
import { importerEnabled } from "@/lib/extract";
import { ImportWizard } from "@/components/ImportWizard";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
// Reading a long PDF can take a minute; give the server action room.
export const maxDuration = 300;

export default async function ImportProject() {
  const developers = await db.developer.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } });
  return (
    <div>
      <PageHeader title="Import project from a document" subtitle="Upload a teaser or offering memo. Claude reads it and prefills the listing for you to review." />
      <ImportWizard developers={developers} enabled={importerEnabled()} />
    </div>
  );
}
