// Edge-safe session helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export type Session = { uid: string; role: "ADMIN" | "INVESTOR" | "DEVELOPER" | "AGENT"; status: string; name: string };
export const COOKIE = "deac_session";

const key = () => new TextEncoder().encode(process.env.SESSION_SECRET || "dev-only-secret-change-me");

export async function signSession(s: Session) {
  return new SignJWT(s as unknown as Record<string, unknown>).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("14d").sign(key());
}

export async function readToken(token?: string): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

/** "View as agent": a team member previewing a referral agent's portal. Separate cookie, so their own session stays as it is. */
export const VIEW_AS_COOKIE = "deac_view_as";
export type ViewAs = { admin: string; agent: string };

export async function signViewAs(v: ViewAs) {
  return new SignJWT(v as unknown as Record<string, unknown>).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("2h").sign(key());
}

export async function readViewAs(token?: string): Promise<ViewAs | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    return typeof payload.admin === "string" && typeof payload.agent === "string" ? { admin: payload.admin, agent: payload.agent } : null;
  } catch {
    return null;
  }
}
