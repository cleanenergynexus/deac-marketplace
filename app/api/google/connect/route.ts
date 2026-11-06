import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { STATE_COOKIE, authUrl } from "@/lib/gmail";
import { gmailSetupMissing, redirectUri } from "@/lib/gmail-db";
import { getSupportMember } from "@/lib/support-db";
import { staffLevel } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/**
 * "Link Gmail" on My account: sends the team member to Google's consent screen.
 * `?for=support` (Team → Technical Support, Admins only) links the support inbox's Gmail instead of your own.
 */
export async function GET(req: Request) {
  const me = await currentUser();
  const forSupport = new URL(req.url).searchParams.get("for") === "support";
  const page = forSupport ? "/admin/team" : "/admin/account";
  if (!me || me.role !== "ADMIN") return NextResponse.redirect(new URL(`/login?next=${page}`, req.url));
  if (gmailSetupMissing().length) return NextResponse.redirect(new URL(`${page}?gmail=setup`, req.url));
  let target = { id: me.id, email: me.email };
  if (forSupport) {
    const support = staffLevel(me.staffLevel) === "ADMIN" ? await getSupportMember() : null;
    if (!support) return NextResponse.redirect(new URL("/admin/team?gmail=error&msg=Pick%20the%20Technical%20Support%20member%20first.", req.url));
    target = { id: support.id, email: support.email };
  }
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl({ clientId: process.env.GOOGLE_CLIENT_ID!, redirectUri: redirectUri(), state, loginHint: target.email }));
  // Ties Google's answer to this browser, this login, and whose Gmail is being linked (checked in the callback).
  res.cookies.set(STATE_COOKIE, `${state}.${me.id}.${target.id}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/google", maxAge: 600 });
  return res;
}
