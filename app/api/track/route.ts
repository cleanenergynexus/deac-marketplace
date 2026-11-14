import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { COOKIE, readToken } from "@/lib/session";
import { cleanClientEvent, listingIdFromPath, TRACK_VISITORS, VISITOR_COOKIE, type CleanEvent } from "@/lib/activity";

export const dynamic = "force-dynamic";

const MAX_EVENTS = 40;

/**
 * Receives the browser tracker's events (components/ActivityTracker.tsx): page views, time on page, clicks and
 * selections. Signed-in investors and referral agents are recorded against their login; visitors against their
 * browser-session id. The DEAC team is never recorded.
 */
export async function POST(req: NextRequest) {
  const ok = new NextResponse(null, { status: 204 });
  let body: unknown;
  try {
    body = JSON.parse(await req.text());
  } catch {
    return ok;
  }
  const raw = (body as { events?: unknown[] })?.events;
  if (!Array.isArray(raw)) return ok;
  const events = raw.slice(0, MAX_EVENTS).map((e) => cleanClientEvent(e)).filter((e): e is CleanEvent => !!e);
  if (!events.length) return ok;

  const s = await readToken(req.cookies.get(COOKIE)?.value);
  let who: { userId: string | null; visitorId: string | null; role: string | null };
  if (s) {
    if (s.role === "ADMIN") return ok;
    const u = await db.user.findUnique({ where: { id: s.uid }, select: { id: true, role: true } });
    if (!u || u.role === "ADMIN") return ok;
    who = { userId: u.id, visitorId: null, role: u.role };
  } else {
    const vid = req.cookies.get(VISITOR_COOKIE)?.value;
    if (!TRACK_VISITORS || !vid || !/^[A-Za-z0-9-]{8,64}$/.test(vid)) return ok;
    who = { userId: null, visitorId: vid, role: null };
  }

  // Listing each event is about: the link's listing for clicks on a listing tile, else the page's listing.
  const listingOf = (e: CleanEvent) => (e.op === "time" ? null : (e.op === "event" ? listingIdFromPath(e.target) : null) ?? listingIdFromPath(e.path));
  const ids = [...new Set(events.map(listingOf).filter((x): x is string => !!x))];
  const known = new Set(ids.length ? (await db.project.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((p) => p.id) : []);
  const projectId = (e: CleanEvent) => { const id = listingOf(e); return id && known.has(id) ? id : null; };
  const mine = who.userId ? { userId: who.userId } : { visitorId: who.visitorId };

  try {
    for (const e of events) {
      if (e.op === "time") {
        await db.trackEvent.updateMany({ where: { clientId: e.clientId, kind: "VIEW", ...mine }, data: { durationMs: e.durationMs, ...(e.scrollPct != null ? { scrollPct: e.scrollPct } : {}) } });
      } else if (e.op === "view") {
        if (await db.trackEvent.count({ where: { clientId: e.clientId } })) continue; // resent
        await db.trackEvent.create({ data: { ...who, kind: "VIEW", path: e.path, clientId: e.clientId, projectId: projectId(e), createdAt: e.at } });
      } else {
        await db.trackEvent.create({ data: { ...who, kind: e.kind, path: e.path, label: e.label, target: e.target, projectId: projectId(e), createdAt: e.at } });
      }
    }
  } catch (err) {
    console.error("activity tracking failed", err);
  }
  return ok;
}
