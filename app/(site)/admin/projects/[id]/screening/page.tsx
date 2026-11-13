import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dataRoomProjectId } from "@/lib/listing-links-db";
import { db } from "@/lib/db";
import { importerEnabled } from "@/lib/extract";
import { storageMode } from "@/lib/storage";
import { fileUrl } from "@/lib/dataroom";
import { getScreeningTemplate } from "@/lib/screening-db";
import { effectiveRunStatus, parseAnswers, questionsFor, type Decision, type RunStatus, type ScreeningOptions } from "@/lib/screening";
import { ScreeningWorkspace } from "@/components/ScreeningWorkspace";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
// Claude researches the project after the start action responds; that work shares this time limit.
export const maxDuration = 300;

export default async function ProjectScreeningPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Linked listings (Sale / Lease / Financing of one project) share the original listing's data room.
  const root = await dataRoomProjectId(id);
  if (root !== id) redirect(`/admin/projects/${root}/screening`);
  const [p, template] = await Promise.all([
    db.project.findUnique({
      where: { id },
      select: {
        id: true, code: true, title: true, country: true, developerId: true,
        developer: { select: { company: true, contactName: true, email: true } },
        contact: { select: { name: true, email: true } },
        dataRoomFolders: { select: { id: true, parentId: true, name: true } },
        dataRoomFiles: { select: { id: true, folderId: true, name: true, size: true } },
        screening: true,
      },
    }),
    getScreeningTemplate(),
  ]);
  if (!p) notFound();
  const s = p.screening;
  const status: RunStatus = s ? effectiveRunStatus(s.status, s.startedAt ?? s.updatedAt) : "IDLE";
  const options: ScreeningOptions = s ? { webResearch: false, notes: "", ...JSON.parse(s.options) } : { webResearch: true, notes: "" };
  const savedFile = s?.fileId ? await db.dataRoomFile.findFirst({ where: { id: s.fileId, projectId: p.id }, select: { id: true } }) : null;
  const sponsor = p.contact?.email ? p.contact : { name: p.developer.contactName, email: p.developer.email };

  return (
    <div className="space-y-4">
      <Link href={`/admin/projects/${p.id}`} className="text-sm text-brand-600">← {p.title}</Link>
      <PageHeader
        title="Project Screening"
        subtitle={<>{p.code} · {p.title} · <Link href={`/admin/developers/${p.developerId}`} className="text-brand-600">{p.developer.company}</Link>. Qualify the project against the <Link href="/admin/screening/template" className="text-brand-600">screening template</Link>: let Claude pre-research it, confirm or correct each answer, then send the sponsor only the questions that are still open.</>}
        action={<Link href={`/admin/projects/${p.id}/data-room`} className="btn-ghost">📁 Data room{p.dataRoomFiles.length ? ` (${p.dataRoomFiles.length})` : ""}</Link>}
      />
      <ScreeningWorkspace
        projectId={p.id} code={p.code} title={p.title} country={p.country}
        categories={questionsFor(template, p.country)}
        answers={parseAnswers(s?.answers)}
        run={{ status, error: s?.error ?? null, ranAt: s?.ranAt?.toISOString() ?? null, ranBy: s?.ranBy ?? null, options, sourceIds: s ? JSON.parse(s.sourceIds) : [] }}
        summary={s?.summary ?? ""} redFlags={s ? JSON.parse(s.redFlags) : []}
        researchNotes={s?.researchNotes ?? ""} webSources={s ? JSON.parse(s.webSources) : []} sourceNotes={s ? JSON.parse(s.sourceNotes) : []}
        decision={(s?.decision ?? "") as Decision} decisionNote={s?.decisionNote ?? ""}
        saved={savedFile && s?.savedAt ? { url: fileUrl(savedFile.id), at: s.savedAt.toISOString() } : null}
        folders={p.dataRoomFolders} files={p.dataRoomFiles}
        sponsorEmail={sponsor.email || null} sponsorName={sponsor.name || null}
        aiEnabled={importerEnabled()} storageReady={storageMode() !== "missing"}
      />
    </div>
  );
}
