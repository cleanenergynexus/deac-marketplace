import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, PageHeader, Empty } from "@/components/ui";
import { DEVELOPER_STAGES, stageLabel } from "@/lib/constants";
import { num } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Developers({ searchParams }: { searchParams: Promise<{ stage?: string; view?: string }> }) {
  const sp = await searchParams;
  const devs = await db.developer.findMany({ where: sp.stage ? { stage: sp.stage } : {}, orderBy: { updatedAt: "desc" }, include: { projects: { select: { mw: true, valueScore: true } } } });
  const board = sp.view !== "table";
  return (
    <div>
      <PageHeader title="Developer CRM" subtitle={`${devs.length} developers`} action={
        <div className="flex gap-2">
          <Link href={board ? "?view=table" : "?"} className="btn-ghost">{board ? "Table view" : "Board view"}</Link>
          <Link href="/admin/developers/new" className="btn">Add developer</Link>
        </div>} />
      {!devs.length ? <Empty>No developers yet.</Empty> : board ? (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {DEVELOPER_STAGES.map((s) => {
            const col = devs.filter((d) => d.stage === s.value);
            return (
              <div key={s.value} className="w-60 shrink-0 rounded-lg bg-slate-100 p-2">
                <div className="mb-2 flex justify-between px-1 text-xs font-semibold uppercase text-slate-500"><span>{s.label}</span><span>{col.length}</span></div>
                <div className="space-y-2">
                  {col.map((d) => {
                    const best = Math.max(0, ...d.projects.map((p) => p.valueScore ?? 0));
                    return (
                      <Link key={d.id} href={`/admin/developers/${d.id}`} className="card block p-3 text-sm hover:shadow">
                        <div className="font-semibold">{d.company}</div>
                        <div className="text-xs text-slate-500">{d.contactName}</div>
                        <div className="mt-2 flex items-center justify-between text-xs"><span>{d.projects.length} proj · {num(d.projects.reduce((a, p) => a + p.mw, 0))} MW</span>{best > 0 && <Badge tone={best >= 70 ? "green" : best >= 50 ? "amber" : "red"}>Score {best}</Badge>}</div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full"><thead className="border-b border-slate-200"><tr><th className="th">Company</th><th className="th">Contact</th><th className="th">Projects</th><th className="th">MW</th><th className="th">Stage</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{devs.map((d) => (
              <tr key={d.id}><td className="td"><Link href={`/admin/developers/${d.id}`} className="font-medium text-brand-600">{d.company}</Link></td><td className="td">{d.contactName}<div className="text-xs text-slate-500">{d.email}</div></td><td className="td">{d.projects.length}</td><td className="td">{num(d.projects.reduce((a, p) => a + p.mw, 0))}</td><td className="td"><Badge>{stageLabel(DEVELOPER_STAGES, d.stage)}</Badge></td></tr>
            ))}</tbody></table>
        </div>
      )}
    </div>
  );
}
