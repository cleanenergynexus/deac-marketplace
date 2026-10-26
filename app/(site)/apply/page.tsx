import { applyForAccess } from "@/app/actions/public";
import { ActionForm } from "@/components/ActionForm";
import { Checks } from "@/components/Checks";
import { Field, Select } from "@/components/ui";
import { DEAL_TYPES, FACILITY_TYPES, INVESTOR_TYPES, US_STATES } from "@/lib/constants";

export default function Apply() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Request investor access</h1>
      <p className="mt-1 text-sm text-slate-600">DEAC is a private, curated network. Tell us about your mandate so we can match you with the right opportunities.</p>
      <ActionForm action={applyForAccess} submitLabel="Submit application" className="card mt-6 space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input name="name" required className="input" /></Field>
          <Field label="Firm"><input name="firm" className="input" /></Field>
          <Field label="Title"><input name="title" className="input" /></Field>
          <Field label="Phone"><input name="phone" className="input" /></Field>
          <Field label="Email"><input name="email" type="email" required className="input" /></Field>
          <Field label="Create password"><input name="password" type="password" minLength={8} required className="input" /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Investor type"><Select name="investorType" options={INVESTOR_TYPES} placeholder="Select…" required /></Field>
          <Field label="Min check ($)"><input name="checkMin" inputMode="numeric" className="input" placeholder="5,000,000" /></Field>
          <Field label="Max check ($)"><input name="checkMax" inputMode="numeric" className="input" placeholder="50,000,000" /></Field>
          <Field label="Min MW"><input name="mwMin" inputMode="decimal" className="input" /></Field>
          <Field label="Max MW"><input name="mwMax" inputMode="decimal" className="input" /></Field>
          <Field label="How did you hear about us?"><input name="source" className="input" /></Field>
        </div>
        <Field label="Deal types of interest"><Checks name="dealTypes" options={DEAL_TYPES} /></Field>
        <Field label="Facility types"><Checks name="facilityTypes" options={FACILITY_TYPES} /></Field>
        <Field label="Preferred states / markets"><Checks name="states" options={US_STATES} /></Field>
        <Field label="Anything else about your mandate?"><textarea name="notes" rows={3} className="input" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="accredited" /> I confirm I am an accredited / qualified institutional investor.</label>
      </ActionForm>
    </div>
  );
}
