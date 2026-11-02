"use server";
// Gmail linked under My account: sync, unlink, and sending emails to CRM contacts from the record's Activity box.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { recordSentEmail, syncMailbox, syncRecord, unlinkAccount, type RecordRef } from "@/lib/gmail-db";

const s = (f: FormData, k: string) => (f.get(k) as string | null)?.trim() || null;

function refreshRecords() {
  revalidatePath("/admin/investors", "layout");
  revalidatePath("/admin/developers", "layout");
  revalidatePath("/admin/agents");
}

export async function saveMySignature(_: { error?: string; ok?: boolean } | undefined, f: FormData): Promise<{ error?: string; ok?: boolean }> {
  const me = await requireAdmin();
  const sig = String(f.get("signature") ?? "").replace(/\r\n/g, "\n").trim();
  if (sig.length > 1000) return { error: "Keep the signature under 1,000 characters." };
  await db.user.update({ where: { id: me.id }, data: { emailSignature: sig || null } });
  revalidatePath("/admin/account");
  return { ok: true };
}

export async function unlinkGmail() {
  const me = await requireAdmin();
  await unlinkAccount(me.id);
  revalidatePath("/admin/account");
}

export type SyncState = { error?: string; ok?: string } | undefined;

export async function syncMyGmail(_: SyncState): Promise<SyncState> {
  const me = await requireAdmin();
  const r = await syncMailbox(me.id);
  revalidatePath("/admin/account");
  if (r.error) return { error: r.error };
  refreshRecords();
  return { ok: r.added ? `Added ${r.added} email${r.added === 1 ? "" : "s"} to contact timelines (${r.scanned} checked).` : `Up to date (${r.scanned} checked, nothing new).` };
}

/** Called when a contact record opens: pulls the latest email with that person from the viewer's Gmail. */
export async function syncRecordEmails(ref: RecordRef): Promise<number> {
  const me = await requireAdmin();
  const added = await syncRecord(me.id, ref);
  if (added) refreshRecords();
  return added;
}

export type SendState = { error?: string; ok?: string } | undefined;

/**
 * "Send email" in a contact's Activity box: sends from the team member's Gmail (or Resend when not linked) and logs it.
 * Takes investorId (Investor CRM) or contactId (Developer CRM), subject, body and an optional projectId.
 */
export async function sendCrmEmail(f: FormData): Promise<SendState> {
  const me = await requireAdmin();
  const subject = s(f, "subject");
  const text = s(f, "body");
  if (!subject || !text) return { error: "Write a subject and a message first." };
  const investorId = s(f, "investorId");
  const contactId = s(f, "contactId");
  const pid = s(f, "projectId");
  const projectId = pid && (await db.project.count({ where: { id: pid } })) ? pid : null;
  const person = investorId
    ? await db.investor.findUnique({ where: { id: investorId }, select: { name: true, email: true } })
    : contactId
      ? await db.contact.findUnique({ where: { id: contactId }, select: { name: true, email: true } })
      : null;
  if (!person) return { error: "That contact no longer exists." };
  if (!person.email) return { error: `${person.name} has no email address. Add one on the record first.` };
  const mail = await sendEmail({ to: person.email, toName: person.name, subject, text, fromUserId: me.id, investorId });
  if (mail.status === "FAILED") return { error: `The email didn't go out: ${mail.error ?? "unknown error"}` };
  if (mail.status === "LOGGED") return { error: "Nothing was sent: link your Gmail under My account (or set RESEND_API_KEY) to send from here. Use Log email to record an email you sent elsewhere." };
  await recordSentEmail({ investorId, contactId }, { subject, text, by: me.name, projectId, gmail: mail.gmail });
  refreshRecords();
  return { ok: mail.via === "GMAIL" ? `Sent from ${mail.gmail?.mailbox}.` : "Sent through DEAC email (replies come to you)." };
}
