import Link from "next/link";
import { placeShort } from "@/lib/location";
import { db } from "@/lib/db";
import { requireAgent } from "@/lib/auth";
import { agentProjectWhere } from "@/lib/agents";
import { Badge, Empty, PageHeader, Section, statusTone } from "@/components/ui";
import { num, usd } from "@/lib/format";
import { projectStageLabel } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";

export const dynamic = "force-dynamic";

const VIS: Record<string, string> = { DRAFT: "Draft (DEAC review)", PRIVATE: "Live to investors", TEASER: "Live + public teaser" };

export default async function AgentListings() {
  const me = await requireAgent();
  const [projects, pipeline] = await Promise.all([
    db.project.findMany({ where: agentProjectWhere(me.id), include: { developer: { select: { company: true, stage: true } }, _count: { select: { dataRoomFiles: true } } }, orderBy: { createdAt: "desc" } }),
    getPipeline(),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Listings & data rooms" subtitle="Projects of the developers you referred. Add documents to a project's data room, or import a new listing." action={<Link href="/agent/import" className="btn">Import a listing</Link>} />
      <Section title={`Listings (${projects.length})`}>
        {projects.length ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Project</th><th className="th">Developer</th><th className="th">Size</th><th className="th">Stage</th><th className="th">Status</th><th className="th">Data room</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {projects.map((p) => (
                  <tr key={p.id}>
                    <td className="td"><Link href={`/agent/listings/${p.id}`} className="font-medium text-brand-600">{p.title}</Link><div className="font-mono text-xs text-slate-500">{p.code}</div></td>
                    <td className="td">{p.developer.company}</td>
                    <td className="td text-sm">{num(p.mw)} MW · {placeShort(p)}<div className="text-xs text-slate-500">{usd(p.fundingNeeded)}</div></td>
                    <td className="td text-sm">{projectStageLabel(pipeline, p, p.developer.stage)}</td>
                    <td className="td"><Badge tone={statusTone(p.visibility)}>{VIS[p.visibility] ?? p.visibility}</Badge></td>
                    <td className="td"><Link href={`/agent/listings/${p.id}#data-room`} className="btn-ghost">{p._count.dataRoomFiles} file{p._count.dataRoomFiles === 1 ? "" : "s"} · Upload</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No listings yet. <Link href="/agent/import" className="text-brand-600">Import one</Link> from a teaser, offering memo or web page.</Empty>}
      </Section>
    </div>
  );
}
