import "server-only";
import { db } from "./db";
import { parseChanges } from "./listing-collab";

/** Active referral agents who brought this project in: they referred its developer company or a contact there. */
export function listingAgents(developerId: string) {
  return db.user.findMany({
    where: { role: "AGENT", status: "APPROVED", OR: [{ referredDevelopers: { some: { id: developerId } } }, { referredContacts: { some: { developerId } } }] },
    select: { id: true, name: true, email: true, partnerId: true },
    orderBy: { name: "asc" },
  });
}

/** The listing's discussion (oldest first) and the referral agents' edit log (newest first). */
export async function listingCollab(projectId: string) {
  const [comments, edits] = await Promise.all([
    db.listingComment.findMany({ where: { projectId }, orderBy: { createdAt: "asc" }, take: 200 }),
    db.listingEdit.findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { comments, edits: edits.map((e) => ({ ...e, changes: parseChanges(e.changes) })) };
}
export type ListingCollab = Awaited<ReturnType<typeof listingCollab>>;

/** Team logins a referral agent can assign a task to. */
export function taskTeam() {
  return db.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}
