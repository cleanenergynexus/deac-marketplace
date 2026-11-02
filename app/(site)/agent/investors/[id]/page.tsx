import Link from "next/link";
import { placeShort } from "@/lib/location";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { AGENT_LINKS, getPartner, meetingOptions } from "@/lib/agent-portal";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Avatar } from "@/components/CrmIcons";
import { MeetingRequestForm } from "@/components/MeetingRequestForm";
import { Badge } from "@/components/ui";
import { CONTACT_TABS, contactTab, initials } from "@/lib/crm";
import { INVESTOR_STAGES, stageLabel } from "@/lib/constants";
import { memberTone } from "@/lib/investor-crm";
import { funnelStages, pipelineLabel } from "@/lib/pipeline";
import { getInvestorPipeline } from "@/lib/pipeline-db";
import { num } from "@/lib/format";
import { formatPhone, telHref } from "@/lib/phone";

export const dynamic = "force-dynamic";

/** Read-only investor contact record for the referral agent who referred them. */
export default async function AgentInvestor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const tab = contactTab((await searchParams).tab);
  const me = await requireAgent();
  const inv = await db.investor.findFirst({
    where: { id, referredById: me.id },
    include: { interests: { include: { project: { select: { id: true, code: true, title: true, mw: true, country: true, state: true, dealType: true } } }, orderBy: { createdAt: "asc" } } },
  });
  if (!inv) notFound();
  const [pipeline, partner, options, all] = await Promise.all([
    getInvestorPipeline(),
    getPartner(me.partnerId),
    meetingOptions(me.id),
    db.activity.findMany({
      where: { investorId: id },
      include: { project: { select: { id: true, code: true, title: true } }, assignee: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const count = (kinds: readonly string[] | null) => (kinds ? all.filter((a) => kinds.includes(a.kind)).length : all.length);
  const items = tab.kinds ? all.filter((a) => (tab.kinds as readonly string[]).includes(a.kind)) : all;

  return (
    <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_270px]">
      <aside className="space-y-4">
        <Link href="/agent/investors" className="text-sm text-brand-600">← Investor contacts</Link>
        <div className="card p-5 text-center">
          <Avatar name={inv.name} initials={initials(inv.name)} size="lg" />
          <h1 className="mt-3 text-xl font-bold">{inv.name}</h1>
          {inv.title && <div className="text-sm text-slate-600">{inv.title}</div>}
          {inv.firm && <div className="text-sm text-slate-700">{inv.firm}</div>}
          <div className="mt-2"><Badge tone={memberTone(inv.stage)}>{stageLabel(INVESTOR_STAGES, inv.stage)}</Badge></div>
          <div className="mt-4 space-y-1 text-left text-sm">
            <a href={`mailto:${inv.email}`} className="block truncate text-brand-600">{inv.email}</a>
            {inv.phone && <a href={telHref(inv.phone)} className="block text-slate-700">{formatPhone(inv.phone)}</a>}
            {inv.mobile && <a href={telHref(inv.mobile)} className="block text-slate-700">{formatPhone(inv.mobile)} <span className="text-xs text-slate-400">mobile</span></a>}
          </div>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold">Request a meeting</h2>
          <MeetingRequestForm contacts={options} about={`inv:${inv.id}`} partnerName={partner?.name} />
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
        <p className="text-xs text-slate-500">What the DEAC team has logged with {inv.name.split(" ")[0]}. View only.</p>
        {/* Listings an investor works may belong to other developers, so the feed shows their codes without links. */}
        <ActivityFeed items={items.map((a) => ({ ...a, project: null }))} readOnly links={AGENT_LINKS} empty={`Nothing logged with ${inv.name} yet.`} />
      </main>

      <aside className="space-y-4 lg:col-start-2 xl:col-start-auto">
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold">Listings {inv.name.split(" ")[0]} is working ({inv.interests.length})</h2>
          {!inv.interests.length && <p className="text-sm text-slate-500">Not linked to a listing yet.</p>}
          <ul className="space-y-3">
            {inv.interests.map((it) => (
              <li key={it.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="font-medium">{it.project.title}</div>
                <div className="mt-0.5 text-xs text-slate-500"><span className="font-mono">{it.project.code}</span> · {num(it.project.mw)} MW · {placeShort(it.project)}</div>
                <div className="mt-1"><Badge tone="blue">{pipelineLabel(funnelStages(pipeline, it.project.dealType), it.stage)}</Badge></div>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
