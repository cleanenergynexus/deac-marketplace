import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { Badge, PageHeader, Section, Empty, statusTone } from "@/components/ui";
import { usd, date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Portal() {
  const u = await currentUser();
  if (!u?.investorId) redirect("/login");
  if (u.status !== "APPROVED") redirect("/pending");
  const [lois, reqs] = await Promise.all([
    db.loi.findMany({ where: { investorId: u.investorId }, include: { project: true }, orderBy: { createdAt: "desc" } }),
    db.analysisRequest.findMany({ where: { investorId: u.investorId }, include: { project: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${u.name.split(" ")[0]}`} subtitle="Your letters of interest, data rooms and analysis requests." />
      <Section title="Letters of interest & data rooms">
        {lois.length ? (
          <table className="w-full"><thead><tr><th className="th">Project</th><th className="th">Amount</th><th className="th">Submitted</th><th className="th">Status</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{lois.map((l) => (
              <tr key={l.id}><td className="td"><Link href={`/marketplace/${l.projectId}`} className="font-medium text-brand-600">{l.project.title}</Link></td><td className="td">{usd(l.amount)}</td><td className="td">{date(l.createdAt)}</td><td className="td"><Badge tone={statusTone(l.status)}>{l.status}</Badge></td>
                <td className="td text-right">{l.status === "APPROVED" && <Link href={`/marketplace/${l.projectId}/data-room`} className="btn-ghost">Data room</Link>}</td></tr>
            ))}</tbody></table>
        ) : <Empty>No letters yet. <Link href="/marketplace" className="text-brand-600">Browse opportunities</Link></Empty>}
      </Section>
      <Section title="Analysis requests">
        {reqs.length ? (
          <ul className="divide-y divide-slate-100">{reqs.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-2 text-sm"><span>{r.project.code} · {r.focusAreas.split(",").join(", ")}</span><span className="flex items-center gap-3">{r.deliverableUrl && <a href={r.deliverableUrl} className="text-brand-600">Download</a>}<Badge tone={statusTone(r.status)}>{r.status}</Badge></span></li>
          ))}</ul>
        ) : <Empty>No requests yet.</Empty>}
      </Section>
    </div>
  );
}
