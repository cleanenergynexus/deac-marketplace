import Link from "next/link";
import { placeShort } from "@/lib/location";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { agentContactWhere, contactActivityWhere } from "@/lib/agents";
import { AGENT_LINKS, getPartner, meetingOptions } from "@/lib/agent-portal";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Avatar, CrmIcon } from "@/components/CrmIcons";
import { MeetingRequestForm } from "@/components/MeetingRequestForm";
import { Badge } from "@/components/ui";
import { CONTACT_TABS, contactTab, initials } from "@/lib/crm";
import { projectStageLabel } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";
import { num, usd } from "@/lib/format";
import { formatPhone, telHref } from "@/lib/phone";
import { isClosedDeal } from "@/lib/constants";

export const dynamic = "force-dynamic";

/** Read-only developer contact record for the referral agent who referred them. */
export default async function AgentContact({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const tab = contactTab((await searchParams).tab);
  const me = await requireAgent();
  const contact = await db.contact.findFirst({
    where: { AND: [{ id }, agentContactWhere(me.id)] },
    include: { developer: { include: { projects: { select: { id: true, code: true, title: true, mw: true, country: true, state: true, dealType: true, dealStage: true, pipelineStage: true, fundingNeeded: true }, orderBy: { createdAt: "asc" } } } } },
  });
  if (!contact) notFound();
  const dev = contact.developer;
  const [pipeline, partner, options, all] = await Promise.all([
    getPipeline(),
    getPartner(me.partnerId),
    meetingOptions(me.id),
    db.activity.findMany({
      where: contactActivityWhere(contact),
      include: { project: { select: { id: true, code: true, title: true } }, assignee: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const count = (kinds: readonly string[] | null) => (kinds ? all.filter((a) => kinds.includes(a.kind)).length : all.length);
  const items = tab.kinds ? all.filter((a) => (tab.kinds as readonly string[]).includes(a.kind)) : all;

  return (
    <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_270px]">
      <aside className="space-y-4">
        <Link href="/agent/developers" className="text-sm text-brand-600">← Developer contacts</Link>
        <div className="card p-5 text-center">
          <Avatar name={contact.name} initials={initials(contact.name)} size="lg" />
          <h1 className="mt-3 text-xl font-bold">{contact.name}</h1>
          {contact.title && <div className="text-sm text-slate-600">{contact.title}</div>}
          <div className="text-sm text-slate-700">{dev.company}</div>
          {contact.isPrimary && <div className="mt-2"><Badge tone="blue">Primary contact</Badge></div>}
          <div className="mt-4 space-y-1 text-left text-sm">
            {contact.email && <a href={`mailto:${contact.email}`} className="block truncate text-brand-600">{contact.email}</a>}
            {contact.phone && <a href={telHref(contact.phone)} className="block text-slate-700">{formatPhone(contact.phone)}</a>}
            {contact.mobile && <a href={telHref(contact.mobile)} className="block text-slate-700">{formatPhone(contact.mobile)} <span className="text-xs text-slate-400">mobile</span></a>}
            {dev.website && <a href={dev.website.startsWith("http") ? dev.website : `https://${dev.website}`} target="_blank" rel="noreferrer" className="block truncate text-brand-600">{dev.website.replace(/^https?:\/\//, "")}</a>}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">Request a meeting</h2>
          <MeetingRequestForm contacts={options} about={`dev:${contact.id}`} partnerName={partner?.name} />
        </div>
      </aside>

      <main className="min-w-0 space-y-4">
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {CONTACT_TABS.map((t) => (
            <Link key={t.value} href={`?tab=${t.value}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${t.value === tab.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              {t.label} <span className="text-xs text-slate-400">{count(t.kinds)}</span>
            </Link>
          ))}
        </nav>
        <p className="text-xs text-slate-500">What the DEAC team has logged with {contact.name.split(" ")[0]}. View only.</p>
        <ActivityFeed items={items} readOnly links={AGENT_LINKS} empty={`Nothing logged with ${contact.name} yet.`} />
      </main>

      <aside className="space-y-4 lg:col-start-2 xl:col-start-auto">
        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CrmIcon name="PROJECT" /> {dev.company} projects ({dev.projects.length})</h2>
          {!dev.projects.length && <p className="text-sm text-slate-500">No projects yet. <Link href="/agent/import" className="text-brand-600">Import a listing</Link>.</p>}
          <ul className="space-y-3">
            {dev.projects.map((p) => (
              <li key={p.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <Link href={`/agent/listings/${p.id}`} className="font-medium text-slate-900 hover:text-brand-600">{p.title}</Link>
                <div className="mt-0.5 text-xs text-slate-500"><span className="font-mono">{p.code}</span> · {num(p.mw)} MW · {placeShort(p)} · {usd(p.fundingNeeded)}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge tone={isClosedDeal(p.dealStage) ? "red" : "slate"}>{projectStageLabel(pipeline, p, dev.stage)}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
