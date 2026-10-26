// Edge-safe session helpers (used by middleware and server code).
import { SignJWT, jwtVerify } from "jose";

export type Session = { uid: string; role: "ADMIN" | "INVESTOR" | "DEVELOPER"; status: string; name: string };
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
