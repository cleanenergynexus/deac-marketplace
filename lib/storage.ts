import "server-only";
import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { del, get, head, put } from "@vercel/blob";
import { storagePath } from "@/lib/dataroom";

// Data room files live in a private Vercel Blob store in production (Vercel has no persistent disk).
// Without a store, local development keeps them in ./.data-room on disk.

export type StorageMode = "blob" | "local" | "missing";

// Connecting a Blob store in Vercel adds either BLOB_READ_WRITE_TOKEN (older stores)
// or BLOB_STORE_ID, which the SDK pairs with the deployment's own Vercel login (OIDC).
export const hasReadWriteToken = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export function storageMode(): StorageMode {
  if (hasReadWriteToken() || process.env.BLOB_STORE_ID) return "blob";
  return process.env.VERCEL ? "missing" : "local";
}

/** How the browser uploads: a client token (needs the read-write token) or a presigned URL (works with BLOB_STORE_ID). */
export const blobUploadMethod = (): "token" | "presigned" => (hasReadWriteToken() ? "token" : "presigned");

const LOCAL_PREFIX = "local:";
const localRoot = () => path.join(process.cwd(), ".data-room");

/** Local development only: writes an uploaded file to disk and returns its storage key. */
export async function saveLocal(projectId: string, file: File) {
  const rel = path.join(projectId.replace(/[^\w-]/g, ""), randomUUID());
  const abs = path.join(localRoot(), rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, Buffer.from(await file.arrayBuffer()));
  return LOCAL_PREFIX + rel;
}

/** Confirms an upload landed where it should and returns its real size and type. */
export async function verifyStored(key: string, projectId: string): Promise<{ size: number; contentType?: string } | null> {
  if (key.startsWith(LOCAL_PREFIX)) {
    if (storageMode() !== "local") return null;
    const rel = key.slice(LOCAL_PREFIX.length);
    if (!rel.startsWith(projectId + path.sep) && !rel.startsWith(projectId + "/")) return null;
    const st = await fs.stat(localPath(key)).catch(() => null);
    return st ? { size: st.size } : null;
  }
  if (!key.startsWith(`data-room/${projectId}/`)) return null;
  const h = await head(key).catch(() => null);
  return h ? { size: h.size, contentType: h.contentType } : null;
}

function localPath(key: string) {
  const abs = path.resolve(localRoot(), key.slice(LOCAL_PREFIX.length));
  if (!abs.startsWith(localRoot() + path.sep)) throw new Error("Bad storage key");
  return abs;
}

/** Opens a stored file for streaming. */
export async function openStored(key: string): Promise<ReadableStream<Uint8Array> | null> {
  if (key.startsWith(LOCAL_PREFIX)) {
    const abs = localPath(key);
    if (!(await fs.stat(abs).catch(() => null))) return null;
    return Readable.toWeb(createReadStream(abs)) as ReadableStream<Uint8Array>;
  }
  const r = await get(key, { access: "private" });
  return r && r.statusCode === 200 ? r.stream : null;
}

/** Reads a whole stored file into memory (the Document Wizard sends files to Claude). */
export async function readStored(key: string): Promise<Buffer | null> {
  const stream = await openStored(key);
  if (!stream) return null;
  return Buffer.from(await new Response(stream).arrayBuffer());
}

/** Saves a file the app generated (Document Wizard output) and returns its storage key. */
export async function saveGenerated(projectId: string, name: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const mode = storageMode();
  if (mode === "missing") throw new Error("File storage isn't connected. Connect a Vercel Blob store first (see the data room page).");
  if (mode === "local") {
    const rel = path.join(projectId.replace(/[^\w-]/g, ""), randomUUID());
    await fs.mkdir(path.dirname(path.join(localRoot(), rel)), { recursive: true });
    await fs.writeFile(path.join(localRoot(), rel), bytes);
    return LOCAL_PREFIX + rel;
  }
  const r = await put(storagePath(projectId, name), Buffer.from(bytes), { access: "private", contentType, addRandomSuffix: true });
  return r.pathname;
}

/** Best-effort removal; a leftover blob is harmless (nothing links to it). */
export async function deleteStored(keys: string[]) {
  const local = keys.filter((k) => k.startsWith(LOCAL_PREFIX));
  const blobs = keys.filter((k) => !k.startsWith(LOCAL_PREFIX));
  await Promise.all(local.map((k) => fs.rm(localPath(k), { force: true }).catch(() => {})));
  for (let i = 0; i < blobs.length; i += 500) await del(blobs.slice(i, i + 500)).catch((e) => console.error("Blob delete failed", e));
}
