import "server-only";
import { db } from "./db";
import { agentProjectWhere } from "./agents";

/** Referral agents for the "Referred by" pickers on CRM forms. */
export function getAgents() {
  return db.user.findMany({ where: { role: "AGENT" }, select: { id: true, name: true, company: true }, orderBy: { name: "asc" } });
}

/**
 * Reads the "Referred by" picker on a CRM form. undefined = the form has no picker (leave as is),
 * null = nobody, otherwise the id of an existing referral agent.
 */
export async function referrerFromForm(f: FormData): Promise<string | null | undefined> {
  if (!f.has("referredById")) return undefined;
  const id = String(f.get("referredById") ?? "").trim();
  if (!id) return null;
  if (!(await db.user.count({ where: { id, role: "AGENT" } }))) throw new Error("That referral agent no longer exists.");
  return id;
}

/** The project, if this agent may see it (it belongs to a company they referred or have a contact at). */
export function agentProject(agentId: string, projectId: string) {
  return db.project.findFirst({ where: { AND: [{ id: projectId }, agentProjectWhere(agentId)] } });
}
