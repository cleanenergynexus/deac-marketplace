import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/lib/auth";
import { STATE_COOKIE, missingScopes } from "@/lib/gmail";
import { linkAccount, syncMailbox } from "@/lib/gmail-db";
import { checkSupportInbox, getSupportMember } from "@/lib/support-db";
import { staffLevel } from "@/lib/tasks";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Google sends the team member back here after the consent screen. Stores the tokens, then runs the first sync.
 * When an Admin linked the Technical Support inbox (Team page), the tokens go to that member and its email starts becoming tasks.
 */
export async function GET(req: NextRequest) {
  const me = await currentUser();
  const [state, uid, targetId = uid] = (req.cookies.get(STATE_COOKIE)?.value ?? "").split(".");
  const forSupport = !!me && !!targetId && targetId !== me.id;
  const back = (q: string) => {
    const res = NextResponse.redirect(new URL(`${forSupport ? "/admin/team" : "/admin/account"}?${q}`, req.url));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/google" });
    return res;
  };
  if (!me || me.role !== "ADMIN") return NextResponse.redirect(new URL("/login?next=/admin/account", req.url));
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(`gmail=denied`);
  if (!state || state !== p.get("state") || uid !== me.id) return back("gmail=expired");
  if (forSupport) {
    const support = staffLevel(me.staffLevel) === "ADMIN" ? await getSupportMember() : null;
    if (support?.id !== targetId) return back("gmail=expired");
  }
  const code = p.get("code");
  if (!code) return back("gmail=denied");
  try {
    const { scope } = await linkAccount(targetId, code);
    if (missingScopes(scope).length) return back("gmail=scopes");
  } catch (e) {
    return back(`gmail=error&msg=${encodeURIComponent((e instanceof Error ? e.message : String(e)).slice(0, 300))}`);
  }
  await syncMailbox(targetId);
  if (forSupport || (await getSupportMember())?.id === me.id) await checkSupportInbox(true);
  return back("gmail=linked");
}
