import "server-only";
import { db } from "./db";
import { agentContactWhere, agentInvestorWhere } from "./agents";

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
