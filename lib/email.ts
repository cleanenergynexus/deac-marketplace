import "server-only";
import { db } from "./db";
import { sendViaGmail, type GmailSent } from "./gmail-db";
import { matchOwner, ownerCc } from "./owner";
import { applySignature } from "./signature";
import { applyHtmlSignature } from "./email-templates";

export type SendResult = { status: "SENT" | "LOGGED" | "FAILED"; via?: "GMAIL" | "RESEND"; gmail?: GmailSent | null; error?: string };

/**
 * Emails to an investor copy their relationship owner (the investor's, else their company's), matched to a team login
 * by name or email. Not when the owner is the one sending.
 */
async function relationshipOwnerCc(investorId: string, to: string, senderId?: string | null): Promise<string[]> {
  const inv = await db.investor.findUnique({ where: { id: investorId }, select: { owner: true, company: { select: { owner: true } } } });
  const owner = inv?.owner?.trim() || inv?.company?.owner?.trim();
  if (!owner) return [];
  const team = await db.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true, email: true } });
  return ownerCc(matchOwner(owner, team), { to, senderId });
}

/**
 * Sends an email (plain text, plus branded `html` when given), signed with the sender's signature from My account when they set one. With `investorId`, the investor's relationship owner is copied (Cc). With `fromUserId`, it goes out from that team member's linked Gmail (it then shows in their Sent
 * folder); when they haven't linked Gmail, or Gmail fails, it goes through Resend with replies going to them.
 * Resend needs RESEND_API_KEY; without it the email is only logged (status LOGGED) so flows still work in dev.
 */
export async function sendEmail({ to, toName, subject, text, html, fromUserId, investorId }: { to: string; toName?: string | null; subject: string; text: string; html?: string | null; fromUserId?: string | null; investorId?: string | null }): Promise<SendResult> {
  const cc = investorId ? await relationshipOwnerCc(investorId, to, fromUserId) : [];
  let gmailError: string | undefined;
  let replyTo: string | null = null;
  if (fromUserId) {
    const sender = await db.user.findUnique({ where: { id: fromUserId }, select: { email: true, emailSignature: true } });
    text = applySignature(text, sender?.emailSignature);
    if (html) html = applyHtmlSignature(html, sender?.emailSignature);
    replyTo = sender?.email ?? null;
    try {
      const gmail = await sendViaGmail(fromUserId, { to, toName, cc, subject, text, html });
      if (gmail) return { status: "SENT", via: "GMAIL", gmail };
    } catch (e) {
      gmailError = e instanceof Error ? e.message : String(e);
      console.error("[email] Gmail send failed, trying Resend", gmailError);
    }
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email:dev] to=${to} subject=${subject}`);
    return gmailError ? { status: "FAILED", error: gmailError } : { status: "LOGGED" };
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.OUTREACH_FROM ?? "DEAC Marketplace <invest@deacna.com>", to, subject, text, ...(html ? { html } : {}), ...(cc.length ? { cc } : {}), ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    return r.ok ? { status: "SENT", via: "RESEND" } : { status: "FAILED", error: `${r.status} ${await r.text()}`.slice(0, 300) };
  } catch (e) {
    return { status: "FAILED", error: String(e).slice(0, 300) };
  }
}
