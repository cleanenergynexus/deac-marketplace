import { requireAgent } from "@/lib/auth";
import { referDeveloper, referInvestor } from "@/app/actions/agent";
import { ActionForm } from "@/components/ActionForm";
import { PhoneInput } from "@/components/PhoneInput";
import { Field, PageHeader, Section, Select } from "@/components/ui";
import { INVESTOR_TYPES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function Refer() {
  await requireAgent();
  return (
    <div className="space-y-6">
      <PageHeader title="Refer a contact" subtitle="Share a developer or investor with DEAC. They're added to the CRM under your name, your DEAC partner is notified, and you can follow everything that happens with them here." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Developer">
          <ActionForm action={referDeveloper} submitLabel="Refer developer" success="Thanks! The developer is in the DEAC CRM and your partner has been notified. Find them under Developer contacts." className="grid gap-3 sm:grid-cols-2">
            <Field label="Company"><input name="company" required className="input" /></Field>
            <Field label="Website"><input name="website" className="input" /></Field>
            <Field label="Contact name"><input name="name" required className="input" /></Field>
            <Field label="Job title"><input name="title" className="input" placeholder="e.g. CEO" /></Field>
            <Field label="Email"><input name="email" type="email" className="input" /></Field>
            <Field label="Phone"><PhoneInput name="phone" /></Field>
            <Field label="Notes for DEAC" className="sm:col-span-2"><textarea name="notes" rows={3} className="input" placeholder="Projects they have, what they need, how you know them…" /></Field>
          </ActionForm>
        </Section>
        <Section title="Investor">
          <ActionForm action={referInvestor} submitLabel="Refer investor" success="Thanks! The investor is in the DEAC CRM and your partner has been notified. Find them under Investor contacts." className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><input name="name" required className="input" /></Field>
            <Field label="Email"><input name="email" type="email" required className="input" /></Field>
            <Field label="Company"><input name="firm" className="input" /></Field>
            <Field label="Job title"><input name="title" className="input" /></Field>
            <Field label="Phone"><PhoneInput name="phone" /></Field>
            <Field label="Investor type"><Select name="investorType" options={INVESTOR_TYPES} placeholder="—" /></Field>
            <Field label="Notes for DEAC" className="sm:col-span-2"><textarea name="notes" rows={3} className="input" placeholder="Mandate, check size, markets, how you know them…" /></Field>
          </ActionForm>
        </Section>
      </div>
      <p className="text-xs text-slate-500">Already in the DEAC CRM? Your partner confirms the referral and links it to you.</p>
    </div>
  );
}
