import "server-only";
import { db } from "./db";
import { sendViaGmail, type GmailSent } from "./gmail-db";

export type SendResult = { status: "SENT" | "LOGGED" | "FAILED"; via?: "GMAIL" | "RESEND"; gmail?: GmailSent | null; error?: string };

/**
 * Sends an email. With `fromUserId`, it goes out from that team member's linked Gmail (it then shows in their Sent
 * folder); when they haven't linked Gmail, or Gmail fails, it goes through Resend with replies going to them.
 * Resend needs RESEND_API_KEY; without it the email is only logged (status LOGGED) so flows still work in dev.
 */
export async function sendEmail({ to, toName, subject, text, fromUserId }: { to: string; toName?: string | null; subject: string; text: string; fromUserId?: string | null }): Promise<SendResult> {
  let gmailError: string | undefined;
  let replyTo: string | null = null;
  if (fromUserId) {
    try {
      const gmail = await sendViaGmail(fromUserId, { to, toName, subject, text });
      if (gmail) return { status: "SENT", via: "GMAIL", gmail };
    } catch (e) {
      gmailError = e instanceof Error ? e.message : String(e);
      console.error("[email] Gmail send failed, trying Resend", gmailError);
    }
    replyTo = (await db.user.findUnique({ where: { id: fromUserId }, select: { email: true } }))?.email ?? null;
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
      body: JSON.stringify({ from: process.env.OUTREACH_FROM ?? "DEAC Marketplace <invest@deacna.com>", to, subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    });
    return r.ok ? { status: "SENT", via: "RESEND" } : { status: "FAILED", error: `${r.status} ${await r.text()}`.slice(0, 300) };
  } catch (e) {
    return { status: "FAILED", error: String(e).slice(0, 300) };
  }
}
