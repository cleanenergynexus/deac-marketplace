import "server-only";
import { db } from "@/lib/db";
import { parseTemplate, type ScreeningTemplate } from "@/lib/screening";

/** The saved screening template, or the DEAC default if nobody has edited it yet. */
export async function getScreeningTemplate(): Promise<ScreeningTemplate> {
  const row = await db.screeningTemplate.findUnique({ where: { id: "default" } });
  return parseTemplate(row?.config);
}
