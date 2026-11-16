// Platform activity tracking: what signed-in investors and referral agents (and, until they identify themselves,
// visitors) do on the marketplace. Pure helpers shared by the browser tracker, the /api/track route and admin pages.

export const TRACK_KINDS = ["VIEW", "CLICK", "SELECT", "LINK_OUT", "OPEN", "DOWNLOAD", "UPLOAD", "LOGIN"] as const;
export type TrackKind = (typeof TRACK_KINDS)[number];

/**
 * Track visitors who aren't signed in (browser-session cookie, gone when the browser closes). Their events are
 * attached to them if they apply, sign in or submit a project in the same session. Set to false to track members only.
 */
export const TRACK_VISITORS = true;

/** Cookie holding a visitor's browser-session id. */
export const VISITOR_COOKIE = "deac_vid";

/** A new visit starts after this much inactivity. */
export const VISIT_GAP_MS = 30 * 60 * 1000;

/** Time on page stops counting after this long without a mouse move, key press, scroll or touch. */
export const IDLE_MS = 2 * 60 * 1000;

/** Longest time one page view can record (a tab left open overnight shouldn't count). */
export const MAX_VIEW_MS = 4 * 60 * 60 * 1000;

export const clip = (s: unknown, n: number): string | null => {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, n) : null;
};

/** Only same-site paths are stored (no hosts, no fragments). */
export function cleanPath(p: unknown): string | null {
  if (typeof p !== "string" || !p.startsWith("/") || p.startsWith("//")) return null;
  return p.split("#")[0].slice(0, 500);
}

const ID = "[a-z0-9]{20,40}";
const LISTING_PATHS = [new RegExp(`^/marketplace/(${ID})(?:[/?]|$)`), new RegExp(`^/agent/listings/(${ID})(?:[/?]|$)`), new RegExp(`^/admin/projects/(${ID})(?:[/?]|$)`)];

/** The listing a page or link is about, from its path (marketplace listing, agent listing). */
export function listingIdFromPath(p: string | null | undefined): string | null {
  if (!p) return null;
  for (const re of LISTING_PATHS) {
    const m = p.match(re);
    if (m) return m[1];
  }
  return null;
}

/** Data room file id from a /api/data-room/files/<id> link. */
export function fileIdFromPath(p: string | null | undefined): string | null {
  return p?.match(new RegExp(`^/api/data-room/files/(${ID})`))?.[1] ?? null;
}

const LISTING_TABS: Record<string, string> = { overview: "Overview", sponsor: "Sponsor", economics: "Economics", documents: "Documents", dataroom: "Data Room", "data-room": "Data Room", loi: "Your Status", status: "Your Status" };

const PAGES: [RegExp, string][] = [
  [/^\/$/, "Marketplace home"],
  [/^\/marketplace$/, "Opportunities"],
  [/^\/portal$/, "My Portal"],
  [/^\/portal\/sign/, "Signing a document"],
  [/^\/agent$/, "Agent Portal"],
  [/^\/agent\/tasks/, "Agent tasks"],
  [/^\/agent\/refer/, "Refer a contact"],
  [/^\/agent\/import/, "Import a project"],
  [/^\/agent\/account/, "Agent account"],
  [/^\/agent\/developers\/./, "Agent: developer record"],
  [/^\/agent\/developers$/, "Agent: developers"],
  [/^\/agent\/investors\/./, "Agent: investor record"],
  [/^\/agent\/investors$/, "Agent: investors"],
  [/^\/agent\/listings$/, "Agent: listings"],
  [/^\/agent\/sign/, "Signing a document"],
  [/^\/apply/, "Request access form"],
  [/^\/login/, "Sign in"],
  [/^\/pending/, "Awaiting approval"],
  [/^\/developers\/submit/, "Submit a project form"],
  [/^\/developers\/thanks/, "Project submitted"],
  [/^\/referral-agents\/apply/, "Referral agent application"],
  [/^\/referral-agents\/thanks/, "Referral agent application sent"],
  [/^\/invite/, "Accepting an invite"],
  [/^\/sign\//, "Signing a document"],
];

type ProjectNames = Map<string, { code: string; title: string }>;

/** Human name of a page, e.g. "DEAC-TX-001 · Economics" or "Opportunities". */
export function pageName(path: string, projects?: ProjectNames): string {
  const [pathname, query = ""] = path.split("?");
  const listing = listingIdFromPath(pathname);
  if (listing) {
    const p = projects?.get(listing);
    const name = p ? p.code : "Listing";
    if (/\/data-room$/.test(pathname)) return `${name} · Data Room`;
    const tab = new URLSearchParams(query).get("tab");
    return `${name} · ${(tab && LISTING_TABS[tab]) || (pathname.startsWith("/agent/") ? "Agent view" : "Overview")}`;
  }
  for (const [re, name] of PAGES) if (re.test(pathname)) return name;
  return pathname;
}

export type EventLike = { kind: string; path: string; label: string | null; target: string | null; projectId: string | null };

/** One line for the timeline, e.g. `Downloaded "Site plan.pdf"`. */
export function describeEvent(e: EventLike, projects?: ProjectNames): string {
  const q = (s: string | null) => (s ? `"${s}"` : "");
  switch (e.kind) {
    case "VIEW": return `Viewed ${pageName(e.path, projects)}`;
    case "CLICK": {
      const to = e.target?.startsWith("/") ? listingIdFromPath(e.target) : null;
      const where = to && projects?.get(to) ? ` → ${projects.get(to)!.code}` : "";
      return `Clicked ${q(e.label) || "a link"}${where}`;
    }
    case "SELECT": return `Selected ${e.label ?? "an option"}`;
    case "LINK_OUT": return `Opened external link ${q(e.label) || e.target || ""}`.trim();
    case "OPEN": return `Opened file ${q(e.label)}`.trim();
    case "DOWNLOAD": return `Downloaded ${q(e.label) || "a file"}`;
    case "UPLOAD": return `Uploaded ${q(e.label) || "a file"}`;
    case "LOGIN": return "Signed in";
    default: return e.kind;
  }
}

/** "4m 12s", "1h 05m", "35s". */
export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 1000) return ms ? "<1s" : "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Splits events (any order) into visits: runs with no gap longer than VISIT_GAP_MS. Newest visit first, events oldest first inside. */
export function groupVisits<T extends { createdAt: Date; durationMs?: number | null }>(events: T[]): { start: Date; end: Date; activeMs: number; events: T[] }[] {
  const sorted = [...events].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const visits: { start: Date; end: Date; activeMs: number; events: T[] }[] = [];
  for (const e of sorted) {
    const last = visits[visits.length - 1];
    const endOf = (x: T) => x.createdAt.getTime() + (x.durationMs ?? 0);
    if (last && e.createdAt.getTime() - last.end.getTime() <= VISIT_GAP_MS) {
      last.events.push(e);
      if (endOf(e) > last.end.getTime()) last.end = new Date(endOf(e));
      last.activeMs += e.durationMs ?? 0;
    } else {
      visits.push({ start: e.createdAt, end: new Date(endOf(e)), activeMs: e.durationMs ?? 0, events: [e] });
    }
  }
  return visits.reverse();
}

export type ListingRollup = { projectId: string; views: number; activeMs: number; downloads: number; clicks: number; last: Date };

/** Per-listing totals for one person's events. Most time spent first. */
export function rollupByListing(events: { kind: string; projectId: string | null; durationMs: number | null; createdAt: Date }[]): ListingRollup[] {
  const m = new Map<string, ListingRollup>();
  for (const e of events) {
    if (!e.projectId) continue;
    const r = m.get(e.projectId) ?? { projectId: e.projectId, views: 0, activeMs: 0, downloads: 0, clicks: 0, last: e.createdAt };
    if (e.kind === "VIEW") { r.views++; r.activeMs += e.durationMs ?? 0; }
    else if (e.kind === "OPEN" || e.kind === "DOWNLOAD") r.downloads++;
    else r.clicks++;
    if (e.createdAt > r.last) r.last = e.createdAt;
    m.set(e.projectId, r);
  }
  return [...m.values()].sort((a, b) => b.activeMs - a.activeMs || b.views - a.views);
}

/** What the browser may send to /api/track. Anything else is dropped. */
export type ClientEvent =
  | { t: "view"; id: string; path: string; at?: number }
  | { t: "time"; id: string; ms: number; scroll?: number }
  | { t: "click" | "select" | "out"; path: string; label?: string; href?: string; at?: number };

export type CleanEvent =
  | { op: "view"; clientId: string; path: string; at: Date }
  | { op: "time"; clientId: string; durationMs: number; scrollPct: number | null }
  | { op: "event"; kind: TrackKind; path: string; label: string | null; target: string | null; at: Date };

/** When it happened: the browser's clock (events are sent in batches), unless it's more than 10 minutes off the server's. */
export function eventTime(at: unknown, now = Date.now()): Date {
  return typeof at === "number" && Number.isFinite(at) && Math.abs(now - at) < 10 * 60 * 1000 ? new Date(Math.min(at, now)) : new Date(now);
}

const CLIENT_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Validates one browser event. Returns null for anything malformed. */
export function cleanClientEvent(raw: unknown, now = Date.now()): CleanEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  if (e.t === "view") {
    const path = cleanPath(e.path);
    return typeof e.id === "string" && CLIENT_ID.test(e.id) && path ? { op: "view", clientId: e.id, path, at: eventTime(e.at, now) } : null;
  }
  if (e.t === "time") {
    if (typeof e.id !== "string" || !CLIENT_ID.test(e.id) || typeof e.ms !== "number" || !Number.isFinite(e.ms) || e.ms < 0) return null;
    const scroll = typeof e.scroll === "number" && Number.isFinite(e.scroll) ? Math.max(0, Math.min(100, Math.round(e.scroll))) : null;
    return { op: "time", clientId: e.id, durationMs: Math.min(Math.round(e.ms), MAX_VIEW_MS), scrollPct: scroll };
  }
  if (e.t === "click" || e.t === "select" || e.t === "out") {
    const path = cleanPath(e.path);
    if (!path) return null;
    const href = typeof e.href === "string" ? (e.t === "out" ? (/^https?:\/\//i.test(e.href) ? e.href.slice(0, 500) : null) : cleanPath(e.href)) : null;
    return { op: "event", kind: e.t === "click" ? "CLICK" : e.t === "select" ? "SELECT" : "LINK_OUT", path, label: clip(e.label, 160), target: href, at: eventTime(e.at, now) };
  }
  return null;
}
