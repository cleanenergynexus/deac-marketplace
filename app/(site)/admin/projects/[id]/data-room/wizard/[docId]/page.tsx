import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fileUrl } from "@/lib/dataroom";
import { storageMode } from "@/lib/storage";
import { KIND_INFO, effectiveStatus, type WizardKind, type WizardOptions } from "@/lib/wizard";
import { WizardDocEditor } from "@/components/WizardDocEditor";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // "Write again" runs Claude after the action responds

export default async function WizardDocPage({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  const d = await db.wizardDocument.findFirst({ where: { id: docId, projectId: id }, include: { project: { select: { code: true, title: true } } } });
  if (!d) notFound();
  const saved = await db.dataRoomFile.findMany({ where: { projectId: id, id: { in: [d.fileId, d.pptxFileId].filter((x): x is string => !!x) } }, select: { id: true, name: true, folderId: true } });
  const sourceFiles = await db.dataRoomFile.findMany({ where: { projectId: id, id: { in: JSON.parse(d.sourceIds) as string[] } }, select: { id: true, name: true } });
  const kind = d.kind as WizardKind;
  const options = JSON.parse(d.options) as WizardOptions;

  return (
    <div className="space-y-4">
      <Link href={`/admin/projects/${id}/data-room/wizard`} className="text-sm text-brand-600">← Document Wizard</Link>
      <PageHeader title={d.title} subtitle={<>{KIND_INFO[kind]?.label} · {d.project.code} · {d.project.title}</>} />
      <WizardDocEditor
        doc={{
          id: d.id, projectId: id, kind, title: d.title, markdown: d.markdown, error: d.error,
          status: effectiveStatus(d.status, d.updatedAt),
          options,
          sourceNotes: JSON.parse(d.sourceNotes),
          sourceCount: sourceFiles.length,
          webSources: JSON.parse(d.webSources),
          savedAt: d.savedAt?.toISOString() ?? null,
          saved: saved.map((f) => ({ name: f.name, url: fileUrl(f.id) })),
        }}
        storageReady={storageMode() !== "missing"}
      />
    </div>
  );
}
