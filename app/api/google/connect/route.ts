import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { STATE_COOKIE, authUrl } from "@/lib/gmail";
import { gmailSetupMissing, redirectUri } from "@/lib/gmail-db";

export const dynamic = "force-dynamic";

/** "Link Gmail" on My account: sends the team member to Google's consent screen. */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") return NextResponse.redirect(new URL("/login?next=/admin/account", req.url));
  if (gmailSetupMissing().length) return NextResponse.redirect(new URL("/admin/account?gmail=setup", req.url));
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl({ clientId: process.env.GOOGLE_CLIENT_ID!, redirectUri: redirectUri(), state, loginHint: me.email }));
  // Ties Google's answer to this browser and this login (checked in the callback).
  res.cookies.set(STATE_COOKIE, `${state}.${me.id}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/google", maxAge: 600 });
  return res;
}
