import Link from "next/link";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { agentActivityWhere, agentCompanyWhere, agentContactWhere, agentInvestorWhere, agentProjectWhere, PUBLIC_TO_AGENTS } from "@/lib/agents";
import { AGENT_LINKS, getPartner, meetingOptions } from "@/lib/agent-portal";
import { ActivityFeed } from "@/components/ActivityFeed";
import { MeetingRequestForm } from "@/components/MeetingRequestForm";
import { PartnerCard } from "@/components/PartnerCard";
import { PageHeader, Section, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AgentHome() {
  const me = await requireAgent();
  const [partner, contacts, companies, investors, listings, activity, options, docs] = await Promise.all([
    getPartner(me.partnerId),
    db.contact.count({ where: agentContactWhere(me.id) }),
    db.developer.count({ where: agentCompanyWhere(me.id) }),
    db.investor.count({ where: agentInvestorWhere(me.id) }),
    db.project.count({ where: agentProjectWhere(me.id) }),
    db.activity.findMany({
      where: { AND: [agentActivityWhere(me.id), PUBLIC_TO_AGENTS] },
      include: { contact: { select: { id: true, name: true } }, investor: { select: { id: true, name: true } }, project: { select: { id: true, code: true, title: true } }, assignee: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    meetingOptions(me.id),
    db.signatureRequest.findMany({ where: { agentId: me.id, isTemplate: false, status: { in: ["SENT", "VIEWED", "SIGNED"] } }, orderBy: { updatedAt: "desc" }, take: 20 }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${me.name.split(" ")[0]}`} subtitle="The contacts you referred to DEAC, their projects, and everything that happens with them." action={<Link href="/agent/refer" className="btn">Refer a contact</Link>} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Link href="/agent/developers"><Stat label="Developer contacts" value={contacts} sub={`${companies} compan${companies === 1 ? "y" : "ies"}`} /></Link>
        <Link href="/agent/investors"><Stat label="Investor contacts" value={investors} /></Link>
        <Link href="/agent/listings"><Stat label="Listings" value={listings} sub="Projects of your developers" /></Link>
        <Link href="/agent/import"><Stat label="New listing" value="Import" sub="From a teaser, memo or web page" /></Link>
      </div>
      {docs.length > 0 && (
        <Section title="Your Agreements with DEAC">
          <ul className="divide-y divide-slate-100">{docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="font-medium">{d.title}</span>
              {d.status === "SIGNED"
                ? <a href={`/api/esign/${d.id}?file=signed`} target="_blank" className="text-brand-600">Signed · open</a>
                : <Link href={`/agent/sign/${d.id}`} className="btn py-1.5">Review &amp; sign</Link>}
            </li>
          ))}</ul>
        </Section>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Section title="Recent Activity with Your Contacts">
          <ActivityFeed items={activity} showContact readOnly links={AGENT_LINKS} empty="Nothing yet. Once DEAC starts working with your contacts, every call, email and meeting shows here." />
        </Section>
        <div className="space-y-4">
          <PartnerCard partner={partner} />
          <div className="card p-5">
            <h2 className="mb-3 font-semibold">Request a Meeting</h2>
            <MeetingRequestForm contacts={options} partnerName={partner?.name} />
          </div>
        </div>
      </div>
    </div>
  );
}
