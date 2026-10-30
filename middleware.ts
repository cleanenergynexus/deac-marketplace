import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, readToken } from "./lib/session";

// Hosts that serve the DEAC company website (public/site/index.html) instead of the marketplace.
const COMPANY_HOSTS = new Set(["deacna.com", "www.deacna.com"]);
const MARKETPLACE_URL = process.env.PUBLIC_APP_URL || "https://marketplace.deacna.com";
// Files the company site loads from this app.
const SITE_ASSETS = /^\/(brand\/|site\/|favicon\.ico|icon-\d+\.png|apple-touch-icon\.png)/;

export async function middleware(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();

  // Company website: deacna.com/ shows the site; anything else goes to the marketplace.
  if (COMPANY_HOSTS.has(host)) {
    if (p === "/") return NextResponse.rewrite(new URL("/site/index.html", req.url));
    if (SITE_ASSETS.test(p)) return NextResponse.next();
    return NextResponse.redirect(new URL(p + req.nextUrl.search, MARKETPLACE_URL));
  }
  // Preview the company site on any host at /site.
  if (p === "/site" || p === "/site/") return NextResponse.rewrite(new URL("/site/index.html", req.url));

  // Fast gate for signed-in areas; pages re-check against the database.
  if (!/^\/(admin|agent|marketplace|portal)(\/|$)/.test(p)) return NextResponse.next();
  const s = await readToken(req.cookies.get(COOKIE)?.value);
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));
  if (!s) return to(`/login?next=${encodeURIComponent(p)}`);
  if (/^\/admin(\/|$)/.test(p) && s.role !== "ADMIN") return to("/");
  if (/^\/agent(\/|$)/.test(p) && s.role !== "AGENT") return to("/");
  // Referral agents only use their own portal.
  if (s.role === "AGENT" && !/^\/agent(\/|$)/.test(p)) return to("/agent");
  return NextResponse.next();
}

// Run on every page request; skip Next's build assets and image optimizer.
export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
