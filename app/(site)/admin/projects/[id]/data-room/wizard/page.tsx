import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { importerEnabled } from "@/lib/extract";
import { DocumentWizard } from "@/components/DocumentWizard";
import { WizardDocList } from "@/components/WizardDocList";
import { PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";
// Claude writes the document after this page's action responds; that work shares this time limit.
export const maxDuration = 300;

export default async function WizardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.project.findUnique({
    where: { id },
    select: {
      id: true, title: true, code: true,
      dataRoomFolders: { select: { id: true, parentId: true, name: true } },
      dataRoomFiles: { select: { id: true, folderId: true, name: true, size: true } },
      wizardDocs: { orderBy: { updatedAt: "desc" }, select: { id: true, kind: true, title: true, status: true, updatedAt: true, createdBy: true, savedAt: true, fileId: true, pptxFileId: true } },
    },
  });
  if (!p) notFound();
  const generatedIds = p.wizardDocs.flatMap((d) => [d.fileId, d.pptxFileId]).filter((x): x is string => !!x);

  return (
    <div className="space-y-4">
      <Link href={`/admin/projects/${p.id}/data-room`} className="text-sm text-brand-600">← Data room</Link>
      <PageHeader title="Document Wizard" subtitle={<>{p.code} · {p.title}. Claude reads the files you pick from this data room (and, if you want, the web) and writes a first draft. You review and edit it, then save it into the data room as a PDF.</>} />
      <DocumentWizard projectId={p.id} code={p.code} folders={p.dataRoomFolders} files={p.dataRoomFiles} generatedIds={generatedIds} enabled={importerEnabled()} />
      <Section title="Drafts for this project">
        <WizardDocList projectId={p.id} docs={p.wizardDocs} />
      </Section>
    </div>
  );
}
