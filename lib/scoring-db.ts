import "server-only";
import { db } from "@/lib/db";
import { parseScoring, type ScoringConfig } from "@/lib/scoring";

/** The saved scoring model, or the workbook defaults if nobody has edited it yet. */
export async function getScoring(): Promise<ScoringConfig> {
  const row = await db.scoringSettings.findUnique({ where: { id: "default" } });
  return parseScoring(row?.config);
}
