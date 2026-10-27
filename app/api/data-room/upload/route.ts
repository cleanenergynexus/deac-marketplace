import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";

/**
 * Issues short-lived tokens so the browser uploads data room files straight to the private Blob store
 * (no 4.5 MB function limit). The file is recorded in the data room afterwards by registerFile.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const u = await currentUser();
        if (!u || u.role !== "ADMIN") throw new Error("Only the DEAC team can upload to a data room");
        const projectId = clientPayload ?? "";
        if (!projectId || !pathname.startsWith(`data-room/${projectId}/`) || !(await db.project.findUnique({ where: { id: projectId }, select: { id: true } }))) {
          throw new Error("Unknown project");
        }
        return { addRandomSuffix: true, maximumSizeInBytes: 5 * 1024 ** 3 };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
