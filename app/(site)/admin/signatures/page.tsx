import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { signerHref } from "@/lib/esign-db";
import { kindLabel, SIGNER_LABEL, STATUS_LABEL, statusBadge, type SignerType } from "@/lib/esign";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteEnvelope } from "@/app/actions/esign";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "", label: "All" },
  { key: "open", label: "Waiting for signature" },
  { key: "SIGNED", label: "Signed" },
  { key: "DRAFT", label: "Drafts" },
  { key: "closed", label: "Declined & voided" },
] as const;

/** E-signatures: every document sent for signature or filed as signed, and the reusable templates. */
export default async function Signatures({ searchParams }: { searchParams: Promise<{ tab?: string; status?: string; q?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const templates = sp.tab === "templates";
  const statusWhere = sp.status === "open" ? { in: ["SENT", "VIEWED"] } : sp.status === "closed" ? { in: ["DECLINED", "VOIDED"] } : sp.status ? sp.status : undefined;
  const q = sp.q?.trim();
  const rows = await db.signatureRequest.findMany({
    where: {
      isTemplate: templates,
      ...(statusWhere && !templates ? { status: statusWhere } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" as const } }, { signerName: { contains: q, mode: "insensitive" as const } }, { signerEmail: { contains: q, mode: "insensitive" as const } }, { signerCompany: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    include: { project: { select: { code: true } } },
    orderBy: { updatedAt: "desc" },
    take: 300,
  });
  const open = await db.signatureRequest.count({ where: { status: { in: ["SENT", "VIEWED"] } } });
  return (
    <div className="space-y-5">
      <PageHeader
        title="E-signatures"
        subtitle="Send NDAs, LOIs and contracts for electronic signature, or file documents signed elsewhere on a contact's record. Signed copies get a signing certificate and go to the listing's data room."
        action={<div className="flex flex-wrap gap-2">
          <Link href="/admin/signatures/upload" className="btn-ghost">Upload signed document</Link>
          <Link href="/admin/signatures/new?template=1" className="btn-ghost">New template</Link>
          <Link href="/admin/signatures/new" className="btn">Send a document</Link>
        </div>}
      />
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200">
        <Link href="/admin/signatures" className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${!templates ? "border-brand-600 text-brand-700" : "border-transparent text-slate-600"}`}>Documents{open ? <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs text-amber-800">{open}</span> : null}</Link>
        <Link href="/admin/signatures?tab=templates" className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${templates ? "border-brand-600 text-brand-700" : "border-transparent text-slate-600"}`}>Templates</Link>
        <form className="ml-auto pb-2">
          {templates && <input type="hidden" name="tab" value="templates" />}
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <input name="q" defaultValue={q} placeholder="Search title or signer" className="input py-1.5 text-sm" />
        </form>
      </div>
      {!templates && (
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link key={f.key} href={`/admin/signatures${f.key ? `?status=${f.key}` : ""}`} className={`rounded-full px-3 py-1 text-xs font-medium ${(sp.status ?? "") === f.key ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>{f.label}</Link>
          ))}
        </div>
      )}
      <div className="card overflow-x-auto">
        {rows.length ? (
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr>
              <th className="th">Document</th>
              {templates ? <><th className="th">Listing</th><th className="th">Fields</th><th className="th">Listing NDA</th><th className="th"></th></> : <><th className="th">Signer</th><th className="th">Listing</th><th className="th">Status</th><th className="th">Sent</th><th className="th">Signed</th></>}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">{rows.map((r) => {
              const href = signerHref(r);
              return (
                <tr key={r.id}>
                  <td className="td"><Link href={`/admin/signatures/${r.id}`} className="font-medium text-brand-600">{r.title}</Link><div className="text-xs text-slate-500">{kindLabel(r.kind)}{r.source === "UPLOADED" ? " · uploaded signed copy" : ""}</div></td>
                  {templates ? (
                    <>
                      <td className="td text-sm">{r.project?.code ?? <span className="text-slate-400">Any</span>}</td>
                      <td className="td text-sm">{(JSON.parse(r.fields) as unknown[]).length}</td>
                      <td className="td">{r.listingNda ? <Badge tone="green">On</Badge> : <span className="text-xs text-slate-400">—</span>}</td>
                      <td className="td text-right">
                        <span className="inline-flex items-center gap-3">
                          <Link href={`/admin/signatures/new?templateId=${r.id}`} className="text-sm font-medium text-brand-600">Send</Link>
                          <form action={deleteEnvelope}><input type="hidden" name="id" value={r.id} /><ConfirmButton message={`Delete the template "${r.title}"? Documents already sent from it are kept.`} className="text-sm text-red-600 hover:underline">Delete</ConfirmButton></form>
                        </span>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="td text-sm">{r.signerName ? (href ? <Link href={href} className="text-brand-600">{r.signerName}</Link> : r.signerName) : <span className="text-slate-400">Not chosen</span>}<div className="text-xs text-slate-500">{r.signerType ? SIGNER_LABEL[r.signerType as SignerType] : ""}{r.signerCompany ? ` · ${r.signerCompany}` : ""}</div></td>
                      <td className="td text-sm">{r.project?.code ?? <span className="text-slate-400">—</span>}</td>
                      <td className="td"><Badge tone={statusBadge(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge></td>
                      <td className="td text-xs">{date(r.sentAt)}</td>
                      <td className="td text-xs">{date(r.signedAt)}</td>
                    </>
                  )}
                </tr>
              );
            })}</tbody>
          </table>
        ) : <div className="p-5"><Empty>{templates ? <>No templates yet. A template is a PDF with the fields already placed, ready to send to anyone. <Link href="/admin/signatures/new?template=1" className="text-brand-600">Create one</Link>.</> : <>Nothing here yet. <Link href="/admin/signatures/new" className="text-brand-600">Send a document</Link> for signature.</>}</Empty></div>}
      </div>
    </div>
  );
}
