import Link from "next/link";
import { db } from "@/lib/db";
import { reviewLoi } from "@/app/actions/admin";
import { Badge, PageHeader, Empty, statusTone } from "@/components/ui";
import { usd, date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Lois() {
  const lois = await db.loi.findMany({ include: { investor: true, project: true }, orderBy: [{ status: "desc" }, { createdAt: "desc" }] });
  return (
    <div>
      <PageHeader title="Letters of interest" subtitle="Approving an LOI unlocks that project's data room for the investor and emails them." />
      {lois.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Investor</th><th className="th">Project</th><th className="th">Amount</th><th className="th">Structure</th><th className="th">Message</th><th className="th">Date</th><th className="th">Status</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{lois.map((l) => (
              <tr key={l.id}>
                <td className="td"><Link href={`/admin/investors/${l.investorId}`} className="font-medium text-brand-600">{l.investor.name}</Link><div className="text-xs text-slate-500">{l.investor.firm}{l.investor.ndaSigned ? " · NDA ✓" : " · no NDA"}</div></td>
                <td className="td"><Link href={`/admin/projects/${l.projectId}`} className="text-brand-600">{l.project.code}</Link></td>
                <td className="td">{usd(l.amount)}</td>
                <td className="td text-sm">{l.structure}<div className="text-xs text-slate-500">{l.timeline}</div></td>
                <td className="td max-w-xs text-xs text-slate-600">{l.message}</td>
                <td className="td text-xs">{date(l.createdAt)}</td>
                <td className="td"><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
                <td className="td">
                  {l.status === "PENDING" && (
                    <div className="flex gap-2">
                      <form action={reviewLoi}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value="APPROVED" /><button className="btn px-3 py-1.5">Approve</button></form>
                      <form action={reviewLoi}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="status" value="DECLINED" /><button className="btn-danger">Decline</button></form>
                    </div>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No letters of interest yet.</Empty>}
    </div>
  );
}
