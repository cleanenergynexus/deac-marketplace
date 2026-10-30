"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { syncPrimaryContact } from "@/lib/contacts-db";
import { isLogKind, parseWhen } from "@/lib/crm";
import { phoneFromForm } from "@/lib/phone";
import { addressFromForm } from "@/lib/address";
import { findVisibleTask, getTeam, pickAssignee } from "@/lib/tasks-db";
import { referrerFromForm } from "@/lib/agents-db";

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;

function revalidateCrm(developerId: string, contactId?: string | null) {
  revalidatePath("/admin/developers", "layout");
  revalidatePath(`/admin/developers/${developerId}`);
  if (contactId) revalidatePath(`/admin/developers/contacts/${contactId}`);
}

/** After a timeline entry changes: refresh whichever CRM it belongs to (developer contact or investor). */
function revalidateEntry(a: { developerId: string | null; contactId: string | null; investorId: string | null }) {
  if (a.developerId) revalidateCrm(a.developerId, a.contactId);
  if (a.investorId) revalidatePath("/admin/investors", "layout");
}

function contactData(f: FormData) {
  const address = addressFromForm(f);
  // A number typed without a country code belongs to the contact's country.
  const home = address.country ?? "US";
  return {
    ...address,
    name: s(f, "name") ?? "",
    title: s(f, "title"),
    email: s(f, "email")?.toLowerCase() ?? null,
    phone: phoneFromForm(f, "phone", home),
    mobile: phoneFromForm(f, "mobile", home),
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
  const c = await db.contact.create({ data: { ...data, developerId, referredById: await referrerFromForm(f), owner: data.owner ?? admin.name, isPrimary: !hasPrimary || f.get("isPrimary") === "on" } });
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
  const c = await db.contact.update({ where: { id }, data: { ...data, referredById: await referrerFromForm(f) } });
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
  const assigneeId = kind === "TASK" ? pickAssignee(admin, await getTeam(), f.get("assigneeId")) : null;
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
      assigneeId,
      by: admin.name,
      ...(when && kind !== "TASK" ? { createdAt: when } : {}),
    },
  });
  revalidateCrm(c.developerId, contactId);
  if (kind === "TASK") revalidatePath("/admin", "layout");
}

export async function toggleTask(f: FormData) {
  const admin = await requireAdmin();
  const { task: a } = await findVisibleTask(admin, String(f.get("id")));
  if (a.kind !== "TASK") return;
  await db.activity.update({ where: { id: a.id }, data: { doneAt: a.doneAt ? null : new Date() } });
  revalidateEntry(a);
  revalidatePath("/admin", "layout");
}

/** Hands a task to another team member (within what this person can assign). */
export async function assignTask(f: FormData) {
  const admin = await requireAdmin();
  const { task: a, team } = await findVisibleTask(admin, String(f.get("id")));
  if (a.kind !== "TASK") return;
  const assigneeId = pickAssignee(admin, team, f.get("assigneeId") ?? "");
  await db.activity.update({ where: { id: a.id }, data: { assigneeId } });
  revalidateEntry(a);
  revalidatePath("/admin", "layout");
}

export async function deleteActivity(f: FormData) {
  const admin = await requireAdmin();
  const { task: a } = await findVisibleTask(admin, String(f.get("id")));
  if (!isLogKind(a.kind)) return; // stage changes and system entries stay as history
  await db.activity.delete({ where: { id: a.id } });
  revalidateEntry(a);
  if (a.kind === "TASK") revalidatePath("/admin", "layout");
}

/** New task from the Tasks page. Linking it to a contact and/or project puts it on that contact's timeline. */
export async function createTask(f: FormData) {
  const admin = await requireAdmin();
  const subject = s(f, "subject");
  if (!subject) throw new Error("Give the task a title.");
  const tz = Number(f.get("tz") ?? 0);
  const picked = s(f, "contactId");
  // Investor CRM contacts are listed as "inv:<id>" next to developer contacts.
  const investorId = picked?.startsWith("inv:") ? picked.slice(4) : null;
  const contactId = investorId ? null : picked;
  const projectId = s(f, "projectId");
  if (investorId && !(await db.investor.count({ where: { id: investorId } }))) throw new Error("That investor is no longer in the CRM.");
  const [contact, project] = await Promise.all([
    contactId ? db.contact.findUniqueOrThrow({ where: { id: contactId } }) : null,
    projectId ? db.project.findUniqueOrThrow({ where: { id: projectId } }) : null,
  ]);
  if (contact && project && contact.developerId !== project.developerId) throw new Error("That project is not at this contact's company.");
  // An investor task about a listing stays on the investor's timeline, not the developer's.
  const developerId = investorId ? null : contact?.developerId ?? project?.developerId ?? null;
  await db.activity.create({
    data: {
      kind: "TASK",
      subject,
      body: s(f, "body") ?? "",
      dueAt: parseWhen(s(f, "dueAt"), tz),
      assigneeId: pickAssignee(admin, await getTeam(), f.get("assigneeId")),
      // A project task with no contact goes on the project's contact's timeline.
      contactId: investorId ? null : contact?.id ?? project?.contactId ?? null,
      investorId,
      developerId,
      projectId: project?.id ?? null,
      by: admin.name,
    },
  });
  if (developerId) revalidateCrm(developerId, contact?.id ?? project?.contactId);
  if (investorId) revalidatePath("/admin/investors", "layout");
  revalidatePath("/admin", "layout");
}
