import "server-only";
import { db } from "@/lib/db";
import { DEFAULT_INVESTOR_PIPELINE, parsePipeline, type PipelineConfig } from "@/lib/pipeline";

/** PipelineSettings rows: one per CRM. */
export const PIPELINE_ROW = { developer: "default", investor: "investor" } as const;

/** The saved Developer CRM funnels, or the original eight stages for every deal type if nobody has edited them yet. */
export async function getPipeline(): Promise<PipelineConfig> {
  const row = await db.pipelineSettings.findUnique({ where: { id: PIPELINE_ROW.developer } });
  return parsePipeline(row?.config);
}

/** The saved Investor CRM funnels, or the starting investor journey for every deal type. */
export async function getInvestorPipeline(): Promise<PipelineConfig> {
  const row = await db.pipelineSettings.findUnique({ where: { id: PIPELINE_ROW.investor } });
  return parsePipeline(row?.config, DEFAULT_INVESTOR_PIPELINE);
}
