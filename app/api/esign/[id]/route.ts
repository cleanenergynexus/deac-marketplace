import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { hashSignToken } from "@/lib/esign-db";
import { isOpen } from "@/lib/esign";
import { openStored } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * The PDF of a signature request: ?file=original (to sign) or ?file=signed. The team can open any; the signer opens
 * their own through the signing link (?t=<token>) or while signed in. ?download asks the browser to save it.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await db.signatureRequest.findUnique({ where: { id } });
  if (!r) return new NextResponse("Not found", { status: 404 });
  const which = req.nextUrl.searchParams.get("file") === "signed" ? "signed" : "original";
  const token = req.nextUrl.searchParams.get("t");
  const u = await currentUser();
  const team = u?.role === "ADMIN";
  if (!team) {
    const now = new Date();
    const hash = token ? hashSignToken(token) : null;
    // Additional signers (e.g. a co-signer) have their own links and may also be signed in.
    const cosigners = await db.signatureSigner.findMany({ where: { requestId: r.id }, select: { tokenHash: true, tokenExpiresAt: true, userId: true, investorId: true } });
    const byToken = !!hash && ((r.tokenHash === hash && !!r.tokenExpiresAt && r.tokenExpiresAt > now) || cosigners.some((c) => c.tokenHash === hash && !!c.tokenExpiresAt && c.tokenExpiresAt > now));
    const byLogin = !!u && (
      (!!u.investorId && r.investorId === u.investorId) || (u.role === "AGENT" && r.agentId === u.id) ||
      cosigners.some((c) => (!!c.userId && c.userId === u.id) || (!!u.investorId && c.investorId === u.investorId))
    );
    if (r.isTemplate || !(byToken || byLogin)) return new NextResponse("Not found", { status: 404 });
    // The unsigned PDF only while it's waiting for a signature; the signed copy once signed.
    if (which === "original" ? !isOpen(r.status) : r.status !== "SIGNED") return new NextResponse("Not available", { status: 404 });
  }
  const key = which === "signed" ? r.signedKey : r.sourceKey;
  if (!key) return new NextResponse("Not signed yet", { status: 404 });
  const stream = await openStored(key);
  if (!stream) return new NextResponse("File is missing from storage", { status: 404 });
  const name = which === "signed" ? (r.signedName ?? `${r.title} - signed.pdf`) : r.sourceName;
  const type = which === "signed" ? (r.signedType ?? "application/pdf") : "application/pdf";
  const inline = type === "application/pdf" && req.nextUrl.searchParams.get("download") === null;
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(stream, {
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
