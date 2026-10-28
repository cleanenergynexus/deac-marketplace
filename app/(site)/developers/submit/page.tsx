import { submitProject } from "@/app/actions/public";
import { PhoneInput } from "@/components/PhoneInput";
import { ActionForm } from "@/components/ActionForm";
import { Field, Select } from "@/components/ui";
import { DEAL_TYPES, FACILITY_TYPES, PROJECT_STATUSES, US_STATES } from "@/lib/constants";
import { OPTIONS } from "@/lib/valuation";
import { MoneyInput } from "@/components/MoneyInput";

export default function SubmitProject() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Submit a data center project</h1>
      <p className="mt-1 text-sm text-slate-600">Developers and owners: share your project and our team will evaluate it for the DEAC investor network. Submissions are confidential.</p>
      <ActionForm action={submitProject} submitLabel="Submit project" className="card mt-6 space-y-6 p-6">
        <h2 className="font-semibold">Your company</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company"><input name="company" required className="input" /></Field>
          <Field label="Contact name"><input name="contactName" required className="input" /></Field>
          <Field label="Email"><input name="email" type="email" required className="input" /></Field>
          <Field label="Phone"><PhoneInput name="phone" /></Field>
          <Field label="Website" className="sm:col-span-2"><input name="website" className="input" /></Field>
          <Field label="Track record (projects, MW delivered)" className="sm:col-span-2"><textarea name="experience" rows={3} className="input" /></Field>
        </div>
        <h2 className="font-semibold">The project</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Project name" className="sm:col-span-3"><input name="title" className="input" /></Field>
          <Field label="State"><Select name="state" options={US_STATES} placeholder="Select…" required /></Field>
          <Field label="City / county"><input name="city" className="input" /></Field>
          <Field label="Capacity (MW)"><input name="mw" inputMode="decimal" required className="input" /></Field>
          <Field label="Facility type"><Select name="facilityType" options={FACILITY_TYPES} /></Field>
          <Field label="Seeking"><Select name="dealType" options={DEAL_TYPES} /></Field>
          <Field label="Funding needed ($)"><MoneyInput name="fundingNeeded" /></Field>
          <Field label="Project stage"><Select name="projectStatus" options={PROJECT_STATUSES} /></Field>
          <Field label="Power status"><Select name="powerStatus" options={OPTIONS.powerStatus} /></Field>
          <Field label="Months to power"><input name="monthsToPower" inputMode="numeric" className="input" /></Field>
          <Field label="Power rate (¢/kWh)"><input name="powerRateCents" inputMode="decimal" className="input" /></Field>
          <Field label="Summary" className="sm:col-span-3"><textarea name="summary" rows={4} className="input" /></Field>
        </div>
      </ActionForm>
    </div>
  );
}
