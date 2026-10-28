import Link from "next/link";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { ago } from "@/lib/crm";
import { loadInvestorCrm } from "@/lib/investor-crm-db";
import { funnelStages, pipelineLabel, placeStage } from "@/lib/pipeline";
import { getInvestorPipeline } from "@/lib/pipeline-db";
import { shortPlace } from "@/lib/address";
import { usd } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Investor companies (funds, family offices, lenders...) with their people and the listings they're working. */
export default async function InvestorCompanies({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase();
  const [{ firms, investors, lastTouch }, pipeline] = await Promise.all([loadInvestorCrm(), getInvestorPipeline()]);
  const rows = firms.map((f) => {
    const people = investors.filter((i) => i.firmId === f.id);
    const interests = people.flatMap((i) => i.interests.map((it) => ({ it, who: i })));
    const last = people.map((i) => lastTouch.get(i.id) ?? i.lastContactAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0];
    return { f, people, interests, last };
  }).filter(({ f, people }) => !q || [f.name, f.city, f.region, f.investorType, ...people.map((i) => i.name)].some((x) => x?.toLowerCase().includes(q)))
    .sort((a, b) => (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0) || a.f.name.localeCompare(b.f.name));
  const loose = investors.filter((i) => !i.firmId).length;

  return (
    <div>
      <PageHeader title="Companies" subtitle={`${rows.length} investor companies${loose ? ` · ${loose} contact${loose === 1 ? "" : "s"} with no company` : ""}`} action={
        <div className="flex gap-2">
          <form><input name="q" defaultValue={sp.q} placeholder="Search company, city, contact" className="input w-64 py-1.5" /></form>
          <Link href="/admin/investors/companies/new" className="btn">Add company</Link>
        </div>} />
      {!rows.length ? <Empty>{q ? "No companies match." : "No investor companies yet."}</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Company</th><th className="th">Type</th><th className="th">Contacts</th><th className="th">Listings & stages</th><th className="th">AUM</th><th className="th">Last touch</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ f, people, interests, last }) => (
                <tr key={f.id} className="align-top">
                  <td className="td"><Link href={`/admin/investors/companies/${f.id}`} className="font-medium text-brand-600">{f.name}</Link>{shortPlace(f) && <div className="text-xs text-slate-500">{shortPlace(f)}</div>}</td>
                  <td className="td text-sm">{f.investorType ?? "—"}</td>
                  <td className="td text-sm">
                    {people.slice(0, 3).map((i) => <Link key={i.id} href={`/admin/investors/${i.id}`} className="block hover:text-brand-600">{i.name}</Link>)}
                    {people.length > 3 && <span className="text-xs text-slate-500">+{people.length - 3} more</span>}
                    {!people.length && <span className="text-slate-400">—</span>}
                  </td>
                  <td className="td">
                    {interests.length ? (
                      <ul className="space-y-1">{interests.map(({ it, who }) => {
                        const st = funnelStages(pipeline, it.project.dealType);
                        return <li key={it.id} className="flex flex-wrap items-center gap-2 text-sm"><Link href={`/admin/investors?listing=${it.projectId}`} className="text-slate-700 hover:text-brand-600">{it.project.code}</Link><Badge>{pipelineLabel(st, placeStage(st, it.stage))}</Badge>{people.length > 1 && <span className="text-xs text-slate-500">{who.name}</span>}</li>;
                      })}</ul>
                    ) : <span className="text-sm text-slate-500">Not on a listing yet</span>}
                  </td>
                  <td className="td text-sm">{f.aum ? usd(f.aum) : "—"}</td>
                  <td className="td text-xs text-slate-600">{ago(last) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
