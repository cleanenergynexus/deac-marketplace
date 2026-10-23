import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { segmentInvestors, sendCampaign } from "@/app/actions/admin";
import { Badge, PageHeader, Section, statusTone } from "@/components/ui";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await db.campaign.findUnique({ where: { id }, include: { recipients: { include: { investor: true } } } });
  if (!c) notFound();
  const audience = c.status === "DRAFT" ? await segmentInvestors(JSON.parse(c.segment)) : [];
  return (
    <div className="space-y-6">
      <Link href="/admin/outreach" className="text-sm text-brand-600">← Outreach</Link>
      <PageHeader title={c.name} subtitle={<>Status <Badge tone={statusTone(c.status)}>{c.status}</Badge> {c.sentAt && `· sent ${date(c.sentAt)}`}</>}
        action={c.status === "DRAFT" && <form action={sendCampaign}><input type="hidden" name="id" value={c.id} /><button className="btn" disabled={!audience.length}>Send to {audience.length} investors</button></form>} />
      <Section title="Message">
        <div className="text-sm font-semibold">{c.subject}</div>
        <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 font-sans text-sm">{c.body}</pre>
      </Section>
      <Section title={c.status === "DRAFT" ? `Audience (${audience.length})` : `Recipients (${c.recipients.length})`}>
        <ul className="divide-y divide-slate-100 text-sm">
          {c.status === "DRAFT"
            ? audience.map((i) => <li key={i.id} className="py-1.5">{i.name} <span className="text-slate-500">· {i.firm} · {i.email}</span></li>)
            : c.recipients.map((r) => <li key={r.id} className="flex justify-between py-1.5"><span>{r.investor.name} <span className="text-slate-500">· {r.investor.email}</span></span><Badge tone={r.status === "FAILED" ? "red" : r.status === "SENT" ? "green" : "slate"}>{r.status}</Badge></li>)}
        </ul>
      </Section>
    </div>
  );
}
