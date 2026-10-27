import { NextResponse } from "next/server";
import { handleUpload, handleUploadPresigned, type HandleUploadBody, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { hasReadWriteToken } from "@/lib/storage";

const MAX_BYTES = 5 * 1024 ** 3;

/** Only the DEAC team, and only into this project's folder of the store. */
async function authorize(pathname: string, clientPayload: string | null) {
  const u = await currentUser();
  if (!u || u.role !== "ADMIN") throw new Error("Only the DEAC team can upload to a data room");
  const projectId = clientPayload ?? "";
  if (!projectId || !pathname.startsWith(`data-room/${projectId}/`) || pathname.includes("..") || !(await db.project.findUnique({ where: { id: projectId }, select: { id: true } }))) {
    throw new Error("Unknown project");
  }
}

/**
 * Lets the browser upload data room files straight to the private Blob store (no 4.5 MB function limit).
 * The file is recorded in the data room afterwards by registerFile.
 */
export async function POST(request: Request) {
  const body = await request.json();
  try {
    if (hasReadWriteToken()) {
      const result = await handleUpload({
        body: body as HandleUploadBody,
        request,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          await authorize(pathname, clientPayload);
          return { addRandomSuffix: true, maximumSizeInBytes: MAX_BYTES };
        },
      });
      return NextResponse.json(result);
    }
    // Store connected with BLOB_STORE_ID: presigned upload URL, signed with the deployment's Vercel OIDC login.
    const result = await handleUploadPresigned({
      body: body as HandleUploadPresignedBody,
      request,
      // We don't use upload-completed callbacks (registerFile records the file), so there is nothing to verify.
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || "unused",
      getSignedToken: async (pathname, clientPayload) => {
        await authorize(pathname, clientPayload);
        const token = await issueSignedToken({ pathname, operations: ["put"], maximumSizeInBytes: MAX_BYTES, validUntil: Date.now() + 60 * 60 * 1000 });
        return { token, urlOptions: { maximumSizeInBytes: MAX_BYTES } };
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("Data room upload token failed", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
