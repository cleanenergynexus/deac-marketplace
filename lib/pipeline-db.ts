import "server-only";
import { db } from "@/lib/db";
import { parsePipeline, type PipelineConfig } from "@/lib/pipeline";

/** The saved Developer CRM funnels, or the original eight stages for every deal type if nobody has edited them yet. */
export async function getPipeline(): Promise<PipelineConfig> {
  const row = await db.pipelineSettings.findUnique({ where: { id: "default" } });
  return parsePipeline(row?.config);
}
