import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, readToken } from "./lib/session";

// Fast gate; pages re-check against the database.
export async function middleware(req: NextRequest) {
  const s = await readToken(req.cookies.get(COOKIE)?.value);
  const p = req.nextUrl.pathname;
  const to = (path: string) => NextResponse.redirect(new URL(path, req.url));
  if (!s) return to(`/login?next=${encodeURIComponent(p)}`);
  if (p.startsWith("/admin") && s.role !== "ADMIN") return to("/");
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*", "/marketplace/:path*", "/portal/:path*"] };
