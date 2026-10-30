import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { currentUser, listingAccess } from "@/lib/auth";
import { atLeast, docStage } from "@/lib/disclosure";
import { inlineSafe } from "@/lib/dataroom";
import { openStored } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Opens a data room file. The DEAC team can open anything; an investor only a file shared on a
 * listing they can see, once they've reached that document's access tier.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  if (!u) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname)}`, req.url));
  const file = await db.dataRoomFile.findUnique({ where: { id }, include: { documents: { select: { access: true } }, project: { select: { visibility: true } } } });
  if (!file) return new NextResponse("Not found", { status: 404 });
  // Referral agents can add files to a data room but never open or download them.
  if (u.role === "AGENT") return new NextResponse("Referral agents can upload to the data room but not download from it.", { status: 403 });

  if (u.role !== "ADMIN") {
    const member = u.role === "INVESTOR" && u.status === "APPROVED";
    if (!member || file.project.visibility === "DRAFT" || !file.documents.length) return new NextResponse("Not found", { status: 404 });
    const { stage } = await listingAccess(file.projectId, u);
    if (!file.documents.some((d) => atLeast(stage, docStage(d.access)))) return new NextResponse("This document unlocks at a later stage of the deal.", { status: 403 });
  }

  const stream = await openStored(file.storageKey);
  if (!stream) return new NextResponse("File is missing from storage", { status: 404 });
  const inline = inlineSafe(file.contentType) && req.nextUrl.searchParams.get("download") === null;
  const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(stream, {
    headers: {
      "Content-Type": inline ? file.contentType : "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
