import { NextResponse } from "next/server";
import { syncAllMailboxes } from "@/lib/gmail-db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel Cron (vercel.json): pulls new email for every linked Gmail. Vercel sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const results = await syncAllMailboxes();
  return NextResponse.json({ results });
}
