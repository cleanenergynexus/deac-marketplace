import { NextResponse } from "next/server";
import { syncAllMailboxes } from "@/lib/gmail-db";
import { checkSupportInbox } from "@/lib/support-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron (vercel.json): pulls new email for every linked Gmail, and turns new support email into tasks. Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const support = await checkSupportInbox(true);
  const results = await syncAllMailboxes();
  return NextResponse.json({ results, support });
}
