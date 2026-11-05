"use server";
// Team → Technical Support: who the support inbox is, and checking it on demand.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin, requireTeamAdmin } from "@/lib/auth";
import { checkSupportInbox, setSupportMember } from "@/lib/support-db";

export type SupportState = { error?: string; ok?: string } | undefined;

/** Picks the team member whose email is the support address ("" turns the support inbox off). */
export async function saveSupportMember(_: SupportState, f: FormData): Promise<SupportState> {
  await requireTeamAdmin();
  const id = String(f.get("userId") ?? "") || null;
  if (id && !(await db.user.count({ where: { id, role: "ADMIN" } }))) return { error: "That person is not on the team." };
  await setSupportMember(id);
  revalidatePath("/admin", "layout");
  return { ok: id ? "Saved. Emails to their address from now on become tasks for them." : "Support inbox turned off." };
}

/** "Check now": reads the support inbox right away. */
export async function checkSupportNow(_: SupportState): Promise<SupportState> {
  await requireAdmin();
  const r = await checkSupportInbox(true);
  revalidatePath("/admin", "layout");
  if (r.error) return { error: r.error };
  if (r.skipped) return { error: r.skipped };
  return { ok: r.created ? `Created ${r.created} task${r.created === 1 ? "" : "s"} (${r.scanned} email${r.scanned === 1 ? "" : "s"} checked).` : `Up to date (${r.scanned} email${r.scanned === 1 ? "" : "s"} checked, no new tasks).` };
}
