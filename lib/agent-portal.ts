import "server-only";
import { db } from "./db";
import { agentContactWhere, agentInvestorWhere, agentProjectWhere } from "./agents";
import { sortTasks } from "./tasks";

/** The agent's partner (name and how to reach them). */
export function getPartner(partnerId: string | null) {
  return partnerId ? db.user.findUnique({ where: { id: partnerId }, select: { name: true, email: true, phone: true, bookingUrl: true } }) : null;
}

/** "Meeting about" options: every contact this agent can see. */
export async function meetingOptions(agentId: string) {
  const [contacts, investors] = await Promise.all([
    db.contact.findMany({ where: agentContactWhere(agentId), select: { id: true, name: true, developer: { select: { company: true } } }, orderBy: { name: "asc" } }),
    db.investor.findMany({ where: agentInvestorWhere(agentId), select: { id: true, name: true, firm: true }, orderBy: { name: "asc" } }),
  ]);
  return [
    ...contacts.map((c) => ({ value: `dev:${c.id}`, label: `${c.name} · ${c.developer.company} (developer)` })),
    ...investors.map((i) => ({ value: `inv:${i.id}`, label: `${i.name}${i.firm ? ` · ${i.firm}` : ""} (investor)` })),
  ];
}

/** Links inside a read-only feed on the agent portal. */
export const AGENT_LINKS = {
  contact: (id: string) => `/agent/developers/${id}`,
  investor: (id: string) => `/agent/investors/${id}`,
  project: (id: string) => `/agent/listings/${id}`,
};

/**
 * Tasks the team assigned to this agent: open ones (soonest due first), then the last completed ones.
 * Each says whether the agent can open its contact / investor / project in their portal; the team may assign
 * a task about something the agent didn't refer, and then only its name shows.
 */
export async function agentTasks(agentId: string, { doneLimit = 20 }: { doneLimit?: number } = {}) {
  const include = {
    contact: { select: { id: true, name: true, developer: { select: { company: true } } } },
    investor: { select: { id: true, name: true, firm: true } },
    project: { select: { id: true, code: true, title: true } },
  } as const;
  const [open, done] = await Promise.all([
    db.activity.findMany({ where: { kind: "TASK", assigneeId: agentId, doneAt: null }, include }),
    doneLimit ? db.activity.findMany({ where: { kind: "TASK", assigneeId: agentId, doneAt: { not: null } }, include, orderBy: { doneAt: "desc" }, take: doneLimit }) : [],
  ]);
  const all = [...open, ...done];
  const ids = (k: "contactId" | "investorId" | "projectId") => [...new Set(all.map((t) => t[k]).filter((v): v is string => !!v))];
  const [contacts, investors, projects] = await Promise.all([
    db.contact.findMany({ where: { AND: [{ id: { in: ids("contactId") } }, agentContactWhere(agentId)] }, select: { id: true } }),
    db.investor.findMany({ where: { AND: [{ id: { in: ids("investorId") } }, agentInvestorWhere(agentId)] }, select: { id: true } }),
    db.project.findMany({ where: { AND: [{ id: { in: ids("projectId") } }, agentProjectWhere(agentId)] }, select: { id: true } }),
  ]);
  const can = { contact: new Set(contacts.map((c) => c.id)), investor: new Set(investors.map((i) => i.id)), project: new Set(projects.map((p) => p.id)) };
  return { open: sortTasks(open), done, can };
}
export type AgentTask = Awaited<ReturnType<typeof agentTasks>>["open"][number];
export type AgentTaskLinks = Awaited<ReturnType<typeof agentTasks>>["can"];
