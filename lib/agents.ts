// Referral agents: outside partners who bring developer and investor contacts to DEAC.
// An agent signs in to /agent and sees only what they referred, read-only, plus the activity on it.
// No database access here (see lib/agents-db.ts).
import type { Prisma } from "@prisma/client";

export const AGENT_STATUSES = [
  { value: "APPROVED", label: "Active" },
  { value: "SUSPENDED", label: "Suspended" },
] as const;
export const isAgentStatus = (v: unknown): v is (typeof AGENT_STATUSES)[number]["value"] => AGENT_STATUSES.some((s) => s.value === v);
export const agentStatusLabel = (v: string) => AGENT_STATUSES.find((s) => s.value === v)?.label ?? v;

/**
 * Developer companies an agent can see: ones they referred, and companies of contacts they referred.
 * Every project of a visible company is visible too (that's what the agent is helping sell).
 */
export function agentCompanyWhere(agentId: string): Prisma.DeveloperWhereInput {
  return { OR: [{ referredById: agentId }, { contacts: { some: { referredById: agentId } } }] };
}

/** Developer contacts an agent can see: ones they referred, and everyone at a company they referred. */
export function agentContactWhere(agentId: string): Prisma.ContactWhereInput {
  return { OR: [{ referredById: agentId }, { developer: { referredById: agentId } }] };
}

/** Investor contacts an agent can see: only the ones they referred. */
export function agentInvestorWhere(agentId: string): Prisma.InvestorWhereInput {
  return { referredById: agentId };
}

/** Projects (listings) an agent can see: every project of a company they can see. */
export function agentProjectWhere(agentId: string): Prisma.ProjectWhereInput {
  return { developer: agentCompanyWhere(agentId) };
}

/**
 * Timeline entries an agent sees for one developer contact. Mirrors the team's contact record:
 * the primary contact also carries company-wide entries that aren't tied to a person.
 */
export function contactActivityWhere(contact: { id: string; developerId: string; isPrimary: boolean }): Prisma.ActivityWhereInput {
  return { OR: [{ contactId: contact.id }, ...(contact.isPrimary ? [{ developerId: contact.developerId, contactId: null }] : [])] };
}

/** Everything an agent can see across all their contacts (for their overview feed). */
export function agentActivityWhere(agentId: string): Prisma.ActivityWhereInput {
  return {
    OR: [
      { contact: agentContactWhere(agentId) },
      // Company-wide entries (no contact) on companies the agent referred.
      { contactId: null, investorId: null, developer: { referredById: agentId } },
      { investor: agentInvestorWhere(agentId) },
    ],
  };
}

/** Pure check used by tests and server actions: may this agent see that developer contact? */
export function canSeeContact(agentId: string, c: { referredById: string | null; developer: { referredById: string | null } }): boolean {
  return c.referredById === agentId || c.developer.referredById === agentId;
}

/** Pure check: may this agent see (and upload into the data room of) that company's projects? */
export function canSeeCompany(agentId: string, d: { referredById: string | null; contacts: { referredById: string | null }[] }): boolean {
  return d.referredById === agentId || d.contacts.some((c) => c.referredById === agentId);
}

/** Task text for a meeting request an agent sends their DEAC partner. */
export function meetingRequest(input: { agentName: string; about?: string | null; topic: string; when?: string | null; notes?: string | null }) {
  const subject = `Meeting request from ${input.agentName}${input.about ? ` · ${input.about}` : ""}`;
  const body = [
    `Topic: ${input.topic}`,
    input.when ? `Preferred times: ${input.when}` : null,
    input.notes ? `\n${input.notes}` : null,
    `\nRequested by referral agent ${input.agentName}. Schedule it and log the meeting on this contact.`,
  ].filter(Boolean).join("\n");
  return { subject, body };
}

/** "Referral: Jane Smith" — the Source value written on contacts an agent submits. */
export const referralSource = (agentName: string) => `Referral: ${agentName}`;
