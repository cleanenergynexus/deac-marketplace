import { NextResponse } from "next/server";
import { checkSupportInbox } from "@/lib/support-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Turns new emails to the Technical Support inbox into tasks. Same `Authorization: Bearer $CRON_SECRET` as the Gmail sync.
 * Admin page loads and the nightly Gmail sync already run this; on Vercel Pro, add a frequent schedule in vercel.json (e.g. every 5 minutes).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await checkSupportInbox(true));
}
