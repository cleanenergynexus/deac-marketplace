import Link from "next/link";
import { db } from "@/lib/db";
import { savePipeline } from "@/app/actions/admin";
import { FunnelEditor } from "@/components/FunnelEditor";
import { PageHeader } from "@/components/ui";
import { DEAL_TYPES } from "@/lib/constants";
import { FUNNEL_KEYS, funnelKey, parsePipeline, projectStage } from "@/lib/pipeline";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Funnels({ searchParams }: { searchParams: Promise<{ funnel?: string }> }) {
  const sp = await searchParams;
  const [row, projects] = await Promise.all([
    db.pipelineSettings.findUnique({ where: { id: "default" } }),
    db.project.findMany({ select: { dealType: true, pipelineStage: true, developer: { select: { stage: true } } } }),
  ]);
  const cfg = parsePipeline(row?.config);
  // Tiles per column, per funnel, so the editor can warn before a busy column is removed.
  const tiles: Record<string, Record<string, number>> = Object.fromEntries(FUNNEL_KEYS.map((k) => [k, {}]));
  for (const p of projects) {
    const t = tiles[funnelKey(p.dealType)], s = projectStage(cfg, p, p.developer.stage);
    t[s] = (t[s] ?? 0) + 1;
  }
  const start = sp.funnel && FUNNEL_KEYS.includes(sp.funnel) ? sp.funnel : FUNNEL_KEYS[0];
  return (
    <div>
      <PageHeader
        title="Funnels"
        subtitle={<>The columns on the <Link href="/admin/developers" className="text-brand-600">Developer CRM board</Link>, one funnel per deal type. Rename, add, reorder or remove columns; renaming keeps every tile where it is. {row ? `Last saved ${date(row.updatedAt)}${row.updatedBy ? ` by ${row.updatedBy}` : ""}.` : "Not edited yet."}</>}
      />
      <FunnelEditor initial={cfg} funnels={DEAL_TYPES.map((d) => ({ value: d.value, label: d.label }))} start={start} tiles={tiles} action={savePipeline} />
    </div>
  );
}
