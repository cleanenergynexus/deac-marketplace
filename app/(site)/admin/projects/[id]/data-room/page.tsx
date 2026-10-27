import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { docStage } from "@/lib/disclosure";
import { storageMode } from "@/lib/storage";
import { DataRoomExplorer } from "@/components/DataRoomExplorer";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProjectDataRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await db.project.findUnique({
    where: { id },
    select: {
      id: true, title: true, code: true,
      dataRoomFolders: { select: { id: true, parentId: true, name: true, updatedAt: true } },
      dataRoomFiles: { select: { id: true, folderId: true, name: true, size: true, contentType: true, updatedAt: true, uploadedBy: true, documents: { select: { access: true } } } },
    },
  });
  if (!p) notFound();
  const storage = storageMode();

  return (
    <div className="space-y-4">
      <Link href={`/admin/projects/${p.id}`} className="text-sm text-brand-600">← {p.title}</Link>
      <PageHeader title="Data room" subtitle={<>{p.code} · Every file for this project, organized in folders. Only the DEAC team sees this. Use <b>Share on listing</b> to release files to investors by tier.</>}
        action={<Link href={`/admin/projects/${p.id}#documents`} className="btn-ghost">Listing documents</Link>} />
      {storage === "missing" && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <b>File storage isn&apos;t connected yet.</b> In Vercel, open this project → Storage → Create → Blob, choose <b>Private</b> access, and connect it to the project. That adds <code>BLOB_READ_WRITE_TOKEN</code>; redeploy and uploads switch on. Folders already work.
        </div>
      )}
      {storage === "local" && <p className="text-xs text-slate-500">Development mode: files are saved in the local .data-room folder. Production uses the private Vercel Blob store.</p>}
      <DataRoomExplorer
        projectId={p.id}
        rootLabel={p.code}
        storage={storage}
        folders={p.dataRoomFolders.map((f) => ({ ...f, updatedAt: f.updatedAt.toISOString() }))}
        files={p.dataRoomFiles.map((f) => ({ id: f.id, folderId: f.folderId, name: f.name, size: f.size, contentType: f.contentType, uploadedBy: f.uploadedBy, updatedAt: f.updatedAt.toISOString(), shared: f.documents.length ? docStage(f.documents[0].access) : null }))}
      />
      <p className="text-xs text-slate-500">Tips: double-click to open, drag items onto a folder to move them, drag files or whole folders from your computer to upload, right-click for more. Keyboard: F2 rename, Delete, Ctrl+X / Ctrl+V to move, Backspace to go up.</p>
    </div>
  );
}
