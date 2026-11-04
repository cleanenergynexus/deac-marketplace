import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { listingOptions, loadSignerOptions } from "@/lib/esign-db";
import { NewEnvelopeForm } from "@/components/NewEnvelopeForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewSignature({ searchParams }: { searchParams: Promise<{ template?: string; projectId?: string; signer?: string; kind?: string; templateId?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const asTemplate = !!sp.template;
  const [listings, files, folders, templates, signers] = await Promise.all([
    listingOptions(),
    db.dataRoomFile.findMany({ where: { OR: [{ contentType: "application/pdf" }, { name: { endsWith: ".pdf", mode: "insensitive" } }] }, select: { id: true, name: true, projectId: true, folderId: true }, orderBy: { name: "asc" } }),
    db.dataRoomFolder.findMany({ select: { id: true, name: true } }),
    db.signatureRequest.findMany({ where: { isTemplate: true }, include: { project: { select: { code: true } } }, orderBy: { title: "asc" } }),
    asTemplate ? Promise.resolve([]) : loadSignerOptions(),
  ]);
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  return (
    <div>
      <PageHeader
        title={asTemplate ? "New Template" : "Send a Document for Signature"}
        subtitle={asTemplate ? "Upload the PDF once, place the fields, and reuse it for every signer." : "Choose the PDF, then place where the signer signs and fills in their details."}
        action={<Link href="/admin/signatures" className="btn-ghost">Back</Link>}
      />
      <NewEnvelopeForm
        asTemplate={asTemplate}
        listings={listings}
        pdfs={files.map((f) => ({ id: f.id, name: f.name, projectId: f.projectId, folder: f.folderId ? folderName.get(f.folderId) ?? "" : "" }))}
        templates={templates.map((t) => ({ id: t.id, title: t.title, kind: t.kind, project: t.project?.code ?? null }))}
        signers={signers}
        initial={{ projectId: sp.projectId, signer: sp.signer, kind: sp.kind, templateId: sp.templateId }}
      />
    </div>
  );
}
