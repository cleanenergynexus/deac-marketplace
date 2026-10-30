import { currentUser } from "@/lib/auth";
import { changeOwnPassword } from "@/app/actions/admin";
import { updateMyProfile } from "@/app/actions/agents-admin";
import { PhoneInput } from "@/components/PhoneInput";
import { ActionForm } from "@/components/ActionForm";
import { Field, PageHeader, Section } from "@/components/ui";

export default async function Account() {
  const me = await currentUser();
  return (
    <div className="space-y-6">
      <PageHeader title="My account" subtitle={`${me?.name} · ${me?.email}`} />
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
