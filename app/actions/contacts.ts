"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { syncPrimaryContact } from "@/lib/contacts-db";
import { isLogKind, parseWhen } from "@/lib/crm";

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;

function revalidateCrm(developerId: string, contactId?: string | null) {
  revalidatePath("/admin/developers", "layout");
  revalidatePath(`/admin/developers/${developerId}`);
  if (contactId) revalidatePath(`/admin/developers/contacts/${contactId}`);
}

function contactData(f: FormData) {
  return {
    name: s(f, "name") ?? "",
    title: s(f, "title"),
    email: s(f, "email")?.toLowerCase() ?? null,
    phone: s(f, "phone"),
    mobile: s(f, "mobile"),
    linkedin: s(f, "linkedin"),
    location: s(f, "location"),
    source: s(f, "source"),
    owner: s(f, "owner"),
    notes: s(f, "notes"),
  };
}

export async function createContact(f: FormData) {
  const admin = await requireAdmin();
  const developerId = String(f.get("developerId"));
  const data = contactData(f);
  if (!data.name) throw new Error("Enter the contact's name.");
  const hasPrimary = await db.contact.count({ where: { developerId, isPrimary: true } });
  const c = await db.contact.create({ data: { ...data, developerId, owner: data.owner ?? admin.name, isPrimary: !hasPrimary || f.get("isPrimary") === "on" } });
  if (c.isPrimary) {
    await db.contact.updateMany({ where: { developerId, id: { not: c.id } }, data: { isPrimary: false } });
    await syncPrimaryContact(developerId);
  }
  revalidateCrm(developerId);
  redirect(`/admin/developers/contacts/${c.id}`);
}

export async function updateContact(f: FormData) {
  await requireAdmin();
  const id = String(f.get("id"));
  const data = contactData(f);
  if (!data.name) throw new Error("Enter the contact's name.");
  const c = await db.contact.update({ where: { id }, data });
  if (c.isPrimary) await syncPrimaryContact(c.developerId);
  revalidateCrm(c.developerId, id);
}

export async function makePrimaryContact(f: FormData) {
  await requireAdmin();
  const id = String(f.get("id"));
  const c = await db.contact.findUniqueOrThrow({ where: { id } });
  await db.$transaction([
    db.contact.updateMany({ where: { developerId: c.developerId }, data: { isPrimary: false } }),
    db.contact.update({ where: { id }, data: { isPrimary: true } }),
  ]);
  await syncPrimaryContact(c.developerId);
  revalidateCrm(c.developerId, id);
}

/** Removes a contact. Their logged activity stays on the company; their projects move to the primary contact. */
export async function deleteContact(f: FormData) {
  await requireAdmin();
  const id = String(f.get("id"));
  const c = await db.contact.findUniqueOrThrow({ where: { id } });
  const others = await db.contact.count({ where: { developerId: c.developerId, id: { not: id } } });
  if (!others) throw new Error("A company needs at least one contact. Add another contact first.");
  await db.contact.delete({ where: { id } });
  await syncPrimaryContact(c.developerId);
  revalidateCrm(c.developerId);
  redirect(`/admin/developers/${c.developerId}`);
}

/** Point of contact for a project. Empty value = the company's primary contact. */
export async function setProjectContact(f: FormData) {
  await requireAdmin();
  const projectId = String(f.get("projectId"));
  const contactId = s(f, "contactId");
  const p = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  if (contactId && !(await db.contact.count({ where: { id: contactId, developerId: p.developerId } }))) throw new Error("That contact is not at this project's company.");
  await db.project.update({ where: { id: projectId }, data: { contactId } });
  revalidateCrm(p.developerId, contactId);
}

/** Logs a note, email, call, meeting or task against a contact (HubSpot-style timeline). */
export async function logContactActivity(f: FormData) {
  const admin = await requireAdmin();
  const contactId = String(f.get("contactId"));
  const kind = s(f, "kind");
  if (!isLogKind(kind)) throw new Error("Pick what you're logging.");
  const c = await db.contact.findUniqueOrThrow({ where: { id: contactId } });
  const subject = s(f, "subject");
  const body = s(f, "body") ?? "";
  if (kind === "TASK" ? !subject : !body && !subject) throw new Error(kind === "TASK" ? "Give the task a title." : "Write something to log.");
  const tz = Number(f.get("tz") ?? 0);
  const when = parseWhen(s(f, "when"), tz);
  const projectId = s(f, "projectId");
  if (projectId && !(await db.project.count({ where: { id: projectId, developerId: c.developerId } }))) throw new Error("That project is not at this contact's company.");
  await db.activity.create({
    data: {
      developerId: c.developerId,
      contactId,
      projectId,
      kind,
      subject,
      body,
      outcome: kind === "CALL" || kind === "EMAIL" ? s(f, "outcome") : null,
      dueAt: kind === "TASK" ? parseWhen(s(f, "dueAt"), tz) : null,
      by: admin.name,
      ...(when && kind !== "TASK" ? { createdAt: when } : {}),
    },
  });
  revalidateCrm(c.developerId, contactId);
}

export async function toggleTask(f: FormData) {
  await requireAdmin();
  const id = String(f.get("id"));
  const a = await db.activity.findUniqueOrThrow({ where: { id } });
  if (a.kind !== "TASK") return;
  await db.activity.update({ where: { id }, data: { doneAt: a.doneAt ? null : new Date() } });
  if (a.developerId) revalidateCrm(a.developerId, a.contactId);
}

export async function deleteActivity(f: FormData) {
  await requireAdmin();
  const a = await db.activity.findUniqueOrThrow({ where: { id: String(f.get("id")) } });
  if (!isLogKind(a.kind)) return; // stage changes and system entries stay as history
  await db.activity.delete({ where: { id: a.id } });
  if (a.developerId) revalidateCrm(a.developerId, a.contactId);
}
