import "server-only";
import { cookies } from "next/headers";
import { db } from "./db";
import { VISITOR_COOKIE, type TrackKind } from "./activity";

type Who = { id: string; role: string };

/** Records a server-side event (file open/download, upload, sign-in) for an investor or referral agent. The team isn't tracked. */
export async function trackServer(u: Who | null | undefined, e: { kind: TrackKind; path: string; label?: string | null; target?: string | null; projectId?: string | null }) {
  if (!u || u.role === "ADMIN") return;
  try {
    await db.trackEvent.create({ data: { userId: u.id, role: u.role, kind: e.kind, path: e.path.slice(0, 500), label: e.label?.slice(0, 160) ?? null, target: e.target ?? null, projectId: e.projectId ?? null } });
  } catch (err) {
    console.error("activity tracking failed", err); // never break the request for tracking
  }
}

async function visitorId() {
  const v = (await cookies()).get(VISITOR_COOKIE)?.value;
  return v && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null;
}

/** On sign-in / application: this browser session's earlier visitor events become the user's (a team member's are deleted). */
export async function claimVisitorEvents(u: Who) {
  const vid = await visitorId();
  if (!vid) return;
  // The team isn't tracked: drop what this browser recorded before a team member signed in.
  if (u.role === "ADMIN") return void (await db.trackEvent.deleteMany({ where: { visitorId: vid, userId: null } }).catch(() => null));
  await db.trackEvent.updateMany({ where: { visitorId: vid, userId: null }, data: { userId: u.id, role: u.role } }).catch(() => null);
}

/** On a developer's project submission: this browser session's visitor events are tied to the developer. */
export async function claimVisitorEventsForDeveloper(developerId: string) {
  const vid = await visitorId();
  if (!vid) return;
  await db.trackEvent.updateMany({ where: { visitorId: vid, userId: null }, data: { developerId } }).catch(() => null);
}

/** Codes and titles of the listings these events mention, for describeEvent/pageName. */
export async function projectNames(events: { projectId: string | null; target?: string | null }[], extraIds: string[] = []) {
  const ids = [...new Set([...events.map((e) => e.projectId).filter((x): x is string => !!x), ...extraIds])];
  if (!ids.length) return new Map<string, { code: string; title: string }>();
  const rows = await db.project.findMany({ where: { id: { in: ids } }, select: { id: true, code: true, title: true } });
  return new Map(rows.map((r) => [r.id, { code: r.code, title: r.title }]));
}

export type TrackWhere = { userId: string } | { developerId: string };

/** A person's events, newest first (capped). */
export async function loadEvents(where: TrackWhere, take = 1500) {
  return db.trackEvent.findMany({ where, orderBy: { createdAt: "desc" }, take });
}

/** Per-person engagement with one listing (or its linked listings), most time first. */
export async function listingEngagement(projectIds: string[]) {
  const events = await db.trackEvent.findMany({
    where: { projectId: { in: projectIds }, userId: { not: null } },
    select: { userId: true, kind: true, durationMs: true, createdAt: true, label: true, path: true, target: true, projectId: true },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });
  const people = new Map<string, { userId: string; views: number; activeMs: number; downloads: number; clicks: number; first: Date; last: Date; files: Set<string> }>();
  for (const e of events) {
    const r = people.get(e.userId!) ?? { userId: e.userId!, views: 0, activeMs: 0, downloads: 0, clicks: 0, first: e.createdAt, last: e.createdAt, files: new Set<string>() };
    if (e.kind === "VIEW") { r.views++; r.activeMs += e.durationMs ?? 0; }
    else if (e.kind === "OPEN" || e.kind === "DOWNLOAD") { r.downloads++; if (e.label) r.files.add(e.label); }
    else r.clicks++;
    if (e.createdAt < r.first) r.first = e.createdAt;
    if (e.createdAt > r.last) r.last = e.createdAt;
    people.set(e.userId!, r);
  }
  const users = await db.user.findMany({ where: { id: { in: [...people.keys()] } }, select: { id: true, name: true, role: true, investorId: true, investor: { select: { firm: true } }, company: true } });
  const byId = new Map(users.map((u) => [u.id, u]));
  const rows = [...people.values()].map((r) => ({ ...r, user: byId.get(r.userId) })).filter((r) => r.user).sort((a, b) => b.activeMs - a.activeMs || b.views - a.views);
  const downloads = events.filter((e) => e.kind === "OPEN" || e.kind === "DOWNLOAD").slice(0, 25).map((e) => ({ ...e, user: byId.get(e.userId!) }));
  return { rows, downloads, total: { people: rows.length, views: rows.reduce((s, r) => s + r.views, 0), activeMs: rows.reduce((s, r) => s + r.activeMs, 0), downloads: rows.reduce((s, r) => s + r.downloads, 0) } };
}

/** Admin link to a tracked person's record. */
export function personHref(u: { id: string; role: string; investorId: string | null }) {
  return u.investorId ? `/admin/investors/${u.investorId}?tab=platform` : `/admin/activity?user=${u.id}`;
}
