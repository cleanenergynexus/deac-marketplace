"use server";
// Outreach → Email Templates: edit the wording of the branded welcome emails, reset to default, send yourself a test.
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { appUrl, emailSettings } from "@/lib/email-templates-db";
import { isTemplateKey, mergeTemplate, renderTemplate, TEMPLATE_INFO, type EmailTemplate } from "@/lib/email-templates";

type State = { error?: string; ok?: boolean; message?: string } | undefined;

const FIELDS: (keyof EmailTemplate)[] = ["subject", "heading", "intro", "buttonLabel", "steps", "closing", "footerNote"];

function fromForm(f: FormData): EmailTemplate {
  const out = {} as EmailTemplate;
  for (const k of FIELDS) out[k] = String(f.get(k) ?? "").replace(/\r\n/g, "\n").trim();
  return out;
}

export async function saveEmailTemplate(_: State, f: FormData): Promise<State> {
  const admin = await requireAdmin();
  const key = String(f.get("key"));
  if (!isTemplateKey(key)) return { error: "Unknown template." };
  const t = fromForm(f);
  if (!t.subject || !t.intro || !t.buttonLabel) return { error: "Subject, message and button text are required." };
  // Only what differs from the default is stored, so later default improvements still reach untouched fields.
  const d = TEMPLATE_INFO[key].defaults;
  const data = Object.fromEntries(FIELDS.map((k) => [k, t[k] === d[k] ? "" : t[k]])) as EmailTemplate;
  await db.emailTemplate.upsert({ where: { key }, create: { key, ...data, updatedBy: admin.name }, update: { ...data, updatedBy: admin.name } });
  revalidatePath("/admin/outreach/templates", "layout");
  return { ok: true, message: "Saved. The next email of this kind uses this wording." };
}

export async function resetEmailTemplate(f: FormData) {
  await requireAdmin();
  const key = String(f.get("key"));
  if (isTemplateKey(key)) await db.emailTemplate.deleteMany({ where: { key } });
  revalidatePath("/admin/outreach/templates", "layout");
}

/** Sends the wording on screen (saved or not) to the signed-in team member, with sample details. */
export async function sendTestEmail(_: State, f: FormData): Promise<State> {
  const admin = await requireAdmin();
  const key = String(f.get("key"));
  if (!isTemplateKey(key)) return { error: "Unknown template." };
  const tpl = mergeTemplate(key, fromForm(f));
  const link = TEMPLATE_INFO[key].screen === "SET_PASSWORD" ? `${appUrl()}/invite/test-link` : `${appUrl()}/login`;
  const mail = renderTemplate(key, tpl, { firstName: admin.name.split(" ")[0], email: admin.email, sender: admin.name, link, days: 14 }, emailSettings());
  const res = await sendEmail({ to: admin.email, toName: admin.name, subject: `[Test] ${mail.subject}`, text: mail.text, html: mail.html, fromUserId: admin.id });
  if (res.status === "FAILED") return { error: `The test email failed: ${res.error ?? "unknown error"}` };
  if (res.status === "LOGGED") return { error: "No email provider is connected (link Gmail under My Account, or add RESEND_API_KEY), so the test was only logged." };
  return { ok: true, message: `Test sent to ${admin.email}.` };
}
