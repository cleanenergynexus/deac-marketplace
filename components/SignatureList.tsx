import Link from "next/link";
import { db } from "@/lib/db";
import { kindLabel, STATUS_LABEL, statusBadge } from "@/lib/esign";
import { Badge } from "@/components/ui";
import { date } from "@/lib/format";

/**
 * Signed and pending documents on a contact record (investor, developer contact or agent), with shortcuts to send
 * one for signature or file one that was signed elsewhere.
 */
export async function SignatureList({ signer, compact }: { signer: string; compact?: boolean }) {
  const [type, id] = signer.split(":");
  const where = type === "INVESTOR" ? { investorId: id } : type === "CONTACT" ? { contactId: id } : { agentId: id };
  const rows = await db.signatureRequest.findMany({ where: { ...where, isTemplate: false }, include: { project: { select: { code: true } } }, orderBy: { updatedAt: "desc" }, take: 30 });
  const q = `signer=${encodeURIComponent(signer)}`;
  return (
    <div className="space-y-2 text-sm">
      {rows.length ? (
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 py-1.5">
              <span className="min-w-0">
                <Link href={`/admin/signatures/${r.id}`} className="block truncate font-medium text-brand-600">{r.title}</Link>
                <span className="text-xs text-slate-500">{kindLabel(r.kind)}{r.project ? ` · ${r.project.code}` : ""} · {date(r.signedAt ?? r.sentAt ?? r.createdAt)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {r.status === "SIGNED" && <a href={`/api/esign/${r.id}?file=signed`} target="_blank" className="text-xs text-brand-600">Open</a>}
                <Badge tone={statusBadge(r.status)}>{r.source === "UPLOADED" ? "Filed" : STATUS_LABEL[r.status] ?? r.status}</Badge>
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="text-xs text-slate-500">No NDAs or contracts on file yet.</p>}
      <div className={`flex gap-2 ${compact ? "flex-col" : "flex-wrap"}`}>
        <Link href={`/admin/signatures/new?${q}`} className="btn flex-1 py-1.5 text-center">Send for signature</Link>
        <Link href={`/admin/signatures/upload?${q}`} className="btn-ghost flex-1 py-1.5 text-center">Upload signed</Link>
      </div>
    </div>
  );
}
