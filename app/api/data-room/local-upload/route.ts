import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { saveLocal, storageMode } from "@/lib/storage";
import { agentProject } from "@/lib/agents-db";

/** Local development without a Blob store: saves the file to ./.data-room and returns its storage key. */
export async function POST(request: Request) {
  if (storageMode() !== "local") return NextResponse.json({ error: "Local storage is only for development" }, { status: 400 });
  const u = await currentUser();
  const agent = u?.role === "AGENT" && u.status === "APPROVED";
  if (!u || (u.role !== "ADMIN" && !agent)) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const f = await request.formData();
  const projectId = String(f.get("projectId") ?? "");
  const file = f.get("file");
  const project = agent ? await agentProject(u.id, projectId) : await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!(file instanceof File) || !project) {
    return NextResponse.json({ error: "Bad upload" }, { status: 400 });
  }
  return NextResponse.json({ key: await saveLocal(projectId, file) });
}
