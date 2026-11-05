import "server-only";
// Technical Support inbox (Team → Technical Support): one team member whose email is the support address.
// Every email to it becomes a task assigned to them, linked to the CRM contact who sent it when there is one.
import { db } from "./db";
import { attachmentNames, header, messageText, type GmailMessage } from "./gmail";
import { gmail, listIds } from "./gmail-db";
import { appendReply, CHECK_EVERY_MS, emailBlock, skipReason, supportQuery, supportSender, supportSince, supportTaskTitle } from "./support";

/** The team member who is the support inbox, with their linked Gmail. Null when nobody is. */
export async function getSupportMember() {
  return db.user.findFirst({
    where: { role: "ADMIN", supportInbox: true },
    select: { id: true, name: true, email: true, supportSince: true, gmail: true },
    orderBy: { supportSince: "desc" },
  });
}

/** The support address shown in emails: the Technical Support member's Gmail (or login email), else SUPPORT_EMAIL, else the default. */
export async function supportAddress(): Promise<string | null> {
  const m = await getSupportMember();
  return m ? (m.gmail?.email ?? m.email) : null;
}

/** Makes this team member the support inbox (null turns it off). Email from now on becomes tasks. */
export async function setSupportMember(userId: string | null) {
  await db.$transaction([
    db.user.updateMany({ where: { supportInbox: true, ...(userId ? { id: { not: userId } } : {}) }, data: { supportInbox: false, supportSince: null } }),
    ...(userId ? [db.user.updateMany({ where: { id: userId, role: "ADMIN", supportInbox: false }, data: { supportInbox: true, supportSince: new Date() } })] : []),
  ]);
}

/** CRM person who sent the email: an investor contact or a developer contact, matched by address. */
async function findSender(email: string) {
  const investor = await db.investor.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true } });
  if (investor) return { investorId: investor.id };
  const contact = await db.contact.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { id: true, developerId: true } });
  if (contact) return { contactId: contact.id, developerId: contact.developerId };
  return {};
}

/** Turns one email into a task, or adds it to the open task for the same conversation. Returns 1 when a task was created. */
async function fileEmail(mailbox: string, assigneeId: string, m: GmailMessage): Promise<number> {
  if (await db.supportEmail.findUnique({ where: { mailbox_gmailMessageId: { mailbox, gmailMessageId: m.id } }, select: { id: true } })) return 0;
  const link = { mailbox, gmailMessageId: m.id, gmailThreadId: m.threadId };
  if (skipReason(m, mailbox)) {
    await db.supportEmail.create({ data: link });
    return 0;
  }
  const sender = supportSender(m);
  const at = m.internalDate ? new Date(Number(m.internalDate)) : new Date();
  const block = emailBlock({ sender, at, text: messageText(m), attachments: attachmentNames(m) });

  // A reply in a conversation whose task is still open goes onto that task instead of making a new one.
  const open = await db.supportEmail.findFirst({
    where: { mailbox, gmailThreadId: m.threadId, task: { doneAt: null, kind: "TASK" } },
    select: { task: { select: { id: true, body: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (open?.task) {
    await db.$transaction([
      db.activity.update({ where: { id: open.task.id }, data: { body: appendReply(open.task.body, block) } }),
      db.supportEmail.create({ data: { ...link, taskId: open.task.id } }),
    ]);
    return 0;
  }

  const task = await db.activity.create({
    data: {
      kind: "TASK",
      subject: supportTaskTitle(header(m, "Subject"), sender),
      body: block,
      assigneeId,
      by: sender.name || sender.email,
      createdAt: at,
      mailbox,
      gmailMessageId: m.id,
      gmailThreadId: m.threadId,
      emailMessageId: header(m, "Message-ID"),
      ...(await findSender(sender.email)),
    },
  });
  await db.supportEmail.create({ data: { ...link, taskId: task.id } });
  return 1;
}

/** Emails read per check. A busier inbox catches up over the next checks (oldest first). */
const MAX_PER_CHECK = 100;

export type SupportCheck = { created: number; scanned: number; error?: string; skipped?: string };

/**
 * Reads new mail in the support inbox and turns it into tasks.
 * `force` (Check now, cron) runs even if a check ran in the last couple of minutes.
 */
export async function checkSupportInbox(force = false): Promise<SupportCheck> {
  const member = await getSupportMember();
  if (!member) return { created: 0, scanned: 0, skipped: "No team member is set as Technical Support." };
  const a = member.gmail;
  if (!a) return { created: 0, scanned: 0, skipped: `${member.name} hasn't linked Gmail yet.` };
  const now = new Date();
  // Claim the check, so page loads that land together don't run it twice.
  const claimed = await db.gmailAccount.updateMany({
    where: { id: a.id, ...(force ? {} : { OR: [{ supportCheckAt: null }, { supportCheckAt: { lt: new Date(now.getTime() - CHECK_EVERY_MS) } }] }) },
    data: { supportCheckAt: now },
  });
  if (!claimed.count) return { created: 0, scanned: 0, skipped: "Checked a moment ago." };
  try {
    const since = supportSince({ supportSince: member.supportSince, lastSync: a.supportSyncAt, now });
    const ids = await listIds(a, supportQuery(since), 500);
    const known = new Set((await db.supportEmail.findMany({ where: { mailbox: a.email, gmailMessageId: { in: ids } }, select: { gmailMessageId: true } })).map((x) => x.gmailMessageId));
    // Oldest first, so replies land on the task their first email made.
    const waiting = ids.filter((id) => !known.has(id)).reverse();
    const todo = waiting.slice(0, MAX_PER_CHECK);
    let created = 0;
    for (const id of todo) created += await fileEmail(a.email, member.id, await gmail<GmailMessage>(a, `/messages/${id}?format=full`));
    // Only move the starting point on once everything waiting was read.
    await db.gmailAccount.update({ where: { id: a.id }, data: { ...(waiting.length <= MAX_PER_CHECK ? { supportSyncAt: now } : {}), supportError: null } });
    return { created, scanned: ids.length };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await db.gmailAccount.update({ where: { id: a.id }, data: { supportError: error } });
    return { created: 0, scanned: 0, error };
  }
}

/** Run after admin pages load (throttled): keeps support tasks fresh while the team is using the app. Never throws. */
export async function checkSupportInboxQuietly() {
  try {
    const r = await checkSupportInbox(false);
    if (r.error) console.error("[support] inbox check failed", r.error);
  } catch (e) {
    console.error("[support] inbox check failed", e);
  }
}
