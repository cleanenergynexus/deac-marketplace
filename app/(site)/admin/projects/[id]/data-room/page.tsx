import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { dataRoomProjectId, listingGroup } from "@/lib/listing-links-db";
import { dealShort } from "@/lib/listing-links";
import { db } from "@/lib/db";
import { docStage } from "@/lib/disclosure";
import { blobUploadMethod, storageMode } from "@/lib/storage";
import { DataRoomExplorer } from "@/components/DataRoomExplorer";
import { PageHeader, Section } from "@/components/ui";
import { WizardDocList } from "@/components/WizardDocList";

export const dynamic = "force-dynamic";

export default async function ProjectDataRoom({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ listing?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  // Linked listings (Sale / Lease / Financing of one project) share the original listing's data room.
  const root = await dataRoomProjectId(id);
  if (root !== id) redirect(`/admin/projects/${root}/data-room?listing=${id}`);
  const p = await db.project.findUnique({
    where: { id },
    select: {
      id: true, title: true, code: true,
      dataRoomFolders: { select: { id: true, parentId: true, name: true, updatedAt: true } },
      dataRoomFiles: { select: { id: true, folderId: true, name: true, size: true, contentType: true, updatedAt: true, uploadedBy: true, documents: { select: { access: true, projectId: true } } } },
      wizardDocs: { orderBy: { updatedAt: "desc" }, take: 5, select: { id: true, kind: true, title: true, status: true, updatedAt: true, createdBy: true, savedAt: true } },
    },
  });
  if (!p) notFound();
  const storage = storageMode();
  // Linked listings (Sale / Lease / Financing of this project) share this data room; each picks its own files to show investors.
  const group = await listingGroup(p.id);
  const listing = group.find((g) => g.id === sp.listing) ?? group.find((g) => g.id === p.id) ?? { id: p.id, code: p.code, title: p.title, dealType: "" };
  const sharedOn = (docs: { access: string; projectId: string }[]) => docs.find((d) => d.projectId === listing.id);

  return (
    <div className="space-y-4">
      <Link href={`/admin/projects/${listing.id}`} className="text-sm text-brand-600">← {listing.title}</Link>
      <PageHeader title="Data Room" subtitle={<>{p.code} · Every file for this project, organized in folders. Only the DEAC team opens these files (referral agents can add files but not open them). Use <b>Share on listing</b> to release the entire data room, whole folders or single files to investors by tier.</>}
        action={<div className="flex flex-wrap gap-2"><Link href={`/admin/projects/${p.id}/data-room/wizard`} className="btn">✨ Document Wizard</Link><Link href={`/admin/projects/${listing.id}#documents`} className="btn-ghost">Listing documents</Link></div>} />
      {group.length > 1 && (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm">
          <p className="mb-2">🔗 <b>Shared data room.</b> This project is listed {group.length} ways and they all use these files. Upload once; each listing picks which files its investors see.</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-600">Share and remove files on:</span>
            {group.map((g) => (
              <Link key={g.id} href={`/admin/projects/${p.id}/data-room?listing=${g.id}`}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${g.id === listing.id ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
                {dealShort(g.dealType)} · {g.code}
              </Link>
            ))}
          </div>
        </div>
      )}
      {storage === "missing" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <b>File storage isn&apos;t connected yet.</b> In Vercel, open this project → Storage → Create → Blob, choose <b>Private</b> access, and connect it to the project. That adds <code>BLOB_STORE_ID</code> or <code>BLOB_READ_WRITE_TOKEN</code> to the project&apos;s environment variables (Production). Then redeploy (Deployments → ⋯ → Redeploy) and uploads switch on. Folders already work.
        </div>
      )}
      {storage === "local" && <p className="text-xs text-slate-500">Development mode: files are saved in the local .data-room folder. Production uses the private Vercel Blob store.</p>}
      <DataRoomExplorer
        key={listing.id}
        projectId={p.id}
        listingId={listing.id}
        rootLabel={p.code}
        storage={storage}
        uploadMethod={blobUploadMethod()}
        folders={p.dataRoomFolders.map((f) => ({ ...f, updatedAt: f.updatedAt.toISOString() }))}
        files={p.dataRoomFiles.map((f) => ({ id: f.id, folderId: f.folderId, name: f.name, size: f.size, contentType: f.contentType, uploadedBy: f.uploadedBy, updatedAt: f.updatedAt.toISOString(), shared: sharedOn(f.documents) ? docStage(sharedOn(f.documents)!.access) : null }))}
      />
      {p.wizardDocs.length > 0 && (
        <Section title="Document Wizard Drafts" action={<Link href={`/admin/projects/${p.id}/data-room/wizard`} className="text-sm text-brand-600">New document →</Link>}>
          <WizardDocList projectId={p.id} docs={p.wizardDocs} />
        </Section>
      )}
      <p className="text-xs text-slate-500">Tips: double-click to open, drag items onto a folder to move them, drag files or whole folders from your computer to upload, right-click for more. Keyboard: F2 rename, Delete, Ctrl+X / Ctrl+V to move, Backspace to go up.</p>
    </div>
  );
}
