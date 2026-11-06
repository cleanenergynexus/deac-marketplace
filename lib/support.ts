// Technical Support inbox: which emails become tasks and what the task says. No database or network access (see lib/support-db.ts).
import { addresses, displayName, header, type GmailMessage } from "./gmail";

/** Gmail labels that never become tasks: our own replies, drafts, spam, and the Promotions / Social tabs. */
const SKIP_LABELS = new Set(["SENT", "DRAFT", "SPAM", "TRASH", "CHAT", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL"]);

/** Senders that are machines, not people (bounces, no-reply addresses). */
const MACHINE_SENDER = /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?)([+.@-]|$)/i;

/**
 * Why an email to the support inbox should not become a task, or null when it should.
 * Skips the support mailbox's own mail, Promotions/Social/spam, bounces, auto-replies and mailing lists.
 */
export function skipReason(m: GmailMessage, mailbox: string): string | null {
  const label = m.labelIds?.find((l) => SKIP_LABELS.has(l));
  if (label) return `label ${label}`;
  const from = addresses(header(m, "From"))[0];
  if (!from) return "no sender";
  if (from === mailbox.toLowerCase()) return "sent by the support inbox";
  if (MACHINE_SENDER.test(from)) return "automated sender";
  const auto = header(m, "Auto-Submitted");
  if (auto && auto.trim().toLowerCase() !== "no") return "auto-reply";
  if (/^(bulk|list|junk|auto_reply)$/i.test(header(m, "Precedence")?.trim() ?? "")) return "bulk mail";
  if (header(m, "X-Autoreply") || header(m, "X-Autorespond")) return "auto-reply";
  return null;
}

/** Gmail search for new inbox mail since a time (Gmail `after:` takes seconds). */
export const supportQuery = (since: Date) => `in:inbox after:${Math.floor(since.getTime() / 1000)} -category:promotions -category:social`;

/** Where the next check starts: a little before the last finished check (mail can arrive with an earlier date), never before the inbox was turned on. */
export function supportSince(o: { supportSince: Date | null; lastSync: Date | null; now?: Date }): Date {
  const now = o.now ?? new Date();
  const start = o.supportSince ?? now;
  const fromLast = o.lastSync ? new Date(o.lastSync.getTime() - 60 * 60_000) : start;
  return fromLast > start ? fromLast : start;
}

/** A check runs at most this often when it's triggered by people using the admin pages. */
export const CHECK_EVERY_MS = 2 * 60_000;

/** Longest task body we keep (a long conversation keeps its latest messages). */
export const MAX_TASK_BODY = 20_000;

export type SupportSender = { email: string; name: string };

export const supportSender = (m: GmailMessage): SupportSender => {
  const from = header(m, "From");
  const email = addresses(from)[0] ?? "";
  return { email, name: displayName(from) || email };
};

const fmtDate = (d: Date) => d.toISOString().replace("T", " ").slice(0, 16) + " UTC";

/** One email as it reads inside the task: who sent it, when, then the text and attachment names. */
export function emailBlock(o: { sender: SupportSender; at: Date; text: string; attachments: string[] }) {
  const who = o.sender.name && o.sender.name !== o.sender.email ? `${o.sender.name} <${o.sender.email}>` : o.sender.email;
  return [`From: ${who}`, `Received: ${fmtDate(o.at)}`, "", o.text.trim() || "(no text)", ...(o.attachments.length ? ["", `Attachments: ${o.attachments.join(", ")}`] : [])].join("\n");
}

/** Title for the task made from a support email. */
export const supportTaskTitle = (subject: string | null | undefined, sender: SupportSender) =>
  `Support: ${(subject ?? "").replace(/\s+/g, " ").trim() || `email from ${sender.name || sender.email}`}`.slice(0, 300);

/** Adds a reply in the same conversation to an open task's body, keeping the newest text when it gets long. */
export function appendReply(body: string, block: string): string {
  const next = `${body}\n\n──── Reply ────\n${block}`;
  return next.length > MAX_TASK_BODY ? `…${next.slice(next.length - MAX_TASK_BODY + 1)}` : next;
}
