import "server-only";
// Linked Gmail accounts: tokens, sending as the team member, and pulling their emails with CRM contacts onto the records.
import type { GmailAccount, Prisma } from "@prisma/client";
import { db } from "./db";
import { open, seal, tokenKey } from "./secret-box";
import { CALLBACK_PATH, addressQueries, addresses, afterQuery, attachmentNames, buildRaw, displayName, header, messageText, type GmailMessage } from "./gmail";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const appUrl = () => process.env.PUBLIC_APP_URL || "https://marketplace.deacna.com";
export const redirectUri = () => `${appUrl()}${CALLBACK_PATH}`;

/** Days of history pulled the first time a mailbox syncs (GMAIL_SYNC_DAYS, default 90). */
const firstSyncDays = () => Math.min(Math.max(Number(process.env.GMAIL_SYNC_DAYS) || 90, 1), 730);

/** What's missing before team members can link Gmail; empty when ready. */
export function gmailSetupMissing(): string[] {
  return ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GMAIL_TOKEN_KEY"].filter((k) => !process.env[k]);
}

export class GmailAuthError extends Error {}

type Tokens = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };

async function tokenCall(params: Record<string, string>): Promise<Tokens> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...params }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (j.error === "invalid_grant") throw new GmailAuthError("Google no longer accepts this link (access was removed, the password changed, or the app is in Testing mode, where links expire after 7 days). Link Gmail again.");
    throw new Error(`Google sign-in failed: ${j.error_description ?? j.error ?? r.status}`);
  }
  return j as Tokens;
}

/** Finishes "Link Gmail": swaps the code for tokens and stores them encrypted. Returns the linked address. */
export async function linkAccount(userId: string, code: string) {
  const t = await tokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
  if (!t.refresh_token) throw new Error("Google didn't return a long-term token. Remove DEAC Marketplace at myaccount.google.com/permissions and link again.");
  const profile = await fetch(`${API}/profile`, { headers: { Authorization: `Bearer ${t.access_token}` } }).then((r) => (r.ok ? r.json() : null));
  const email = String(profile?.emailAddress ?? "").toLowerCase();
  if (!email) throw new Error("Couldn't read the Gmail address. Make sure you ticked the Gmail permissions on Google's screen.");
  const key = tokenKey();
  const data = {
    email,
    refreshToken: seal(t.refresh_token, key),
    accessToken: seal(t.access_token, key),
    accessExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    scope: t.scope ?? "",
    lastSyncError: null,
  };
  await db.gmailAccount.upsert({ where: { userId }, create: { userId, ...data }, update: { ...data, lastSyncAt: null } });
  return { email, scope: t.scope ?? "" };
}

/** Removes the link and tells Google to revoke the token. */
export async function unlinkAccount(userId: string) {
  const a = await db.gmailAccount.findUnique({ where: { userId } });
  if (!a) return;
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(open(a.refreshToken, tokenKey()))}`, { method: "POST" });
  } catch {
    // Revoking is best effort; the row goes either way.
  }
  await db.gmailAccount.delete({ where: { userId } });
}

async function accessToken(a: GmailAccount): Promise<string> {
  const key = tokenKey();
  if (a.accessToken && a.accessExpiresAt && a.accessExpiresAt > new Date()) return open(a.accessToken, key);
  try {
    const t = await tokenCall({ refresh_token: open(a.refreshToken, key), grant_type: "refresh_token" });
    await db.gmailAccount.update({ where: { id: a.id }, data: { accessToken: seal(t.access_token, key), accessExpiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000) } });
    return t.access_token;
  } catch (e) {
    if (e instanceof GmailAuthError) await db.gmailAccount.update({ where: { id: a.id }, data: { lastSyncError: e.message } });
    throw e;
  }
}

async function gmail<T>(a: GmailAccount, path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken(a);
  const r = await fetch(`${API}${path}`, { ...init, headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`Gmail ${r.status}: ${j.error?.message ?? r.statusText}`.slice(0, 300));
  }
  return r.json() as Promise<T>;
}

export const getGmailAccount = (userId: string) => db.gmailAccount.findUnique({ where: { userId } });

// ---------- Sending ----------

export type GmailSent = { mailbox: string; gmailMessageId: string; gmailThreadId: string; emailMessageId: string | null };

/** Sends a plain-text email from the team member's own Gmail. Null when they haven't linked one. */
export async function sendViaGmail(userId: string, o: { to: string; toName?: string | null; subject: string; text: string }): Promise<GmailSent | null> {
  const a = await db.gmailAccount.findUnique({ where: { userId }, include: { user: { select: { name: true } } } });
  if (!a) return null;
  const raw = buildRaw({ from: a.email, fromName: a.user.name, to: o.to, toName: o.toName, subject: o.subject, text: o.text });
  const sent = await gmail<{ id: string; threadId: string }>(a, "/messages/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
  let emailMessageId: string | null = null;
  try {
    const m = await gmail<GmailMessage>(a, `/messages/${sent.id}?format=metadata&metadataHeaders=Message-ID`);
    emailMessageId = header(m, "Message-ID");
  } catch {
    // Only used to avoid duplicates later; the send itself worked.
  }
  return { mailbox: a.email, gmailMessageId: sent.id, gmailThreadId: sent.threadId, emailMessageId };
}

/** Who a timeline entry belongs to. */
export type RecordRef = { investorId?: string | null; contactId?: string | null; agentId?: string | null };

/** Puts an email sent from the app on the person's timeline (with its Gmail ids when it went through Gmail). */
export async function recordSentEmail(ref: RecordRef, o: { subject: string; text: string; by: string; projectId?: string | null; gmail?: GmailSent | null }) {
  const g = o.gmail ? { mailbox: o.gmail.mailbox, gmailMessageId: o.gmail.gmailMessageId, gmailThreadId: o.gmail.gmailThreadId, emailMessageId: o.gmail.emailMessageId } : {};
  const base = { kind: "EMAIL", outcome: "SENT", subject: o.subject, body: o.text, by: o.by, projectId: o.projectId ?? null, ...g };
  if (ref.investorId) {
    await db.activity.create({ data: { ...base, investorId: ref.investorId } });
    await db.investor.update({ where: { id: ref.investorId }, data: { lastContactAt: new Date() } });
  } else if (ref.contactId) {
    const c = await db.contact.findUnique({ where: { id: ref.contactId }, select: { developerId: true } });
    if (c) await db.activity.create({ data: { ...base, contactId: ref.contactId, developerId: c.developerId } });
  } else if (ref.agentId) {
    await db.activity.create({ data: { ...base, agentId: ref.agentId } });
  }
}

// ---------- Pulling email onto records ----------

type Target = { kind: "INVESTOR"; id: string } | { kind: "CONTACT"; id: string; developerId: string } | { kind: "AGENT"; id: string };

/** Every CRM address we file email under (investors, developer contacts, referral agents), and the team's own addresses. */
async function directory() {
  const [investors, contacts, users, linked] = await Promise.all([
    db.investor.findMany({ select: { id: true, email: true } }),
    db.contact.findMany({ where: { email: { not: null } }, select: { id: true, email: true, developerId: true } }),
    db.user.findMany({ where: { role: { in: ["ADMIN", "AGENT"] } }, select: { id: true, email: true, role: true } }),
    db.gmailAccount.findMany({ select: { email: true } }),
  ]);
  const map = new Map<string, Target[]>();
  const add = (email: string | null, t: Target) => {
    const k = email?.trim().toLowerCase();
    if (!k) return;
    map.set(k, [...(map.get(k) ?? []), t]);
  };
  investors.forEach((i) => add(i.email, { kind: "INVESTOR", id: i.id }));
  contacts.forEach((c) => add(c.email, { kind: "CONTACT", id: c.id, developerId: c.developerId }));
  users.filter((u) => u.role === "AGENT").forEach((u) => add(u.email, { kind: "AGENT", id: u.id }));
  const team = new Set([...users.filter((u) => u.role === "ADMIN").map((u) => u.email.toLowerCase()), ...linked.map((l) => l.email.toLowerCase())]);
  for (const t of team) map.delete(t);
  return { map, team };
}

const targetWhere = (t: Target): Prisma.ActivityWhereInput => (t.kind === "INVESTOR" ? { investorId: t.id } : t.kind === "CONTACT" ? { contactId: t.id } : { agentId: t.id });

async function importMessage(a: GmailAccount, m: GmailMessage, dir: Awaited<ReturnType<typeof directory>>, only?: Target) {
  if (m.labelIds?.some((l) => l === "CHAT" || l === "SPAM" || l === "TRASH" || l === "DRAFT")) return 0;
  const from = header(m, "From");
  const fromAddr = addresses(from)[0] ?? "";
  const people = [...addresses(from), ...addresses(header(m, "To")), ...addresses(header(m, "Cc"))];
  let targets = people.flatMap((e) => dir.map.get(e) ?? []);
  if (only) targets = targets.filter((t) => t.kind === only.kind && t.id === only.id);
  if (!targets.length) return 0;
  const sent = fromAddr === a.email || dir.team.has(fromAddr);
  const emailMessageId = header(m, "Message-ID");
  const files = attachmentNames(m);
  const text = messageText(m);
  const body = files.length ? `${text}\n\nAttachments: ${files.join(", ")}` : text;
  const createdAt = m.internalDate ? new Date(Number(m.internalDate)) : new Date();
  let added = 0;
  const done = new Set<string>();
  for (const t of targets) {
    if (done.has(`${t.kind}:${t.id}`)) continue;
    done.add(`${t.kind}:${t.id}`);
    const dupe = await db.activity.findFirst({
      where: { ...targetWhere(t), OR: [{ mailbox: a.email, gmailMessageId: m.id }, ...(emailMessageId ? [{ emailMessageId }] : [])] },
      select: { id: true },
    });
    if (dupe) continue;
    await db.activity.create({
      data: {
        kind: "EMAIL", outcome: sent ? "SENT" : "RECEIVED",
        subject: (header(m, "Subject") ?? "").slice(0, 300) || "(no subject)", body,
        by: displayName(from) || fromAddr, createdAt,
        mailbox: a.email, gmailMessageId: m.id, gmailThreadId: m.threadId, emailMessageId,
        ...(t.kind === "INVESTOR" ? { investorId: t.id } : t.kind === "CONTACT" ? { contactId: t.id, developerId: t.developerId } : { agentId: t.id }),
      },
    });
    if (t.kind === "INVESTOR") await db.investor.updateMany({ where: { id: t.id, OR: [{ lastContactAt: null }, { lastContactAt: { lt: createdAt } }] }, data: { lastContactAt: createdAt } });
    added++;
  }
  return added;
}

/** Runs fn over items, a few at a time (Gmail allows plenty of parallel reads, the function's time is the limit). */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<number>) {
  let i = 0, total = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const n = await fn(items[i++]);
      total += n;
    }
  }));
  return total;
}

async function listIds(a: GmailAccount, q: string, max: number) {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const p = new URLSearchParams({ q: `${q} -in:chats -in:spam -in:trash -in:drafts`, maxResults: String(Math.min(100, max - ids.length)) });
    if (pageToken) p.set("pageToken", pageToken);
    const r = await gmail<{ messages?: { id: string }[]; nextPageToken?: string }>(a, `/messages?${p}`);
    ids.push(...(r.messages ?? []).map((m) => m.id));
    pageToken = r.nextPageToken;
  } while (pageToken && ids.length < max);
  return ids;
}

const MAX_PER_RUN = 800;

/**
 * Pulls new email between this mailbox and anyone in the CRM since the last sync (first time: the last GMAIL_SYNC_DAYS days).
 * Returns how many timeline entries were added.
 */
export async function syncMailbox(userId: string): Promise<{ added: number; scanned: number; error?: string }> {
  const a = await db.gmailAccount.findUnique({ where: { userId } });
  if (!a) return { added: 0, scanned: 0, error: "Gmail is not linked." };
  const started = new Date();
  try {
    const dir = await directory();
    // A day of overlap: mail can arrive with an earlier date than the last run.
    const since = a.lastSyncAt ? new Date(a.lastSyncAt.getTime() - 86_400_000) : new Date(Date.now() - firstSyncDays() * 86_400_000);
    const ids = new Set<string>();
    for (const q of addressQueries([...dir.map.keys()])) {
      if (ids.size >= MAX_PER_RUN) break;
      (await listIds(a, `${afterQuery(since)} ${q}`, MAX_PER_RUN - ids.size)).forEach((id) => ids.add(id));
    }
    const seen = new Set((await db.activity.findMany({ where: { mailbox: a.email, gmailMessageId: { in: [...ids] } }, select: { gmailMessageId: true } })).map((x) => x.gmailMessageId));
    const todo = [...ids].filter((id) => !seen.has(id));
    const added = await pool(todo, 8, async (id) => importMessage(a, await gmail<GmailMessage>(a, `/messages/${id}?format=full`), dir));
    // Gmail lists newest first, so a run that hits the cap skips the oldest mail; opening a record still pulls its latest 50.
    await db.gmailAccount.update({ where: { id: a.id }, data: { lastSyncAt: started, lastSyncError: null, lastSyncAdded: added } });
    return { added, scanned: ids.size };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.gmailAccount.update({ where: { id: a.id }, data: { lastSyncError: error.slice(0, 500) } });
    return { added: 0, scanned: 0, error };
  }
}

/** Pulls the latest email (any date) between this mailbox and one CRM person. Used when their record opens. */
export async function syncRecord(userId: string, ref: RecordRef): Promise<number> {
  const a = await db.gmailAccount.findUnique({ where: { userId } });
  if (!a) return 0;
  const who = ref.investorId
    ? await db.investor.findUnique({ where: { id: ref.investorId }, select: { email: true } }).then((x) => x && { email: x.email, t: { kind: "INVESTOR", id: ref.investorId! } as Target })
    : ref.contactId
      ? await db.contact.findUnique({ where: { id: ref.contactId }, select: { email: true, developerId: true } }).then((x) => x?.email ? { email: x.email, t: { kind: "CONTACT", id: ref.contactId!, developerId: x.developerId } as Target } : null)
      : ref.agentId
        ? await db.user.findFirst({ where: { id: ref.agentId, role: "AGENT" }, select: { email: true } }).then((x) => x && { email: x.email, t: { kind: "AGENT", id: ref.agentId! } as Target })
        : null;
  if (!who) return 0;
  try {
    const dir = await directory();
    if (!dir.map.has(who.email.toLowerCase())) return 0;
    const [q] = addressQueries([who.email]);
    const ids = await listIds(a, q, 50);
    const seen = new Set((await db.activity.findMany({ where: { ...targetWhere(who.t), mailbox: a.email, gmailMessageId: { in: ids } }, select: { gmailMessageId: true } })).map((x) => x.gmailMessageId));
    return await pool(ids.filter((id) => !seen.has(id)), 8, async (id) => importMessage(a, await gmail<GmailMessage>(a, `/messages/${id}?format=full`), dir, who.t));
  } catch (e) {
    if (!(e instanceof GmailAuthError)) console.error("[gmail] record sync failed", e);
    return 0;
  }
}

/** Nightly job: every linked mailbox. */
export async function syncAllMailboxes() {
  const accounts = await db.gmailAccount.findMany({ select: { userId: true, email: true } });
  const out: { email: string; added: number; error?: string }[] = [];
  for (const acc of accounts) out.push({ email: acc.email, ...(await syncMailbox(acc.userId)) });
  return out;
}
