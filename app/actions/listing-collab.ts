"use server";
// The DEAC team's side of a listing's discussion with the referral agent(s) who brought it in.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { listingAgents } from "@/lib/listing-collab-db";

type State = { error?: string; ok?: boolean } | undefined;
const appUrl = () => process.env.PUBLIC_APP_URL ?? "";

/** A team member's message on the listing. The agents who brought the listing in get an email. */
export async function teamPostComment(_: State, f: FormData): Promise<State> {
  const me = await requireAdmin();
  const p = await db.project.findUnique({ where: { id: String(f.get("projectId") ?? "") }, select: { id: true, code: true, title: true, developerId: true } });
  if (!p) return { error: "That listing no longer exists." };
  const body = (f.get("body") as string | null)?.trim().slice(0, 5000);
  if (!body) return { error: "Write a message first." };
  await db.listingComment.create({ data: { projectId: p.id, authorId: me.id, authorName: me.name, body } });
  for (const a of await listingAgents(p.developerId)) {
    await sendEmail({ to: a.email, toName: a.name, fromUserId: me.id, subject: `${me.name} commented on ${p.code}`, text: `${me.name} wrote on ${p.code} · ${p.title}:\n\n${body}\n\nReply on the listing: ${appUrl()}/agent/listings/${p.id}?tab=discussion\n\n— DEAC Marketplace` }).catch((e) => console.error("[collab] couldn't email the agent", e));
  }
  revalidatePath(`/admin/projects/${p.id}`);
  revalidatePath(`/agent/listings/${p.id}`);
  return { ok: true };
}
