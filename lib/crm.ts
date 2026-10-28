// Developer CRM helpers shared by the board, contact record and lists. No database access here.

/** Kinds of touchpoint a team member can log on a contact. STAGE and SYSTEM entries are written by the app. */
export const LOG_KINDS = [
  { value: "NOTE", label: "Note" },
  { value: "EMAIL", label: "Email" },
  { value: "CALL", label: "Call" },
  { value: "MEETING", label: "Meeting" },
  { value: "TASK", label: "Task" },
] as const;
export type LogKind = (typeof LOG_KINDS)[number]["value"];
export const isLogKind = (v: unknown): v is LogKind => LOG_KINDS.some((k) => k.value === v);

/** Tabs on the contact record's middle column, and which activity kinds each one shows. */
export const CONTACT_TABS = [
  { value: "activity", label: "Activity", kinds: null, log: "NOTE" },
  { value: "notes", label: "Notes", kinds: ["NOTE"], log: "NOTE" },
  { value: "emails", label: "Emails", kinds: ["EMAIL"], log: "EMAIL" },
  { value: "calls", label: "Calls", kinds: ["CALL"], log: "CALL" },
  { value: "meetings", label: "Meetings", kinds: ["MEETING"], log: "MEETING" },
  { value: "tasks", label: "Tasks", kinds: ["TASK"], log: "TASK" },
] as const;
export type ContactTab = (typeof CONTACT_TABS)[number];
export const contactTab = (v?: string): ContactTab => CONTACT_TABS.find((t) => t.value === v) ?? CONTACT_TABS[0];

export const CALL_OUTCOMES = [
  { value: "CONNECTED", label: "Connected" },
  { value: "VOICEMAIL", label: "Left voicemail" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "BUSY", label: "Busy" },
  { value: "WRONG_NUMBER", label: "Wrong number" },
] as const;
export const EMAIL_DIRECTIONS = [
  { value: "SENT", label: "Sent to contact" },
  { value: "RECEIVED", label: "Received from contact" },
] as const;

const labelOf = (list: readonly { value: string; label: string }[], v?: string | null) => (v ? list.find((x) => x.value === v)?.label ?? v : null);

type Entry = { kind: string; subject?: string | null; outcome?: string | null; dueAt?: Date | null; doneAt?: Date | null };

/** Headline for a timeline entry, e.g. "Email sent: Abilene teaser" or "Call: Left voicemail". */
export function activityTitle(a: Entry): string {
  switch (a.kind) {
    case "NOTE": return "Note";
    case "EMAIL": return [a.outcome === "RECEIVED" ? "Email received" : "Email sent", a.subject].filter(Boolean).join(": ");
    case "CALL": return ["Call", labelOf(CALL_OUTCOMES, a.outcome)].filter(Boolean).join(": ");
    case "MEETING": return ["Meeting", a.subject].filter(Boolean).join(": ");
    case "TASK": return a.subject || "Task";
    case "STAGE": return "Stage change";
    default: return "Update";
  }
}

/** "MA" for "Maria Alvarez", "M" for "Maria", "?" when empty. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

/** Short "how long ago" text for tiles: "today", "yesterday", "5 days ago", "3 weeks ago", "Mar 4, 2026". */
export function ago(d: Date | null | undefined, now = new Date()): string | null {
  if (!d) return null;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(new Date(d))) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Task status for badges. Open tasks due before today are overdue. */
export function taskState(t: { dueAt?: Date | null; doneAt?: Date | null }, now = new Date()): "done" | "overdue" | "due-today" | "open" {
  if (t.doneAt) return "done";
  if (!t.dueAt) return "open";
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(t.dueAt).getTime();
  if (due < today) return "overdue";
  if (due < today + 86_400_000) return "due-today";
  return "open";
}

/** Groups items (already newest first) under "October 2026"-style headings, keeping order. */
export function groupByMonth<T extends { createdAt: Date }>(items: T[]): { month: string; items: T[] }[] {
  const out: { month: string; items: T[] }[] = [];
  for (const it of items) {
    const month = new Date(it.createdAt).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const last = out[out.length - 1];
    if (last?.month === month) last.items.push(it);
    else out.push({ month, items: [it] });
  }
  return out;
}

/** The contact a project belongs to: its own contact, or the company's primary contact. */
export function projectContactId(p: { contactId: string | null }, contacts: { id: string; isPrimary: boolean }[]): string | null {
  if (p.contactId && contacts.some((c) => c.id === p.contactId)) return p.contactId;
  return (contacts.find((c) => c.isPrimary) ?? contacts[0])?.id ?? null;
}

/**
 * Parses a <input type="date|datetime-local"> value typed in the browser's time zone.
 * `tzOffset` is the browser's Date.getTimezoneOffset() (minutes behind UTC), so the server's own zone doesn't matter.
 * A bare date means noon that day. Empty or invalid gives null.
 */
export function parseWhen(v: string | null | undefined, tzOffset = 0): Date | null {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h = "12", mi = "00"] = m;
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  return Number.isNaN(utc) ? null : new Date(utc + (Number.isFinite(tzOffset) ? tzOffset : 0) * 60_000);
}
