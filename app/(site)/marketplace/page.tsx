import { db } from "@/lib/db";
import { requireMember } from "@/lib/auth";
import { ProjectTile } from "@/components/ProjectTile";
import { FavoriteButton } from "@/components/FavoriteButton";
import { PageHeader, Empty } from "@/components/ui";
import { DEAL_TYPES, FACILITY_TYPES, isClosedDeal } from "@/lib/constants";
import { usd, num } from "@/lib/format";
import type { Prisma } from "@prisma/client";
import { countryName } from "@/lib/phone";
import { STATE_NAMES } from "@/lib/regions";

export const dynamic = "force-dynamic";

type SP = { deal?: string; type?: string; loc?: string; state?: string; mwMin?: string; mwMax?: string; sort?: string };

export default async function Marketplace({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireMember();
  const sp = await searchParams;
  const where: Prisma.ProjectWhereInput = { visibility: u.role === "ADMIN" ? { in: ["PRIVATE", "TEASER", "DRAFT"] } : { in: ["PRIVATE", "TEASER"] } };
  if (sp.deal) where.dealType = sp.deal;
  if (sp.type) where.facilityType = sp.type;
  // loc is a country code ("ES", "US") or a US state ("US:TX"). ?state=TX is the older link format.
  const loc = sp.loc ?? (sp.state ? `US:${sp.state}` : "");
  if (loc) { const [country, state] = loc.split(":"); where.country = country; if (state) where.state = state; }
  if (sp.mwMin || sp.mwMax) where.mw = { gte: sp.mwMin ? Number(sp.mwMin) : undefined, lte: sp.mwMax ? Number(sp.mwMax) : undefined };
  const orderBy: Prisma.ProjectOrderByWithRelationInput =
    sp.sort === "mw" ? { mw: "desc" } : sp.sort === "funding" ? { fundingNeeded: "desc" } : { updatedAt: "desc" };

  const [projects, states, favs] = await Promise.all([
    db.project.findMany({ where, orderBy }),
    db.project.findMany({ where: { visibility: { in: ["PRIVATE", "TEASER"] } }, select: { country: true, state: true }, distinct: ["country", "state"] }),
    u.investorId ? db.favorite.findMany({ where: { investorId: u.investorId }, select: { projectId: true } }) : [],
  ]);
  const locations = locationOptions(states);
  const starred = new Set(favs.map((f) => f.projectId));
  const star = (id: string) => (u.investorId ? <FavoriteButton projectId={id} initial={starred.has(id)} /> : undefined);
  const open = projects.filter((p) => !isClosedDeal(p.dealStage));
  const closed = projects.filter((p) => isClosedDeal(p.dealStage));
  const totalMw = open.reduce((a, p) => a + p.mw, 0);
  const totalFunding = open.reduce((a, p) => a + p.fundingNeeded, 0);

  return (
    <div>
      <PageHeader title="Opportunities" subtitle={`${open.length} open projects · ${num(totalMw)} MW · ${usd(totalFunding)} sought${u.investorId ? " · Star ☆ a listing to keep it in My Portal" : ""}`} />
      <form className="card mb-6 grid gap-3 p-4 sm:grid-cols-3 lg:grid-cols-7">
        <select name="deal" defaultValue={sp.deal ?? ""} className="input"><option value="">All deal types</option>{DEAL_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
        <select name="type" defaultValue={sp.type ?? ""} className="input"><option value="">All facility types</option>{FACILITY_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        <select name="loc" defaultValue={loc} className="input"><option value="">All locations</option>{locations.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <input name="mwMin" defaultValue={sp.mwMin} placeholder="Min MW" className="input" inputMode="decimal" />
        <input name="mwMax" defaultValue={sp.mwMax} placeholder="Max MW" className="input" inputMode="decimal" />
        <select name="sort" defaultValue={sp.sort ?? ""} className="input"><option value="">Newest</option><option value="mw">Largest MW</option><option value="funding">Largest raise</option></select>
        <button className="btn">Filter</button>
      </form>
      {open.length ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{open.map((p) => <ProjectTile key={p.id} p={p} href={`/marketplace/${p.id}`} corner={star(p.id)} />)}</div>
      ) : (
        <Empty>{closed.length ? "No open opportunities match these filters." : "No opportunities match these filters."}</Empty>
      )}
      {closed.length > 0 && (
        <section className="mt-12 border-t border-slate-200 pt-8">
          <div className="mb-5 flex items-baseline gap-3">
            <h2 className="text-xl font-bold">Closed Deals</h2>
            <span className="text-sm text-slate-500">{closed.length} sold · {num(closed.reduce((a, p) => a + p.mw, 0))} MW</span>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{closed.map((p) => <ProjectTile key={p.id} p={p} href={`/marketplace/${p.id}`} />)}</div>
        </section>
      )}
    </div>
  );
}

/** Location filter choices: the United States and each of its states with listings, then every other country. */
function locationOptions(rows: { country: string; state: string }[]) {
  const us = [...new Set(rows.filter((r) => r.country === "US" && r.state).map((r) => r.state))].sort();
  const other = [...new Set(rows.filter((r) => r.country !== "US").map((r) => r.country))].sort((a, b) => countryName(a).localeCompare(countryName(b)));
  return [
    ...(rows.some((r) => r.country === "US") ? [{ value: "US", label: "United States (all)" }] : []),
    ...us.map((st) => ({ value: `US:${st}`, label: `\u00a0\u00a0${STATE_NAMES[st] ?? st}` })),
    ...other.map((c) => ({ value: c, label: countryName(c) })),
  ];
}
