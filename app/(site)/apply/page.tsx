import { applyForAccess } from "@/app/actions/public";
import { PhoneInput } from "@/components/PhoneInput";
import { ActionForm } from "@/components/ActionForm";
import { Checks } from "@/components/Checks";
import { Field, Select } from "@/components/ui";
import { DEAL_TYPES, FACILITY_TYPES, INVESTOR_TYPES } from "@/lib/constants";
import { MarketPicker } from "@/components/MarketPicker";
import { MoneyInput } from "@/components/MoneyInput";

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
          <Field label="Phone"><PhoneInput name="phone" /></Field>
          <Field label="Email"><input name="email" type="email" required className="input" /></Field>
          <Field label="Create password"><input name="password" type="password" minLength={8} required className="input" /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Investor type"><Select name="investorType" options={INVESTOR_TYPES} placeholder="Select…" required /></Field>
          <Field label="Min check ($)"><MoneyInput name="checkMin" placeholder="5,000,000" /></Field>
          <Field label="Max check ($)"><MoneyInput name="checkMax" placeholder="50,000,000" /></Field>
          <Field label="Min MW"><input name="mwMin" inputMode="decimal" className="input" /></Field>
          <Field label="Max MW"><input name="mwMax" inputMode="decimal" className="input" /></Field>
          <Field label="How did you hear about us?"><input name="source" className="input" /></Field>
        </div>
        <Field label="Deal types of interest"><Checks name="dealTypes" options={DEAL_TYPES} /></Field>
        <Field label="Facility types"><Checks name="facilityTypes" options={FACILITY_TYPES} /></Field>
        <Field label="Markets of interest" group><MarketPicker /></Field>
        <Field label="Anything else about your mandate?"><textarea name="notes" rows={3} className="input" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="accredited" /> I confirm I am an accredited / qualified institutional investor.</label>
      </ActionForm>
    </div>
  );
}
