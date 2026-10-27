import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { saveLocal, storageMode } from "@/lib/storage";

/** Local development without a Blob store: saves the file to ./.data-room and returns its storage key. */
export async function POST(request: Request) {
  if (storageMode() !== "local") return NextResponse.json({ error: "Local storage is only for development" }, { status: 400 });
  const u = await currentUser();
  if (!u || u.role !== "ADMIN") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const f = await request.formData();
  const projectId = String(f.get("projectId") ?? "");
  const file = f.get("file");
  if (!(file instanceof File) || !(await db.project.findUnique({ where: { id: projectId }, select: { id: true } }))) {
    return NextResponse.json({ error: "Bad upload" }, { status: 400 });
  }
  return NextResponse.json({ key: await saveLocal(projectId, file) });
}
