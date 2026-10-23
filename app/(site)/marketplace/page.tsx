import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { ProjectTile } from "@/components/ProjectTile";
import { PageHeader, Empty } from "@/components/ui";
import { DEAL_TYPES, FACILITY_TYPES } from "@/lib/constants";
import { usd, num } from "@/lib/format";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = { deal?: string; type?: string; state?: string; mwMin?: string; mwMax?: string; sort?: string };

export default async function Marketplace({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireMember();
  const sp = await searchParams;
  const where: Prisma.ProjectWhereInput = { visibility: u.role === "ADMIN" ? { in: ["PRIVATE", "TEASER", "DRAFT"] } : { in: ["PRIVATE", "TEASER"] } };
  if (sp.deal) where.dealType = sp.deal;
  if (sp.type) where.facilityType = sp.type;
  if (sp.state) where.state = sp.state;
  if (sp.mwMin || sp.mwMax) where.mw = { gte: sp.mwMin ? Number(sp.mwMin) : undefined, lte: sp.mwMax ? Number(sp.mwMax) : undefined };
  const orderBy: Prisma.ProjectOrderByWithRelationInput =
    sp.sort === "mw" ? { mw: "desc" } : sp.sort === "funding" ? { fundingNeeded: "desc" } : { updatedAt: "desc" };

  const [projects, states] = await Promise.all([
    db.project.findMany({ where, orderBy }),
    db.project.findMany({ where: { visibility: { in: ["PRIVATE", "TEASER"] } }, select: { state: true }, distinct: ["state"], orderBy: { state: "asc" } }),
  ]);
  const totalMw = projects.reduce((a, p) => a + p.mw, 0);
  const totalFunding = projects.reduce((a, p) => a + p.fundingNeeded, 0);

  return (
    <div>
      <PageHeader title="Opportunities" subtitle={`${projects.length} projects · ${num(totalMw)} MW · ${usd(totalFunding)} sought`} />
      <form className="card mb-6 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-7">
        <select name="deal" defaultValue={sp.deal ?? ""} className="input"><option value="">All deal types</option>{DEAL_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        <select name="type" defaultValue={sp.type ?? ""} className="input"><option value="">All facility types</option>{FACILITY_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <select name="state" defaultValue={sp.state ?? ""} className="input"><option value="">All states</option>{states.map((s) => <option key={s.state}>{s.state}</option>)}</select>
        <input name="mwMin" defaultValue={sp.mwMin} placeholder="Min MW" className="input" inputMode="decimal" />
        <input name="mwMax" defaultValue={sp.mwMax} placeholder="Max MW" className="input" inputMode="decimal" />
        <select name="sort" defaultValue={sp.sort ?? ""} className="input"><option value="">Newest</option><option value="mw">Largest MW</option><option value="funding">Largest raise</option></select>
        <button className="btn">Filter</button>
      </form>
      {projects.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{projects.map((p) => <ProjectTile key={p.id} p={p} href={`/marketplace/${p.id}`} />)}</div>
      ) : (
        <Empty>No opportunities match these filters.</Empty>
      )}
    </div>
  );
}
