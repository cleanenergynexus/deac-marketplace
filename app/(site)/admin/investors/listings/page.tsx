import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, Empty, PageHeader, statusTone } from "@/components/ui";
import { DEAL_TYPES, dealTypeLabel } from "@/lib/constants";
import { ago } from "@/lib/crm";
import { loadInvestorCrm } from "@/lib/investor-crm-db";
import { FUNNEL_KEYS, funnelKey, funnelStages, placeStage } from "@/lib/pipeline";
import { getInvestorPipeline } from "@/lib/pipeline-db";
import { num, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Every listing with the investors working it, by column. Open one to see its investors on the board. */
export default async function InvestorListings({ searchParams }: { searchParams: Promise<{ funnel?: string; q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase();
  const funnel = sp.funnel && FUNNEL_KEYS.includes(sp.funnel) ? sp.funnel : "";
  const [{ investors }, pipeline, listings, touches] = await Promise.all([
    loadInvestorCrm(),
    getInvestorPipeline(),
    db.project.findMany({ select: { id: true, code: true, title: true, mw: true, state: true, dealType: true, fundingNeeded: true, visibility: true, developer: { select: { id: true, company: true } } }, orderBy: { code: "asc" } }),
    db.activity.groupBy({ by: ["projectId"], where: { projectId: { not: null }, investorId: { not: null } }, _max: { createdAt: true } }),
  ]);
  const last = new Map(touches.map((t) => [t.projectId!, t._max.createdAt]));
  const rows = listings
    .filter((p) => (!funnel || funnelKey(p.dealType) === funnel) && (!q || [p.code, p.title, p.developer.company].some((x) => x.toLowerCase().includes(q))))
    .map((p) => {
      const st = funnelStages(pipeline, p.dealType);
      const on = investors.flatMap((i) => i.interests.filter((it) => it.projectId === p.id).map((it) => ({ i, stage: placeStage(st, it.stage) })));
      return { p, st, on, byStage: st.map((s) => ({ ...s, n: on.filter((x) => x.stage === s.value).length })).filter((s) => s.n) };
    })
    .sort((a, b) => b.on.length - a.on.length || a.p.code.localeCompare(b.p.code));

  return (
    <div>
      <PageHeader title="Listings" subtitle="Investors working each listing. Open a listing to see only its investors on the board." action={
        <form className="flex gap-2">
          <select name="funnel" defaultValue={funnel} className="input w-48 py-1.5"><option value="">All deal types</option>{DEAL_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select>
          <input name="q" defaultValue={sp.q} placeholder="Search listing or developer" className="input w-60 py-1.5" />
          <button className="btn-ghost">Filter</button>
        </form>} />
      {!rows.length ? <Empty>No listings match.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Listing</th><th className="th">Deal type</th><th className="th">Investors</th><th className="th">By stage</th><th className="th">Who</th><th className="th">Last touch</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ p, on, byStage }) => (
                <tr key={p.id} className="align-top">
                  <td className="td min-w-64">
                    <Link href={`/admin/investors?listing=${p.id}`} className="font-medium text-brand-600">{p.title}</Link>
                    <div className="text-xs text-slate-500"><span className="font-mono">{p.code}</span> · {num(p.mw)} MW · {p.state}{p.fundingNeeded ? ` · ${usd(p.fundingNeeded)}` : ""}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs"><Link href={`/admin/developers/${p.developer.id}`} className="text-slate-500 hover:text-brand-600">{p.developer.company}</Link><Badge tone={statusTone(p.visibility)}>{p.visibility}</Badge></div>
                  </td>
                  <td className="td whitespace-nowrap text-sm">{dealTypeLabel(p.dealType)}</td>
                  <td className="td text-lg font-semibold">{on.length}</td>
                  <td className="td min-w-44"><div className="flex flex-wrap gap-1">{byStage.map((s) => <Link key={s.value} href={`/admin/investors?listing=${p.id}&stage=${s.value}`} className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-200">{s.label} {s.n}</Link>)}{!byStage.length && <span className="text-xs text-slate-400">—</span>}</div></td>
                  <td className="td max-w-xs text-sm">
                    {on.slice(0, 3).map(({ i }) => <Link key={i.id} href={`/admin/investors/${i.id}`} className="block truncate hover:text-brand-600">{i.name}{i.firm ? <span className="text-xs text-slate-500"> · {i.firm}</span> : null}</Link>)}
                    {on.length > 3 && <span className="text-xs text-slate-500">+{on.length - 3} more</span>}
                  </td>
                  <td className="td whitespace-nowrap text-xs text-slate-600">{ago(last.get(p.id)) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
