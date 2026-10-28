import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Stat, Section, Badge, statusTone } from "@/components/ui";
import { DEAL_TYPES, INVESTOR_STAGES } from "@/lib/constants";
import { funnelKey, projectStage } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";
import { usd, num, date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [investors, developers, projects, lois, activity, pendingAccess, pipeline] = await Promise.all([
    db.investor.groupBy({ by: ["stage"], _count: true }),
    db.developer.findMany({ select: { stage: true, projects: { select: { dealType: true, pipelineStage: true } } } }),
    db.project.findMany({ select: { mw: true, fundingNeeded: true, visibility: true } }),
    db.loi.findMany({ include: { investor: true, project: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.activity.findMany({ include: { investor: true, developer: true }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.user.count({ where: { role: "INVESTOR", status: "PENDING" } }),
    getPipeline(),
  ]);
  // Developer pipeline counts board tiles per deal type funnel. Companies with no project yet are counted separately.
  const tiles = developers.flatMap((d) => d.projects.map((p) => ({ funnel: funnelKey(p.dealType), stage: projectStage(pipeline, p, d.stage) })));
  const noProject = developers.filter((d) => !d.projects.length).length;
  const funnels = DEAL_TYPES.map((d) => ({ ...d, stages: pipeline.funnels[d.value], counts: pipeline.funnels[d.value].map((s) => ({ stage: s.value, _count: tiles.filter((t) => t.funnel === d.value && t.stage === s.value).length })) }));
  const live = projects.filter((p) => p.visibility !== "DRAFT");
  const count = (g: { stage: string; _count: number }[], s: string) => g.find((x) => x.stage === s)?._count ?? 0;
  const members = count(investors, "APPROVED") + count(investors, "ACTIVE");
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
      {pendingAccess > 0 && (
        <Link href="/admin/access" className="flex items-center justify-between rounded-lg bg-amber-50 p-4 text-sm text-amber-900 hover:bg-amber-100">
          <span><b>{pendingAccess}</b> investor{pendingAccess === 1 ? "" : "s"} waiting for access approval</span>
          <span className="font-semibold">Review →</span>
        </Link>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Approved investors" value={members} sub={`${count(investors, "APPLIED")} applications waiting`} />
        <Stat label="Live listings" value={live.length} sub={`${projects.length - live.length} drafts`} />
        <Stat label="Live MW" value={num(live.reduce((a, p) => a + p.mw, 0))} />
        <Stat label="Capital sought" value={usd(live.reduce((a, p) => a + p.fundingNeeded, 0))} />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Investor pipeline">
          <Funnel stages={INVESTOR_STAGES} counts={investors} href="/admin/investors?stage=" />
        </Section>
        <Section title="Developer pipeline">
          <div className="space-y-5">
            {funnels.map((f) => (
              <div key={f.value}>
                <Link href={`/admin/developers?funnel=${f.value}`} className="mb-2 block text-xs font-semibold uppercase text-slate-500 hover:text-brand-600">{f.label}</Link>
                <Funnel stages={f.stages} counts={f.counts} href={`/admin/developers?funnel=${f.value}&stage=`} />
              </div>
            ))}
            {noProject > 0 && <p className="text-sm text-slate-500">{noProject} compan{noProject === 1 ? "y has" : "ies have"} no project yet.</p>}
          </div>
        </Section>
        <Section title="Recent LOIs" action={<Link href="/admin/lois" className="text-sm text-brand-600">All</Link>}>
          <ul className="divide-y divide-slate-100 text-sm">{lois.map((l) => (
            <li key={l.id} className="flex items-center justify-between py-2"><span><b>{l.investor.name}</b> → {l.project.code}</span><Badge tone={statusTone(l.status)}>{l.status}</Badge></li>
          ))}</ul>
        </Section>
        <Section title="Recent activity">
          <ul className="space-y-2 text-sm">{activity.map((a) => (
            <li key={a.id} className="flex gap-2"><span className="w-20 shrink-0 text-xs text-slate-500">{date(a.createdAt)}</span><span><b>{a.investor?.name ?? a.developer?.company}</b>: {a.body}</span></li>
          ))}</ul>
        </Section>
      </div>
    </div>
  );
}

function Funnel({ stages, counts, href }: { stages: readonly { value: string; label: string }[]; counts: { stage: string; _count: number }[]; href: string }) {
  const max = Math.max(1, ...counts.map((c) => c._count));
  return (
    <div className="space-y-2">
      {stages.map((s) => {
        const n = counts.find((c) => c.stage === s.value)?._count ?? 0;
        return (
          <Link key={s.value} href={href + s.value} className="flex items-center gap-3 text-sm hover:opacity-80">
            <span className="w-36 shrink-0 text-slate-600">{s.label}</span>
            <span className="h-5 rounded bg-brand-500" style={{ width: `${(n / max) * 70}%`, minWidth: n ? 8 : 2 }} />
            <span className="font-semibold">{n}</span>
          </Link>
        );
      })}
    </div>
  );
}
