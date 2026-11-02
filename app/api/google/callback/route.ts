import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { STATE_COOKIE, missingScopes } from "@/lib/gmail";
import { linkAccount, syncMailbox } from "@/lib/gmail-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Google sends the team member back here after the consent screen. Stores the tokens, then runs the first sync. */
export async function GET(req: NextRequest) {
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`/admin/account?${q}`, req.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return res;
  };
  const me = await currentUser();
  if (!me || me.role !== "ADMIN") return NextResponse.redirect(new URL("/login?next=/admin/account", req.url));
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(`gmail=denied`);
  const [state, uid] = (req.cookies.get(STATE_COOKIE)?.value ?? "").split(".");
  if (!state || state !== p.get("state") || uid !== me.id) return back("gmail=expired");
  const code = p.get("code");
  if (!code) return back("gmail=denied");
  try {
    const { scope } = await linkAccount(me.id, code);
    if (missingScopes(scope).length) return back("gmail=scopes");
  } catch (e) {
    return back(`gmail=error&msg=${encodeURIComponent((e instanceof Error ? e.message : String(e)).slice(0, 300))}`);
  }
  await syncMailbox(me.id);
  return back("gmail=linked");
}
