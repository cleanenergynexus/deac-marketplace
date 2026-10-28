import "server-only";
import { db } from "@/lib/db";

/**
 * Developers saved before contact records existed have their one contact on the company row.
 * Turns that into a primary Contact the first time a CRM page loads. Safe to call on every request.
 */
export async function ensureContacts(developerId?: string) {
  const missing = await db.developer.findMany({
    where: { ...(developerId ? { id: developerId } : {}), contacts: { none: {} } },
    select: { id: true, company: true, contactName: true, email: true, phone: true, owner: true, source: true },
  });
  for (const d of missing) {
    await db.contact.create({
      data: { developerId: d.id, name: d.contactName || `${d.company} contact`, email: d.email || null, phone: d.phone, owner: d.owner, source: d.source, isPrimary: true },
    });
  }
}

/** Copies the primary contact onto the company row, which older screens (listing sponsor, imports) still read. */
export async function syncPrimaryContact(developerId: string) {
  const c = await db.contact.findFirst({ where: { developerId }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] });
  if (!c) return;
  if (!c.isPrimary) await db.contact.update({ where: { id: c.id }, data: { isPrimary: true } });
  await db.developer.update({ where: { id: developerId }, data: { contactName: c.name, email: c.email ?? "", phone: c.phone } });
}

const LOGGED = ["NOTE", "EMAIL", "CALL", "MEETING", "TASK"];

/** Everything the Developer CRM lists need: companies with their contacts and projects, plus last touch and open tasks per contact. */
export async function loadCrm() {
  await ensureContacts();
  const [developers, touches, tasks] = await Promise.all([
    db.developer.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
        projects: { select: { id: true, code: true, title: true, mw: true, state: true, fundingNeeded: true, valueScore: true, dealType: true, pipelineStage: true, contactId: true, visibility: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    db.activity.groupBy({ by: ["contactId"], where: { contactId: { not: null }, kind: { in: LOGGED } }, _max: { createdAt: true } }),
    db.activity.groupBy({ by: ["contactId"], where: { contactId: { not: null }, kind: "TASK", doneAt: null }, _count: true }),
  ]);
  const lastTouch = new Map(touches.map((t) => [t.contactId!, t._max.createdAt]));
  const openTasks = new Map(tasks.map((t) => [t.contactId!, t._count]));
  return { developers, lastTouch, openTasks };
}
export type CrmDeveloper = Awaited<ReturnType<typeof loadCrm>>["developers"][number];
