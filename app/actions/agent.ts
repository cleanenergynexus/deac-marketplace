"use server";
// Actions a referral agent can take from their portal (/agent). Every action checks the agent may see what it touches.
import { codeRegion } from "@/lib/location";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkPassword, hashPassword, requireAgentToAct, PREVIEW_MESSAGE } from "@/lib/auth";
import { agentCompanyWhere, agentContactWhere, meetingRequest, referralSource } from "@/lib/agents";
import { agentProject } from "@/lib/agents-db";
import { cleanName, uniqueName } from "@/lib/dataroom";
import { verifyStored } from "@/lib/storage";
import { phoneFromForm } from "@/lib/phone";
import { firmIdFor } from "@/lib/investor-crm-db";
import { allStages, funnelStages, placeStage } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";
import { importedValuation, projectData } from "@/lib/project-form";
import { sendEmail } from "@/lib/email";
import { parseWhen } from "@/lib/crm";
import { notifyTaskAssignee } from "@/lib/task-mail";
import { AGENT_EDIT_FIELDS, agentAssigneeOptions, changesToData, diffListingEdit, editLabel, showValue } from "@/lib/listing-collab";
import { taskTeam } from "@/lib/listing-collab-db";
import { syncLinkedListings } from "@/lib/listing-links-db";

type State = { error?: string; ok?: boolean } | undefined;
type Agent = Awaited<ReturnType<typeof requireAgentToAct>>;

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;
/** The signed-in agent, or null during a team member's read-only preview. */
async function actor(): Promise<Agent | null> {
  try {
    return await requireAgentToAct();
  } catch (e) {
    if (e instanceof Error && e.message === PREVIEW_MESSAGE) return null;
    throw e;
  }
}
const appUrl = () => process.env.PUBLIC_APP_URL ?? "";

/** The agent's DEAC partner, if one is assigned. */
const partnerOf = (agent: Agent) => (agent.partnerId ? db.user.findUnique({ where: { id: agent.partnerId }, select: { id: true, name: true, email: true } }) : null);

/** A to-do for the agent's partner (unassigned, so Admins see it, when no partner is set), plus an email heads-up. */
async function taskForPartner(agent: Agent, task: { subject: string; body: string; contactId?: string | null; developerId?: string | null; investorId?: string | null; projectId?: string | null }) {
  const partner = await partnerOf(agent);
  await db.activity.create({ data: { kind: "TASK", ...task, assigneeId: partner?.id ?? null, by: agent.name, dueAt: new Date(Date.now() + 2 * 24 * 3600 * 1000) } });
  if (partner) await sendEmail({ to: partner.email, subject: task.subject, text: `${task.body}\n\nOpen your tasks: ${appUrl()}/admin/tasks\n\n— DEAC Marketplace` });
  revalidatePath("/admin", "layout");
}

// ---------- Referrals ----------

/** Refers a development company and its contact. A contact already in the CRM goes to the partner to confirm instead of being duplicated. */
export async function referDeveloper(_: State, f: FormData): Promise<State> {
  const agent = await actor();
  if (!agent) return { error: PREVIEW_MESSAGE };
  const company = s(f, "company");
  const name = s(f, "name");
  const email = s(f, "email")?.toLowerCase() ?? null;
  if (!company || !name) return { error: "Enter the company and the contact's name." };
  const phone = phoneFromForm(f, "phone");
  const partner = await partnerOf(agent);
  const notes = s(f, "notes");

  if (email && (await db.contact.count({ where: { email } }))) {
    await taskForPartner(agent, { subject: `Referral to confirm: ${name} (${company})`, body: `${agent.name} referred ${name} <${email}> at ${company}, who is already in the Developer CRM. Confirm the referral by setting "Referred by agent" on the contact.${notes ? `\n\nAgent's notes: ${notes}` : ""}` });
    return { ok: true };
  }
  const source = referralSource(agent.name);
  const stage = placeStage(allStages(await getPipeline()), null);
  const dev = await db.developer.create({
    data: {
      company, contactName: name, email: email ?? "", phone, website: s(f, "website"), source, stage, owner: partner?.name, referredById: agent.id, notes,
      contacts: { create: { name, title: s(f, "title"), email, phone, source, owner: partner?.name, isPrimary: true, referredById: agent.id } },
    },
    include: { contacts: { select: { id: true } } },
  });
  const contactId = dev.contacts[0].id;
  await db.activity.create({ data: { developerId: dev.id, contactId, kind: "SYSTEM", by: agent.name, body: `Referred by agent ${agent.name}.${notes ? ` Notes: ${notes}` : ""}` } });
  await taskForPartner(agent, { subject: `New developer referral: ${name} (${company})`, body: `${agent.name} referred ${name} at ${company}. Reach out and log the first touchpoint.`, contactId, developerId: dev.id });
  revalidatePath("/agent", "layout");
  revalidatePath("/admin/developers", "layout");
  return { ok: true };
}

/** Refers an investor contact. Emails are unique in the Investor CRM, so an existing one goes to the partner to confirm. */
export async function referInvestor(_: State, f: FormData): Promise<State> {
  const agent = await actor();
  if (!agent) return { error: PREVIEW_MESSAGE };
  const name = s(f, "name");
  const email = s(f, "email")?.toLowerCase();
  if (!name || !email) return { error: "Enter the investor's name and email." };
  const firm = s(f, "firm");
  const notes = s(f, "notes");
  if (await db.investor.count({ where: { email } })) {
    await taskForPartner(agent, { subject: `Referral to confirm: ${name}${firm ? ` (${firm})` : ""}`, body: `${agent.name} referred ${name} <${email}>, who is already in the Investor CRM. Confirm the referral by setting "Referred by agent" on the contact.${notes ? `\n\nAgent's notes: ${notes}` : ""}` });
    return { ok: true };
  }
  const partner = await partnerOf(agent);
  const investorType = s(f, "investorType");
  const firmId = await firmIdFor(firm, investorType);
  const inv = await db.investor.create({
    data: { name, email, firm, firmId, title: s(f, "title"), phone: phoneFromForm(f, "phone"), investorType, source: referralSource(agent.name), owner: partner?.name, notes, referredById: agent.id },
  });
  await db.activity.create({ data: { investorId: inv.id, kind: "SYSTEM", by: agent.name, body: `Referred by agent ${agent.name}.${notes ? ` Notes: ${notes}` : ""}` } });
  await taskForPartner(agent, { subject: `New investor referral: ${name}${firm ? ` (${firm})` : ""}`, body: `${agent.name} referred ${name}. Reach out and log the first touchpoint.`, investorId: inv.id });
  revalidatePath("/agent", "layout");
  revalidatePath("/admin/investors", "layout");
  return { ok: true };
}

// ---------- Meetings ----------

/** Asks the agent's DEAC partner for a meeting. It lands as a task for the partner, on the contact's timeline when one is picked. */
export async function requestMeeting(_: State, f: FormData): Promise<State> {
  const agent = await actor();
  if (!agent) return { error: PREVIEW_MESSAGE };
  const topic = s(f, "topic");
  if (!topic) return { error: "Say what the meeting is about." };
  const about = s(f, "about") ?? "";
  let link: { contactId?: string; developerId?: string; investorId?: string } = {};
  let label: string | null = null;
  if (about.startsWith("dev:")) {
    const c = await db.contact.findFirst({ where: { AND: [{ id: about.slice(4) }, agentContactWhere(agent.id)] }, include: { developer: { select: { company: true } } } });
    if (!c) return { error: "That contact isn't one of yours." };
    link = { contactId: c.id, developerId: c.developerId };
    label = `${c.name} (${c.developer.company})`;
  } else if (about.startsWith("inv:")) {
    const inv = await db.investor.findFirst({ where: { id: about.slice(4), referredById: agent.id } });
    if (!inv) return { error: "That contact isn't one of yours." };
    link = { investorId: inv.id };
    label = inv.firm ? `${inv.name} (${inv.firm})` : inv.name;
  }
  await taskForPartner(agent, { ...meetingRequest({ agentName: agent.name, about: label, topic, when: s(f, "when"), notes: s(f, "notes") }), ...link });
  revalidatePath("/agent", "layout");
  return { ok: true };
}

// ---------- Data room (upload only) ----------

/** Records a file the agent uploaded into a project's data room. Agents add files; they can't open, move or delete them. */
export async function agentRegisterFile(input: { projectId: string; folderId: string | null; name: string; storageKey: string; contentType?: string }): Promise<{ error?: string }> {
  const agent = await actor();
  if (!agent) return { error: PREVIEW_MESSAGE };
  const { projectId, folderId } = input;
  if (!(await agentProject(agent.id, projectId))) return { error: "That project isn't one of yours." };
  if (folderId && !(await db.dataRoomFolder.count({ where: { id: folderId, projectId } }))) return { error: "That folder no longer exists. Refresh the page." };
  const stored = await verifyStored(input.storageKey, projectId);
  if (!stored) return { error: `Upload of ${input.name} didn't complete. Try again.` };
  const [folders, files] = await Promise.all([
    db.dataRoomFolder.findMany({ where: { projectId, parentId: folderId }, select: { name: true } }),
    db.dataRoomFile.findMany({ where: { projectId, folderId }, select: { name: true } }),
  ]);
  const name = uniqueName(cleanName(input.name) || "Untitled", [...folders, ...files].map((x) => x.name));
  const contentType = (stored.contentType || input.contentType || "application/octet-stream").slice(0, 200);
  await db.dataRoomFile.create({ data: { projectId, folderId, name, size: stored.size, contentType, storageKey: input.storageKey, uploadedBy: `${agent.name} (referral agent)`, uploadedById: agent.id } });
  revalidatePath(`/agent/listings/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}/data-room`);
  return {};
}

/** Tells the partner once a batch of uploads is done, so new files get reviewed. */
export async function agentUploadsDone(projectId: string, names: string[]): Promise<void> {
  const agent = await requireAgentToAct();
  const p = await agentProject(agent.id, projectId);
  if (!p || !names.length) return;
  await db.activity.create({ data: { developerId: p.developerId, contactId: p.contactId, projectId, kind: "SYSTEM", by: agent.name, body: `${agent.name} added ${names.length} file${names.length === 1 ? "" : "s"} to the ${p.code} data room: ${names.slice(0, 10).join(", ")}${names.length > 10 ? "…" : ""}` } });
}

// ---------- Import a listing ----------

/** Last step of the import wizard for an agent: the listing is saved as a Draft for the DEAC team to review. */
export async function createAgentListing(f: FormData) {
  const agent = await requireAgentToAct();
  const partner = await partnerOf(agent);
  let developerId = String(f.get("developerId") ?? "");
  if (developerId === "__new__") {
    const company = s(f, "devCompany");
    if (!company) throw new Error("Enter the developer's company name.");
    const contactName = s(f, "devContactName");
    const email = s(f, "devEmail")?.toLowerCase() ?? null;
    const phone = phoneFromForm(f, "devPhone");
    const source = referralSource(agent.name);
    const dev = await db.developer.create({
      data: { company, contactName: contactName ?? company, email: email ?? "", phone, website: s(f, "devWebsite"), source, stage: "LEAD", owner: partner?.name, referredById: agent.id,
        contacts: contactName ? { create: { name: contactName, email, phone, source, owner: partner?.name, isPrimary: true, referredById: agent.id } } : undefined },
    });
    developerId = dev.id;
  } else if (!(await db.developer.count({ where: { AND: [{ id: developerId }, agentCompanyWhere(agent.id)] } }))) {
    throw new Error("Pick one of your companies, or add a new developer.");
  }
  f.set("developerId", developerId);
  const data = projectData(f);
  if (!data.country || !data.facilityType || !data.dealType || !data.projectStatus) throw new Error("Country, facility type, deal type and project status are required.");
  const valuationInputs = importedValuation(f, data);
  const count = await db.project.count();
  const pipelineStage = placeStage(funnelStages(await getPipeline(), data.dealType), null);
  // The DEAC team decides what investors see: agent listings always start as team-only drafts.
  const p = await db.project.create({ data: { ...data, visibility: "DRAFT", dealStage: "MARKETING", coverImageUrl: null, developerId, valuationInputs, pipelineStage, monthsToPower: data.monthsToPower ?? undefined, code: `DEAC-${codeRegion(data)}-${String(count + 1).padStart(3, "0")}` } });
  const source = s(f, "sourceName");
  const contacts = s(f, "contactsNote");
  await db.activity.create({ data: { developerId, projectId: p.id, kind: "SYSTEM", by: agent.name, body: `${p.code} imported by referral agent ${agent.name} from ${source ?? "a document"}.${contacts ? ` Contacts in the document: ${contacts}` : ""}` } });
  await taskForPartner(agent, { subject: `Review new listing from ${agent.name}: ${p.code}`, body: `${agent.name} imported ${p.code} · ${p.title} as a draft listing. Review it, score it and decide when to publish.`, developerId, projectId: p.id });
  revalidatePath("/admin/projects");
  revalidatePath("/agent", "layout");
  redirect(`/agent/listings/${p.id}?created=1`);
}

// ---------- Account ----------

export async function changeAgentPassword(_: State, f: FormData): Promise<State> {
  const agent = await actor();
  if (!agent) return { error: PREVIEW_MESSAGE };
  const next = String(f.get("next") ?? "");
  if (next.length < 10) return { error: "New password must be at least 10 characters." };
  if (!(await checkPassword(String(f.get("current") ?? ""), agent.passwordHash))) return { error: "Current password is incorrect." };
  await db.user.update({ where: { id: agent.id }, data: { passwordHash: await hashPassword(next) } });
  return { ok: true };
}

// ---------- Tasks ----------

/** Ticks off (or reopens) a task the team assigned to this agent. Completing one gives their DEAC partner a heads-up. */
export async function toggleAgentTask(f: FormData) {
  const agent = await actor();
  if (!agent) return; // read-only preview
  const t = await db.activity.findFirst({ where: { id: String(f.get("id")), kind: "TASK", assigneeId: agent.id } });
  if (!t) throw new Error("That task is not assigned to you.");
  const doneAt = t.doneAt ? null : new Date();
  await db.activity.update({ where: { id: t.id }, data: { doneAt } });
  if (doneAt) {
    const partner = await partnerOf(agent);
    if (partner && partner.id !== agent.id) {
      await sendEmail({ to: partner.email, toName: partner.name, subject: `${agent.name} completed a task: ${t.subject || "Task"}`, text: `${agent.name} marked "${t.subject || "Task"}" as done on the DEAC Marketplace.\n\nOpen your tasks: ${appUrl()}/admin/tasks\n\n— DEAC Marketplace` }).catch((e) => console.error("[agent] couldn't email the partner", e));
    }
  }
  revalidatePath("/agent", "layout");
  revalidatePath("/admin", "layout");
}

// ---------- Collaborating on a listing the agent brought in ----------

const revalidateListing = (projectId: string) => {
  revalidatePath(`/agent/listings/${projectId}`);
  revalidatePath("/agent", "layout");
  revalidatePath(`/admin/projects/${projectId}`);
};

/** A task on the agent's listing, for themselves or anyone on the DEAC team. The assignee gets an email. */
export async function agentCreateTask(_: State, f: FormData): Promise<State> {
  const agent = await actor();
  if (!agent) return { error: PREVIEW_MESSAGE };
  const p = await agentProject(agent.id, String(f.get("projectId") ?? ""));
  if (!p) return { error: "That listing isn't one of yours." };
  const subject = s(f, "subject");
  if (!subject) return { error: "Give the task a title." };
  const options = agentAssigneeOptions(agent, await taskTeam());
  const assigneeId = s(f, "assigneeId") ?? agent.id;
  if (!options.some((o) => o.id === assigneeId)) return { error: "Pick yourself or someone on the DEAC team." };
  const task = await db.activity.create({
    data: { kind: "TASK", subject: subject.slice(0, 200), body: (s(f, "body") ?? "").slice(0, 5000), dueAt: parseWhen(s(f, "dueAt"), Number(f.get("tz") ?? 0)), assigneeId, by: agent.name, developerId: p.developerId, projectId: p.id },
  });
  await notifyTaskAssignee(task, agent);
  revalidateListing(p.id);
  revalidatePath("/admin", "layout");
  return { ok: true };
}

/** Ticks off (or reopens) a task on the agent's listing that is theirs, or that they created. */
export async function toggleListingTask(f: FormData) {
  const agent = await actor();
  if (!agent) return;
  const t = await db.activity.findFirst({ where: { id: String(f.get("id")), kind: "TASK", projectId: { not: null } } });
  if (!t?.projectId || !(await agentProject(agent.id, t.projectId))) throw new Error("That task isn't on one of your listings.");
  if (t.assigneeId !== agent.id && t.by !== agent.name) throw new Error("You can tick off tasks assigned to you or that you created.");
  await db.activity.update({ where: { id: t.id }, data: { doneAt: t.doneAt ? null : new Date() } });
  revalidateListing(t.projectId);
  revalidatePath("/admin", "layout");
}

/** A message in the listing's discussion with the DEAC team. The agent's partner gets an email. */
export async function agentPostComment(_: State, f: FormData): Promise<State> {
  const agent = await actor();
  if (!agent) return { error: PREVIEW_MESSAGE };
  const p = await agentProject(agent.id, String(f.get("projectId") ?? ""));
  if (!p) return { error: "That listing isn't one of yours." };
  const body = s(f, "body")?.slice(0, 5000);
  if (!body) return { error: "Write a message first." };
  await db.listingComment.create({ data: { projectId: p.id, authorId: agent.id, authorName: agent.name, fromAgent: true, body } });
  const partner = await partnerOf(agent);
  if (partner) {
    await sendEmail({ to: partner.email, toName: partner.name, subject: `${agent.name} commented on ${p.code}`, text: `${agent.name} wrote on ${p.code} · ${p.title}:\n\n${body}\n\nReply on the listing: ${appUrl()}/admin/projects/${p.id}#collaboration\n\n— DEAC Marketplace` }).catch((e) => console.error("[agent] couldn't email the partner", e));
  }
  revalidateListing(p.id);
  return { ok: true };
}

/**
 * Saves the agent's edits to their listing's details. Only the fields in AGENT_EDIT_FIELDS can change; each save is
 * logged (old → new) on the listing and the project timeline, and the agent's partner gets an email.
 */
export async function agentEditListing(_: State, f: FormData): Promise<State> {
  const agent = await actor();
  if (!agent) return { error: PREVIEW_MESSAGE };
  const p = await agentProject(agent.id, String(f.get("projectId") ?? ""));
  if (!p) return { error: "That listing isn't one of yours." };
  const submitted = Object.fromEntries(AGENT_EDIT_FIELDS.filter((x) => f.has(x.key)).map((x) => [x.key, f.get(x.key)]));
  const { changes, invalid } = diffListingEdit(p, submitted);
  if (invalid.length) return { error: `Check ${invalid.join(", ")}.` };
  if (!changes.length) return { error: "Nothing changed." };
  const note = s(f, "note")?.slice(0, 1000) ?? null;
  const data = changesToData(changes);
  await db.project.update({ where: { id: p.id }, data });
  // Project facts (MW, location, status, power...) stay the same on linked Sale / Lease / Financing listings.
  for (const other of await syncLinkedListings(p.id, data)) revalidateListing(other);
  await db.listingEdit.create({ data: { projectId: p.id, agentId: agent.id, agentName: agent.name, changes: JSON.stringify(changes), note } });
  const lines = changes.map((c) => `${editLabel(c.field)}: ${showValue(c.field, c.from)} → ${showValue(c.field, c.to)}`);
  await db.activity.create({ data: { developerId: p.developerId, projectId: p.id, kind: "SYSTEM", by: agent.name, body: `${agent.name} edited the ${p.code} listing: ${changes.map((c) => editLabel(c.field)).join(", ")}.${note ? ` Note: ${note}` : ""}` } });
  const partner = await partnerOf(agent);
  if (partner) {
    await sendEmail({ to: partner.email, toName: partner.name, subject: `${agent.name} edited ${p.code}`, text: `${agent.name} changed ${p.code} · ${p.title}:\n\n${lines.map((l) => `• ${l}`).join("\n")}${note ? `\n\nNote: ${note}` : ""}\n\nReview it: ${appUrl()}/admin/projects/${p.id}#collaboration\n\n— DEAC Marketplace` }).catch((e) => console.error("[agent] couldn't email the partner", e));
  }
  revalidateListing(p.id);
  revalidatePath("/marketplace", "layout");
  return { ok: true };
}
