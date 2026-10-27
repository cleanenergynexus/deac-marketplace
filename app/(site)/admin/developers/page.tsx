import Link from "next/link";
import { db } from "@/lib/db";
import { Badge, PageHeader, Empty } from "@/components/ui";
import { PipelineBoard, type BoardCard } from "@/components/PipelineBoard";
import { DEVELOPER_STAGES, projectPipelineStage, stageLabel } from "@/lib/constants";
import { num } from "@/lib/format";
import { recommendation } from "@/lib/valuation";
import { getScoring } from "@/lib/scoring-db";

export const dynamic = "force-dynamic";

export default async function Developers({ searchParams }: { searchParams: Promise<{ stage?: string; view?: string }> }) {
  const sp = await searchParams;
  const devs = await db.developer.findMany({
    orderBy: { updatedAt: "desc" },
    include: { projects: { select: { id: true, code: true, title: true, mw: true, valueScore: true, pipelineStage: true }, orderBy: { createdAt: "asc" } } },
  });
  const board = sp.view !== "table";
  const scoring = await getScoring();

  // One tile per project, so each one moves through the pipeline on its own.
  // Developers without a project yet keep a tile of their own so they don't drop off the board.
  const cards: BoardCard[] = devs.flatMap((d): BoardCard[] =>
    d.projects.length
      ? d.projects.map((p) => ({ kind: "project", id: p.id, stage: projectPipelineStage(p, d.stage), title: p.title, code: p.code, mw: p.mw, score: p.valueScore, scoreTone: p.valueScore != null ? recommendation(p.valueScore, scoring).tone : undefined, developerId: d.id, company: d.company, siblings: d.projects.length }))
      : [{ kind: "developer", id: d.id, stage: d.stage, company: d.company, contactName: d.contactName }],
  ).filter((c) => !sp.stage || c.stage === sp.stage);
  const projectCount = devs.reduce((a, d) => a + d.projects.length, 0);

  return (
    <div>
      <PageHeader title="Developer CRM" subtitle={`${devs.length} developers · ${projectCount} projects${sp.stage ? ` · ${stageLabel(DEVELOPER_STAGES, sp.stage)}` : ""}`} action={
        <div className="flex gap-2">
          {sp.stage && <Link href={board ? "?" : "?view=table"} className="btn-ghost">All stages</Link>}
          <Link href={board ? "?view=table" : "?"} className="btn-ghost">{board ? "Table view" : "Board view"}</Link>
          <Link href="/admin/developers/new" className="btn">Add developer</Link>
        </div>} />
      {!devs.length ? <Empty>No developers yet.</Empty> : board ? (
        <>
          <p className="mb-3 text-sm text-slate-500">Each project has its own tile. Drag a tile to another column, or pick a stage on the tile. Dashed tiles are developers with no project yet.</p>
          <PipelineBoard cards={cards} />
        </>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full"><thead className="border-b border-slate-200"><tr><th className="th">Company</th><th className="th">Contact</th><th className="th">Projects & stages</th><th className="th">MW</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{devs.filter((d) => !sp.stage || cards.some((c) => (c.kind === "project" ? c.developerId : c.id) === d.id)).map((d) => (
              <tr key={d.id}>
                <td className="td align-top"><Link href={`/admin/developers/${d.id}`} className="font-medium text-brand-600">{d.company}</Link></td>
                <td className="td align-top">{d.contactName}<div className="text-xs text-slate-500">{d.email}</div></td>
                <td className="td">
                  {d.projects.length ? (
                    <ul className="space-y-1">{d.projects.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 text-sm"><Link href={`/admin/projects/${p.id}`} className="text-brand-600">{p.title}</Link><Badge>{stageLabel(DEVELOPER_STAGES, projectPipelineStage(p, d.stage))}</Badge></li>
                    ))}</ul>
                  ) : <span className="text-sm text-slate-500">No projects · <Badge>{stageLabel(DEVELOPER_STAGES, d.stage)}</Badge></span>}
                </td>
                <td className="td align-top">{num(d.projects.reduce((a, p) => a + p.mw, 0))}</td>
              </tr>
            ))}</tbody></table>
        </div>
      )}
    </div>
  );
}
