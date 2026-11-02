// Encrypts secrets at rest (Gmail tokens) with AES-256-GCM. The key comes from GMAIL_TOKEN_KEY.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

/** 32-byte key from any string: a base64 key from `openssl rand -base64 32` works, and so does a long passphrase. */
function keyFrom(secret: string): Buffer {
  const raw = Buffer.from(secret, "base64");
  return raw.length === 32 && raw.toString("base64") === secret.trim() ? raw : createHash("sha256").update(secret).digest();
}

export function tokenKey(): string {
  const k = process.env.GMAIL_TOKEN_KEY;
  if (!k || k.length < 16) throw new Error("GMAIL_TOKEN_KEY is not set (it encrypts the Gmail tokens). Add a random value of 32+ characters in Vercel.");
  return k;
}

/** "v1.<iv>.<tag>.<ciphertext>", all base64url. */
export function seal(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyFrom(secret), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [PREFIX, iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** Reverses seal(). Throws when the value was changed or the key is wrong. */
export function open(sealed: string, secret: string): string {
  const [v, iv, tag, data] = sealed.split(".");
  if (v !== PREFIX || !iv || !tag || data === undefined) throw new Error("Not a sealed value.");
  const d = createDecipheriv("aes-256-gcm", keyFrom(secret), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
}
