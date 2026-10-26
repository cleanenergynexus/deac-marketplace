import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, Stat, Section, Badge, statusTone } from "@/components/ui";
import { INVESTOR_STAGES, DEVELOPER_STAGES } from "@/lib/constants";
import { usd, num, date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [investors, developers, projects, lois, activity] = await Promise.all([
    db.investor.groupBy({ by: ["stage"], _count: true }),
    db.developer.groupBy({ by: ["stage"], _count: true }),
    db.project.findMany({ select: { mw: true, fundingNeeded: true, visibility: true } }),
    db.loi.findMany({ include: { investor: true, project: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.activity.findMany({ include: { investor: true, developer: true }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const live = projects.filter((p) => p.visibility !== "DRAFT");
  const count = (g: { stage: string; _count: number }[], s: string) => g.find((x) => x.stage === s)?._count ?? 0;
  const members = count(investors, "APPROVED") + count(investors, "ACTIVE");
  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" />
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
          <Funnel stages={DEVELOPER_STAGES} counts={developers} href="/admin/developers?stage=" />
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
