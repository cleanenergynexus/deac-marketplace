import Link from "next/link";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { agentContactWhere } from "@/lib/agents";
import { Empty, PageHeader, Section } from "@/components/ui";
import { formatPhone } from "@/lib/phone";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AgentDevelopers() {
  const me = await requireAgent();
  const contacts = await db.contact.findMany({
    where: agentContactWhere(me.id),
    include: { developer: { select: { id: true, company: true, _count: { select: { projects: true } } } }, activities: { select: { createdAt: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: [{ developer: { company: "asc" } }, { name: "asc" }],
  });
  return (
    <div className="space-y-6">
      <PageHeader title="Developer contacts" subtitle="Developers you referred and the people at their companies. Open one to follow its projects and activity." action={<Link href="/agent/refer" className="btn-ghost">Refer a developer</Link>} />
      <Section title={`Contacts (${contacts.length})`}>
        {contacts.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Name</th><th className="th">Company</th><th className="th">Email / phone</th><th className="th">Projects</th><th className="th">Last activity</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {contacts.map((c) => (
                  <tr key={c.id}>
                    <td className="td"><Link href={`/agent/developers/${c.id}`} className="font-medium text-brand-600">{c.name}</Link>{c.title && <div className="text-xs text-slate-500">{c.title}</div>}</td>
                    <td className="td">{c.developer.company}</td>
                    <td className="td text-sm">{c.email && <div>{c.email}</div>}{c.phone && <div className="text-slate-500">{formatPhone(c.phone)}</div>}</td>
                    <td className="td">{c.developer._count.projects}</td>
                    <td className="td text-xs">{date(c.activities[0]?.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No developer contacts yet. <Link href="/agent/refer" className="text-brand-600">Refer one</Link> to get started.</Empty>}
      </Section>
    </div>
  );
}
