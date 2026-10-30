import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { Badge, PageHeader, Section, Empty, statusTone } from "@/components/ui";
import { usd } from "@/lib/format";
import { ProjectTile } from "@/components/ProjectTile";
import { FavoriteButton } from "@/components/FavoriteButton";
import { investorStage, nextStep, STAGE_INFO, type StepStatus } from "@/lib/disclosure";

export const dynamic = "force-dynamic";

export default async function Portal() {
  const u = await currentUser();
  if (!u?.investorId) redirect("/login");
  if (u.status !== "APPROVED") redirect("/pending");
  const [lois, steps, reqs, favs] = await Promise.all([
    db.loi.findMany({ where: { investorId: u.investorId }, include: { project: true }, orderBy: { createdAt: "desc" } }),
    db.dealStep.findMany({ where: { investorId: u.investorId }, include: { project: true }, orderBy: { createdAt: "desc" } }),
    db.analysisRequest.findMany({ where: { investorId: u.investorId }, include: { project: true }, orderBy: { createdAt: "desc" } }),
    db.favorite.findMany({ where: { investorId: u.investorId, project: { visibility: { in: ["PRIVATE", "TEASER"] } } }, include: { project: true }, orderBy: { createdAt: "desc" } }),
  ]);
  // One row per listing the investor has engaged with (NDA, LOI or diligence).
  const deals = new Map<string, { project: (typeof lois)[number]["project"]; nda?: StepStatus; loi?: StepStatus; diligence?: StepStatus; amount?: number | null; since: Date }>();
  const row = (project: (typeof lois)[number]["project"], since: Date) => {
    const r = deals.get(project.id) ?? { project, since };
    if (since < r.since) r.since = since;
    deals.set(project.id, r);
    return r;
  };
  for (const l of lois) Object.assign(row(l.project, l.createdAt), { loi: l.status as StepStatus, amount: l.amount });
  for (const d of steps) row(d.project, d.createdAt)[d.step === "NDA" ? "nda" : "diligence"] = d.status as StepStatus;
  const list = [...deals.values()].sort((a, b) => +b.since - +a.since);
  const favorites = favs.map((f) => {
    const d = deals.get(f.projectId) ?? {};
    const stage = investorStage({ masterNda: u.investor?.ndaSigned, ...d });
    return { project: f.project, stage, next: nextStep(stage, d) };
  });

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome, ${u.name.split(" ")[0]}`} subtitle="Your favorites, NDAs, letters of interest, data rooms and analysis requests." />
      <Section title="Favorites">
        {favorites.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{favorites.map(({ project: p, stage, next }) => (
            <div key={p.id} className="flex flex-col gap-2">
              <ProjectTile p={p} href={`/marketplace/${p.id}`} corner={<FavoriteButton projectId={p.id} initial />} />
              <div className="flex items-center justify-between gap-2 px-1 text-sm">
                <Badge tone={stage === "TEASER" ? "slate" : "green"}>{STAGE_INFO[stage].label}</Badge>
                {next.step && (next.status === "PENDING"
                  ? <span className="text-slate-500">{STAGE_INFO[next.step].step} · <Badge tone="amber">PENDING</Badge></span>
                  : <Link href={`/marketplace/${p.id}?tab=loi`} className="font-semibold text-brand-600">{STAGE_INFO[next.step].step} →</Link>)}
              </div>
            </div>
          ))}</div>
        ) : <Empty>No favorites yet. Star ☆ any listing in <Link href="/marketplace" className="text-brand-600">Opportunities</Link> to keep it here, no NDA needed.</Empty>}
      </Section>
      <Section title="Your deals">
        {list.length ? (
          <table className="w-full"><thead><tr><th className="th">Project</th><th className="th">LOI amount</th><th className="th">Your access</th><th className="th">Next step</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{list.map((d) => {
              const stage = investorStage({ masterNda: u.investor?.ndaSigned, ...d });
              const next = nextStep(stage, d);
              return (
                <tr key={d.project.id}><td className="td"><Link href={`/marketplace/${d.project.id}`} className="font-medium text-brand-600">{d.project.title}</Link><div className="text-xs text-slate-500">{d.project.code}</div></td><td className="td">{usd(d.amount)}</td>
                  <td className="td"><Badge tone={stage === "TEASER" ? "slate" : "green"}>{STAGE_INFO[stage].label}</Badge></td>
                  <td className="td text-sm">{next.step ? <>{STAGE_INFO[next.step].step}{next.status !== "NONE" && <> · <Badge tone={statusTone(next.status)}>{next.status}</Badge></>}</> : "—"}</td>
                  <td className="td text-right"><Link href={`/marketplace/${d.project.id}?tab=documents`} className="btn-ghost">Data room</Link></td></tr>
              );
            })}</tbody></table>
        ) : <Empty>Nothing yet. <Link href="/marketplace" className="text-brand-600">Browse opportunities</Link> and sign an NDA to see more.</Empty>}
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
