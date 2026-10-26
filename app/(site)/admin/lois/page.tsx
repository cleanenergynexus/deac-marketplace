import Link from "next/link";
import { db } from "@/lib/db";
import { reviewDealStep, reviewLoi } from "@/app/actions/admin";
import { Badge, PageHeader, Empty, Section, statusTone } from "@/components/ui";
import { usd, date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Lois() {
  const [lois, steps] = await Promise.all([
    db.loi.findMany({ include: { investor: true, project: true }, orderBy: [{ status: "desc" }, { createdAt: "desc" }] }),
    db.dealStep.findMany({ include: { investor: true, project: true }, orderBy: [{ status: "desc" }, { createdAt: "desc" }] }),
  ]);
  const ndas = steps.filter((d) => d.step === "NDA");
  const diligence = steps.filter((d) => d.step === "DILIGENCE");
  const review = (id: string) => (
    <div className="flex gap-2">
      <form action={reviewDealStep}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="APPROVED" /><button className="btn px-3 py-1.5">Confirm</button></form>
      <form action={reviewDealStep}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="DECLINED" /><button className="btn-danger">Decline</button></form>
    </div>
  );
  return (
    <div className="space-y-6">
      <PageHeader title="NDAs, LOIs & diligence" subtitle="Each confirmation opens more of the listing and data room for that investor, and emails them. Set what each stage shows on the listing's admin page." />

      <Section title="1 · NDAs">
        {ndas.length ? (
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Investor</th><th className="th">Project</th><th className="th">Signed as</th><th className="th">Date</th><th className="th">Status</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{ndas.map((d) => (
              <tr key={d.id}>
                <td className="td"><Link href={`/admin/investors/${d.investorId}`} className="font-medium text-brand-600">{d.investor.name}</Link><div className="text-xs text-slate-500">{d.investor.firm}</div></td>
                <td className="td"><Link href={`/admin/projects/${d.projectId}`} className="text-brand-600">{d.project.code}</Link></td>
                <td className="td text-sm">{d.signerName}<div className="text-xs text-slate-500">{d.signerTitle}</div></td>
                <td className="td text-xs">{date(d.createdAt)}</td>
                <td className="td"><Badge tone={statusTone(d.status)}>{d.status}</Badge></td>
                <td className="td">{d.status === "PENDING" && review(d.id)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>No NDAs signed yet.</Empty>}
      </Section>

      <Section title="2 · Letters of interest">
      {lois.length ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Investor</th><th className="th">Project</th><th className="th">Amount</th><th className="th">Structure</th><th className="th">Message</th><th className="th">Date</th><th className="th">Status</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{lois.map((l) => (
              <tr key={l.id}>
                <td className="td"><Link href={`/admin/investors/${l.investorId}`} className="font-medium text-brand-600">{l.investor.name}</Link><div className="text-xs text-slate-500">{l.investor.firm}{l.investor.ndaSigned ? " · master NDA ✓" : ""}</div></td>
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
      </Section>

      <Section title="3 · Full diligence requests">
        {diligence.length ? (
          <div className="overflow-x-auto"><table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Investor</th><th className="th">Project</th><th className="th">Message</th><th className="th">Date</th><th className="th">Status</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{diligence.map((d) => (
              <tr key={d.id}>
                <td className="td"><Link href={`/admin/investors/${d.investorId}`} className="font-medium text-brand-600">{d.investor.name}</Link><div className="text-xs text-slate-500">{d.investor.firm}</div></td>
                <td className="td"><Link href={`/admin/projects/${d.projectId}`} className="text-brand-600">{d.project.code}</Link></td>
                <td className="td max-w-xs text-xs text-slate-600">{d.message}</td>
                <td className="td text-xs">{date(d.createdAt)}</td>
                <td className="td"><Badge tone={statusTone(d.status)}>{d.status}</Badge></td>
                <td className="td">{d.status === "PENDING" && review(d.id)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>No diligence requests yet.</Empty>}
      </Section>
    </div>
  );
}
