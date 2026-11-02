// Gmail helpers with no database or network access: OAuth URL, reading messages, building outgoing mail.

/**
 * What the app asks Google for. gmail.readonly reads mail to file it on CRM records; gmail.send sends as the team member.
 * Both are "restricted" Gmail scopes: an Internal app on the company's Google Workspace needs no Google review.
 */
export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"];

export const CALLBACK_PATH = "/api/google/callback";
/** Short-lived cookie that ties Google's answer to the browser and login that asked. */
export const STATE_COOKIE = "deac_gmail_state";

export function authUrl(o: { clientId: string; redirectUri: string; state: string; loginHint?: string | null }) {
  const q = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline", // refresh token, so syncing works while nobody is signed in
    prompt: "consent", // always return a refresh token, also when relinking
    include_granted_scopes: "true",
    state: o.state,
  });
  if (o.loginHint) q.set("login_hint", o.loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Has the person granted everything we need? (Google lets them untick scopes on the consent screen.) */
export function missingScopes(granted: string): string[] {
  const have = new Set(granted.split(/\s+/));
  return GMAIL_SCOPES.filter((s) => s.startsWith("https://") && !have.has(s));
}

const EMAIL_RE = /[A-Z0-9._%+'-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

/** Lower-case addresses in a From/To/Cc header: `"Doe, Jane" <jane@x.com>, bob@y.com` → ["jane@x.com", "bob@y.com"]. */
export function addresses(header: string | null | undefined): string[] {
  if (!header) return [];
  const out: string[] = [];
  for (const part of header.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)) {
    const angled = part.match(/<([^>]+)>/);
    const found = (angled ? angled[1] : part).match(EMAIL_RE);
    if (found) out.push(found[0].toLowerCase());
  }
  return [...new Set(out)];
}

/** `"Jane Doe" <jane@x.com>` → "Jane Doe"; a bare address returns itself. */
export function displayName(header: string | null | undefined): string {
  if (!header) return "";
  const m = header.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>/);
  return (m?.[1].trim() || addresses(header)[0] || header).trim();
}

export type GmailPart = { mimeType?: string; filename?: string; headers?: { name: string; value: string }[]; body?: { data?: string; size?: number }; parts?: GmailPart[] };
export type GmailMessage = { id: string; threadId: string; internalDate?: string; labelIds?: string[]; snippet?: string; payload?: GmailPart };

export function header(m: GmailMessage, name: string): string | null {
  const h = m.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

const decode = (data: string) => Buffer.from(data, "base64url").toString("utf8");

function findPart(p: GmailPart | undefined, type: string): GmailPart | null {
  if (!p) return null;
  if (p.mimeType === type && p.body?.data && !p.filename) return p;
  for (const c of p.parts ?? []) {
    const hit = findPart(c, type);
    if (hit) return hit;
  }
  return null;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Drops the quoted thread below a reply ("On Mon, Jane wrote:", "-----Original Message-----", "> ..." lines). */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*-{2,}\s*Original Message\s*-{2,}/i.test(l)) break;
    if (/^\s*On .+wrote:\s*$/i.test(l) || (/^\s*On .+/i.test(l) && /wrote:\s*$/i.test(lines[i + 1] ?? ""))) break;
    if (/^\s*From:\s.+/i.test(l) && /^\s*(Sent|Date):\s/i.test(lines[i + 1] ?? "")) break;
    if (/^\s*>/.test(l)) continue;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const MAX_BODY = 6000;

/** The readable text of a message, without the quoted thread, capped for the timeline. */
export function messageText(m: GmailMessage): string {
  const plain = findPart(m.payload, "text/plain");
  const html = plain ? null : findPart(m.payload, "text/html");
  const raw = plain ? decode(plain.body!.data!) : html ? htmlToText(decode(html.body!.data!)) : m.snippet ?? "";
  const text = stripQuoted(raw) || raw.trim();
  return text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}…` : text;
}

/** Names of attachments on the message, shown under the email on the timeline. */
export function attachmentNames(m: GmailMessage): string[] {
  const out: string[] = [];
  const walk = (p?: GmailPart) => {
    if (!p) return;
    if (p.filename) out.push(p.filename);
    p.parts?.forEach(walk);
  };
  walk(m.payload);
  return out;
}

/** Gmail search for mail with any of these addresses, in chunks short enough for one query each. */
export function addressQueries(emails: string[], chunk = 12): string[] {
  const list = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@{}()"]+@[^\s@{}()"]+$/.test(e)))];
  const out: string[] = [];
  for (let i = 0; i < list.length; i += chunk) {
    out.push(`{${list.slice(i, i + chunk).flatMap((e) => [`from:${e}`, `to:${e}`, `cc:${e}`]).join(" ")}}`);
  }
  return out;
}

/** RFC 2047 header word for non-ASCII subjects and names. */
function encodeWord(s: string) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function nameAddr(name: string | null | undefined, email: string) {
  if (!name) return email;
  const safe = name.replace(/["\\\r\n]/g, "");
  return /^[\x20-\x7e]*$/.test(safe) ? `"${safe}" <${email}>` : `${encodeWord(safe)} <${email}>`;
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** A plain-text email as Gmail's API wants it (base64url RFC 2822). */
export function buildRaw(o: { fromName?: string | null; from: string; to: string; toName?: string | null; subject: string; text: string; replyTo?: string | null }): string {
  const headers = [
    `From: ${nameAddr(o.fromName, oneLine(o.from))}`,
    `To: ${nameAddr(o.toName, oneLine(o.to))}`,
    ...(o.replyTo ? [`Reply-To: ${oneLine(o.replyTo)}`] : []),
    `Subject: ${encodeWord(oneLine(o.subject))}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];
  const body = Buffer.from(o.text.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{76}/g, "$&\r\n");
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8").toString("base64url");
}

/** Link to the conversation in Gmail, opened in the right account. */
export const threadUrl = (mailbox: string, threadId: string) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(mailbox)}#all/${threadId}`;

/** Gmail `after:` takes seconds since 1970. */
export const afterQuery = (d: Date) => `after:${Math.floor(d.getTime() / 1000)}`;
