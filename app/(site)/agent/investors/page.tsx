import Link from "next/link";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { agentInvestorWhere } from "@/lib/agents";
import { Badge, Empty, PageHeader, Section } from "@/components/ui";
import { INVESTOR_STAGES, stageLabel } from "@/lib/constants";
import { memberTone } from "@/lib/investor-crm";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgentInvestors() {
  const me = await requireAgent();
  const investors = await db.investor.findMany({
    where: agentInvestorWhere(me.id),
    include: { _count: { select: { interests: true } }, activities: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { name: "asc" },
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Investor contacts" subtitle="Investors you referred. Open one to see the listings they're working and their activity." action={<Link href="/agent/refer" className="btn-ghost">Refer an investor</Link>} />
      <Section title={`Contacts (${investors.length})`}>
        {investors.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Name</th><th className="th">Company</th><th className="th">Status</th><th className="th">Listings</th><th className="th">Last activity</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {investors.map((i) => (
                  <tr key={i.id}>
                    <td className="td"><Link href={`/agent/investors/${i.id}`} className="font-medium text-brand-600">{i.name}</Link>{i.title && <div className="text-xs text-slate-500">{i.title}</div>}</td>
                    <td className="td">{i.firm ?? "—"}</td>
                    <td className="td"><Badge tone={memberTone(i.stage)}>{stageLabel(INVESTOR_STAGES, i.stage)}</Badge></td>
                    <td className="td">{i._count.interests}</td>
                    <td className="td text-xs">{date(i.activities[0]?.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No investor contacts yet. <Link href="/agent/refer" className="text-brand-600">Refer one</Link> to get started.</Empty>}
      </Section>
    </div>
  );
}
