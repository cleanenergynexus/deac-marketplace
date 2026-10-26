import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, PageHeader, Empty, statusTone } from "@/components/ui";
import { dealTypeLabel } from "@/lib/constants";
import { usd, num } from "@/lib/format";
import { recommendation } from "@/lib/valuation";

export const dynamic = "force-dynamic";

export default async function Projects({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const sp = await searchParams;
  const ps = await db.project.findMany({ include: { developer: true, _count: { select: { lois: true } } }, orderBy: sp.sort === "score" ? { valueScore: "desc" } : { updatedAt: "desc" } });
  return (
    <div>
      <PageHeader title="Listings & leads" subtitle="Every project, from scored lead to live listing." action={<Link href="/admin/projects/new" className="btn">New listing</Link>} />
      {ps.length ? (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Code</th><th className="th">Project</th><th className="th">Developer</th><th className="th">MW</th><th className="th">Type</th><th className="th">Raise</th><th className="th"><Link href="?sort=score">Score ↓</Link></th><th className="th">LOIs</th><th className="th">Visibility</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{ps.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="td font-mono text-xs">{p.code}</td>
                <td className="td"><Link href={`/admin/projects/${p.id}`} className="font-medium text-brand-600">{p.title}</Link><div className="text-xs text-slate-500">{dealTypeLabel(p.dealType)} · {p.state}</div></td>
                <td className="td text-sm">{p.developer.company}</td>
                <td className="td">{num(p.mw, 1)}</td>
                <td className="td text-xs">{p.facilityType}</td>
                <td className="td">{usd(p.fundingNeeded)}</td>
                <td className="td">{p.valueScore != null ? <Badge tone={recommendation(p.valueScore).tone}>{p.valueScore} {recommendation(p.valueScore).label}</Badge> : <span className="text-xs text-slate-400">unscored</span>}</td>
                <td className="td">{p._count.lois}</td>
                <td className="td"><Badge tone={statusTone(p.visibility)}>{p.visibility}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <Empty>No listings yet.</Empty>}
    </div>
  );
}
