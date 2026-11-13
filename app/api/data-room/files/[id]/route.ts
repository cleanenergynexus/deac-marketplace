import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { currentUser, isOriginator, listingAccess } from "@/lib/auth";
import { atLeast, docStage } from "@/lib/disclosure";
import { inlineSafe } from "@/lib/dataroom";
import { openStored } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * Opens a data room file. The DEAC team can open anything, and a referral agent anything in the data room of a
 * listing they brought in; an investor only a file shared on a listing they can see, once they've reached that
 * document's access tier.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await currentUser();
  if (!u) return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(req.nextUrl.pathname)}`, req.url));
  // A file can be shared on several listings: linked listings (Sale / Lease / Financing) share one data room,
  // and each listing decides its own access tier. The investor needs access through at least one of them.
  const file = await db.dataRoomFile.findUnique({ where: { id }, include: { documents: { select: { access: true, projectId: true, project: { select: { visibility: true } } } } } });
  if (!file) return new NextResponse("Not found", { status: 404 });
  // Referral agents open the whole data room of a listing they brought in (lib/agents.ts agentProjectWhere), drafts
  // included. Elsewhere, like investors, they open only files shared on a live listing at the Teaser level.
  const agentsOwn = u.role === "AGENT" && u.status === "APPROVED" && (await isOriginator(u.id, file.projectId));

  if (u.role !== "ADMIN" && !agentsOwn) {
    const member = (u.role === "INVESTOR" || u.role === "AGENT") && u.status === "APPROVED";
    const live = file.documents.filter((d) => d.project.visibility !== "DRAFT");
    if (!member || !live.length) return new NextResponse("Not found", { status: 404 });
    let allowed = false;
    for (const projectId of new Set(live.map((d) => d.projectId))) {
      const { stage } = await listingAccess(projectId, u);
      if (live.some((d) => d.projectId === projectId && atLeast(stage, docStage(d.access)))) { allowed = true; break; }
    }
    if (!allowed) return new NextResponse("This document unlocks at a later stage of the deal.", { status: 403 });
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
