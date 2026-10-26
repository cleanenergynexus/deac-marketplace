import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, PageHeader, Empty, statusTone } from "@/components/ui";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Outreach() {
  const cs = await db.campaign.findMany({ include: { _count: { select: { recipients: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <PageHeader title="Outreach" subtitle={process.env.RESEND_API_KEY ? "Emails send through Resend." : "Email provider not connected: campaigns are logged to the CRM but not sent. Add RESEND_API_KEY to send."} action={<Link href="/admin/outreach/new" className="btn">New campaign</Link>} />
      {cs.length ? (
        <div className="card"><table className="w-full"><thead className="border-b border-slate-200"><tr><th className="th">Campaign</th><th className="th">Subject</th><th className="th">Recipients</th><th className="th">Sent</th><th className="th">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{cs.map((c) => (
            <tr key={c.id}><td className="td"><Link href={`/admin/outreach/${c.id}`} className="font-medium text-brand-600">{c.name}</Link></td><td className="td text-sm">{c.subject}</td><td className="td">{c._count.recipients}</td><td className="td text-xs">{date(c.sentAt)}</td><td className="td"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td></tr>
          ))}</tbody></table></div>
      ) : <Empty>No campaigns yet. Segment your investor list and send a new-listing announcement.</Empty>}
    </div>
  );
}
