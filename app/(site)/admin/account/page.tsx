import { currentUser } from "@/lib/auth";
import { changeOwnPassword } from "@/app/actions/admin";
import { updateMyProfile } from "@/app/actions/agents-admin";
import { PhoneInput } from "@/components/PhoneInput";
import { ActionForm } from "@/components/ActionForm";
import { Field, PageHeader, Section } from "@/components/ui";
import { GmailPanel } from "@/components/GmailPanel";
import { getGmailAccount, gmailSetupMissing } from "@/lib/gmail-db";

export const dynamic = "force-dynamic";
// "Sync now" can take a while on a full mailbox.
export const maxDuration = 300;

const GMAIL_NOTICE: Record<string, { tone: "ok" | "error"; text: string }> = {
  linked: { tone: "ok", text: "Gmail linked. Your recent emails with CRM contacts are being filed on their records." },
  denied: { tone: "error", text: "Gmail wasn't linked: the Google screen was cancelled." },
  expired: { tone: "error", text: "That Google sign-in took too long or came from another browser. Try Link Gmail again." },
  scopes: { tone: "error", text: "Gmail is linked, but Google didn't grant every permission. Click Link again and leave both Gmail boxes ticked on Google's screen." },
  setup: { tone: "error", text: "Gmail linking isn't set up on the server yet (see below)." },
  error: { tone: "error", text: "Gmail wasn't linked." },
};

export default async function Account({ searchParams }: { searchParams: Promise<{ gmail?: string; msg?: string }> }) {
  const me = await currentUser();
  const { gmail, msg } = await searchParams;
  const linked = me ? await getGmailAccount(me.id) : null;
  const notice = gmail ? GMAIL_NOTICE[gmail] : null;
  return (
    <div className="space-y-6">
      <PageHeader title="My account" subtitle={`${me?.name} · ${me?.email}`} />
      <Section title="Gmail">
        {notice && <p className={`mb-4 rounded p-3 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{notice.text}{gmail === "error" && msg ? ` ${msg}` : ""}</p>}
        <GmailPanel
          linked={linked && { email: linked.email, lastSyncAt: linked.lastSyncAt, lastSyncError: linked.lastSyncError, lastSyncAdded: linked.lastSyncAdded }}
          missing={gmailSetupMissing()}
        />
      </Section>
      <Section title="Contact details for referral agents">
        <p className="mb-3 text-sm text-slate-600">Referral agents you partner with see these on their portal, so they can call you or book a meeting.</p>
        <ActionForm action={updateMyProfile} submitLabel="Save" success="Saved." className="grid max-w-xl gap-4 sm:grid-cols-2">
          <Field label="Phone"><PhoneInput name="phone" defaultValue={me?.phone} /></Field>
          <Field label="Meeting booking link"><input name="bookingUrl" type="url" defaultValue={me?.bookingUrl ?? ""} className="input" placeholder="https://calendly.com/…" /></Field>
        </ActionForm>
      </Section>
      <Section title="Change password">
        <ActionForm action={changeOwnPassword} submitLabel="Update password" success="Password updated." className="grid max-w-md gap-4">
          <Field label="Current password"><input name="current" type="password" required className="input" /></Field>
          <Field label="New password (10+ characters)"><input name="next" type="password" minLength={10} required className="input" /></Field>
        </ActionForm>
      </Section>
    </div>
  );
}
