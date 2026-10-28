import Link from "next/link";
import { db } from "@/lib/db";
import { saveInvestorPipeline } from "@/app/actions/investors";
import { FunnelEditor } from "@/components/FunnelEditor";
import { PageHeader } from "@/components/ui";
import { DEAL_TYPES } from "@/lib/constants";
import { DEFAULT_INVESTOR_PIPELINE, FUNNEL_KEYS, funnelKey, funnelStages, parsePipeline, placeStage } from "@/lib/pipeline";
import { PIPELINE_ROW } from "@/lib/pipeline-db";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InvestorFunnels({ searchParams }: { searchParams: Promise<{ funnel?: string }> }) {
  const sp = await searchParams;
  const [row, interests] = await Promise.all([
    db.pipelineSettings.findUnique({ where: { id: PIPELINE_ROW.investor } }),
    db.investorInterest.findMany({ select: { stage: true, project: { select: { dealType: true } } } }),
  ]);
  const cfg = parsePipeline(row?.config, DEFAULT_INVESTOR_PIPELINE);
  // Tiles per column, per funnel, so the editor can warn before a busy column is removed.
  const tiles: Record<string, Record<string, number>> = Object.fromEntries(FUNNEL_KEYS.map((k) => [k, {}]));
  for (const it of interests) {
    const t = tiles[funnelKey(it.project.dealType)], s = placeStage(funnelStages(cfg, it.project.dealType), it.stage);
    t[s] = (t[s] ?? 0) + 1;
  }
  const start = sp.funnel && FUNNEL_KEYS.includes(sp.funnel) ? sp.funnel : FUNNEL_KEYS[0];
  return (
    <div>
      <PageHeader
        title="Funnels"
        subtitle={<>The columns on the <Link href="/admin/investors" className="text-brand-600">Investor CRM board</Link>, one funnel per deal type. Rename, add, reorder or remove columns; renaming keeps every tile where it is. Signed NDAs, LOIs and diligence move tiles forward on their own into the starting NDA, LOI and diligence columns, even after you rename them. {row ? `Last saved ${date(row.updatedAt)}${row.updatedBy ? ` by ${row.updatedBy}` : ""}.` : "Not edited yet."}</>}
      />
      <FunnelEditor initial={cfg} defaults={DEFAULT_INVESTOR_PIPELINE} board="/admin/investors" funnels={DEAL_TYPES.map((d) => ({ value: d.value, label: d.label }))} start={start} tiles={tiles} action={saveInvestorPipeline} />
    </div>
  );
}
