import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { deleteEnvelope, voidRequest } from "@/app/actions/esign";
import { listingOptions, loadSignerOptions, signerHref, signerRef } from "@/lib/esign-db";
import { isOpen, kindLabel, parseFields, SIGNER_LABEL, STATUS_LABEL, statusBadge, type SignerType } from "@/lib/esign";
import { SignFieldEditor } from "@/components/SignFieldEditor";
import { RenewLinkPanel, SendPanel } from "@/components/SignerPicker";
import { ConfirmButton } from "@/components/ConfirmButton";
import { LocalTime } from "@/components/LocalTime";
import { Badge, PageHeader, Section } from "@/components/ui";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SignatureRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const r = await db.signatureRequest.findUnique({ where: { id }, include: { project: { select: { id: true, code: true, title: true } }, events: { orderBy: { createdAt: "asc" } } } });
  if (!r) notFound();
  const editable = r.isTemplate || r.status === "DRAFT";
  const [listings, signers, sentFrom] = await Promise.all([
    listingOptions(),
    editable ? loadSignerOptions() : Promise.resolve([]),
    r.isTemplate ? db.signatureRequest.groupBy({ by: ["status"], where: { templateId: r.id }, _count: true }) : Promise.resolve([]),
  ]);
  const fields = parseFields(r.fields, r.pageCount);
  const href = signerHref(r);
  const uploaded = r.source === "UPLOADED";
  const pdfUrl = `/api/esign/${r.id}?file=${r.status === "SIGNED" ? "signed" : "original"}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title={r.title}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge tone={statusBadge(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
          <span>{kindLabel(r.kind)}{r.project ? <> · <Link href={`/admin/projects/${r.project.id}`} className="text-brand-600">{r.project.code}</Link></> : null}{uploaded ? " · uploaded signed copy" : ` · ${r.pageCount} page${r.pageCount === 1 ? "" : "s"}`}</span>
        </span>}
        action={<Link href={r.isTemplate ? "/admin/signatures?tab=templates" : "/admin/signatures"} className="btn-ghost">All {r.isTemplate ? "templates" : "documents"}</Link>}
      />

      {editable && (
        <Section title={r.isTemplate ? "Send this template" : "Send for signature"}>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="space-y-2 text-sm text-slate-600">
              <p>Place the fields on the document below (they save on their own), then choose who signs. Each signer gets a personal link by email{r.isTemplate ? " and their own copy" : ""}; investors also see it in My Portal.</p>
              <p>The signer sees their details prefilled from their record, fills in anything missing, signs and clicks <b>I Agree</b>. The signed PDF gets a signing certificate and is saved {r.projectId ? "to this listing's data room, under Signed Documents" : "on the request"}.</p>
              {r.isTemplate && sentFrom.length > 0 && <p className="text-xs">Sent from this template: {sentFrom.map((g) => `${g._count} ${(STATUS_LABEL[g.status] ?? g.status).toLowerCase()}`).join(", ")}.</p>}
              <form action={deleteEnvelope}><input type="hidden" name="id" value={r.id} /><ConfirmButton message={r.isTemplate ? `Delete the template "${r.title}"? Documents already sent from it are kept.` : "Delete this draft?"} className="btn-danger">Delete {r.isTemplate ? "template" : "draft"}</ConfirmButton></form>
            </div>
            <SendPanel id={r.id} options={signers} initial={r.isTemplate ? [] : [signerRef(r)].filter(Boolean)} isTemplate={r.isTemplate} />
          </div>
        </Section>
      )}

      {!editable && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Section title="Audit trail">
            <ol className="space-y-3">
              {r.events.map((e) => (
                <li key={e.id} className="text-sm">
                  <div className="flex flex-wrap items-baseline gap-2"><Badge tone={e.action === "SIGNED" || e.action === "UNLOCKED" ? "green" : e.action === "DECLINED" || e.action === "VOIDED" ? "red" : "slate"}>{e.action.replace("_", " ")}</Badge><span className="text-slate-800">{e.detail}</span></div>
                  <div className="mt-0.5 text-xs text-slate-500"><LocalTime value={e.createdAt} />{e.by ? ` · ${e.by}` : ""}{e.ip ? ` · IP ${e.ip}` : ""}{e.userAgent ? ` · ${e.userAgent.slice(0, 90)}` : ""}</div>
                </li>
              ))}
            </ol>
            {r.declineReason && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-800">Reason given: {r.declineReason}</p>}
          </Section>
          <aside className="space-y-4">
            <div className="card space-y-2 p-4 text-sm">
              <h2 className="font-semibold">Signer</h2>
              <div>{href ? <Link href={href} className="font-medium text-brand-600">{r.signerName}</Link> : r.signerName}</div>
              <div className="text-xs text-slate-500">{r.signerType ? SIGNER_LABEL[r.signerType as SignerType] : ""}{r.signerCompany ? ` · ${r.signerCompany}` : ""}</div>
              <div className="text-xs text-slate-500">{r.signerEmail}</div>
              <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
                {!uploaded && <><dt className="text-slate-500">Sent</dt><dd>{date(r.sentAt)}{r.createdBy ? ` by ${r.createdBy}` : ""}</dd></>}
                {!uploaded && <><dt className="text-slate-500">Viewed</dt><dd>{date(r.viewedAt)}</dd></>}
                <dt className="text-slate-500">Signed</dt><dd>{date(r.signedAt)}</dd>
                {r.status === "SIGNED" && <><dt className="text-slate-500">Effect</dt><dd>{(r.kind === "NDA" || r.kind === "LOI") && r.investorId ? (r.autoApprove ? "Unlocked" : "Sent for review") : "Filed"}</dd></>}
              </dl>
            </div>
            {r.status === "SIGNED" && (
              <div className="card space-y-2 p-4 text-sm">
                <h2 className="font-semibold">Signed copy</h2>
                <a href={`/api/esign/${r.id}?file=signed`} target="_blank" className="btn w-full">Open signed {r.signedType === "application/pdf" ? "PDF" : "file"}</a>
                <a href={`/api/esign/${r.id}?file=signed&download`} className="btn-ghost w-full py-1.5">Download</a>
                {r.signedFileId && r.projectId && <Link href={`/admin/projects/${r.projectId}/data-room`} className="block text-xs text-brand-600">In the data room → Signed Documents</Link>}
                {r.signedHash && <p className="break-all text-[11px] text-slate-500">SHA-256 {r.signedHash}</p>}
                {r.message && uploaded && <p className="text-xs text-slate-600">{r.message}</p>}
              </div>
            )}
            {isOpen(r.status) && (
              <div className="card space-y-3 p-4">
                <h2 className="font-semibold">Waiting for signature</h2>
                <RenewLinkPanel id={r.id} />
                <form action={voidRequest} className="space-y-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="reason" className="input py-1.5 text-sm" placeholder="Reason (optional)" />
                  <ConfirmButton message="Void this request? The signing link stops working." className="btn-danger w-full">Void request</ConfirmButton>
                </form>
              </div>
            )}
            {(r.status === "DECLINED" || r.status === "VOIDED") && (
              <div className="card space-y-2 p-4 text-sm">
                <Link href={`/admin/signatures/new?signer=${encodeURIComponent(signerRef(r))}${r.templateId ? `&templateId=${r.templateId}` : ""}`} className="btn w-full">Send a new one</Link>
                <form action={deleteEnvelope}><input type="hidden" name="id" value={r.id} /><ConfirmButton message="Delete this request and its audit trail?" className="text-xs text-red-600">Delete</ConfirmButton></form>
              </div>
            )}
          </aside>
        </div>
      )}

      {!(uploaded && r.signedType !== "application/pdf") && (
        <SignFieldEditor
          id={r.id}
          pdfUrl={pdfUrl}
          initial={r.status === "SIGNED" ? [] : fields}
          locked={!editable}
          isTemplate={r.isTemplate}
          projects={listings}
          settings={{ title: r.title, kind: r.kind, projectId: r.projectId ?? "", message: r.message ?? "", autoApprove: r.autoApprove, listingNda: r.listingNda }}
        />
      )}
    </div>
  );
}
