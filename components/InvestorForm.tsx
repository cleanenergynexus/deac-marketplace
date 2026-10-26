import type { Investor } from "@prisma/client";
import { Field, Select } from "@/components/ui";
import { Checks } from "@/components/Checks";
import { DEAL_TYPES, FACILITY_TYPES, INVESTOR_STAGES, INVESTOR_TYPES } from "@/lib/constants";
import { MarketPicker } from "@/components/MarketPicker";
import { csv } from "@/lib/format";
import { SaveButton } from "@/components/SaveButton";

export function InvestorForm({ inv, action }: { inv?: Investor; action: (f: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-5">
      {inv && <input type="hidden" name="id" value={inv.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name"><input name="name" defaultValue={inv?.name} required className="input" /></Field>
        <Field label="Firm"><input name="firm" defaultValue={inv?.firm ?? ""} className="input" /></Field>
        <Field label="Title"><input name="title" defaultValue={inv?.title ?? ""} className="input" /></Field>
        {!inv && <Field label="Email"><input name="email" type="email" required className="input" /></Field>}
        <Field label="Phone"><input name="phone" defaultValue={inv?.phone ?? ""} className="input" /></Field>
        <Field label="Investor type"><Select name="investorType" options={INVESTOR_TYPES} defaultValue={inv?.investorType} placeholder="—" /></Field>
        {!inv && <Field label="Stage"><Select name="stage" options={INVESTOR_STAGES} /></Field>}
        <Field label="Min check ($)"><input name="checkMin" defaultValue={inv?.checkMin ?? ""} className="input" /></Field>
        <Field label="Max check ($)"><input name="checkMax" defaultValue={inv?.checkMax ?? ""} className="input" /></Field>
        <Field label="Source"><input name="source" defaultValue={inv?.source ?? ""} className="input" /></Field>
        <Field label="Min MW"><input name="mwMin" defaultValue={inv?.mwMin ?? ""} className="input" /></Field>
        <Field label="Max MW"><input name="mwMax" defaultValue={inv?.mwMax ?? ""} className="input" /></Field>
        <Field label="Relationship owner"><input name="owner" defaultValue={inv?.owner ?? ""} className="input" /></Field>
        <Field label="Tags (comma separated)" className="sm:col-span-3"><input name="tags" defaultValue={inv?.tags} className="input" placeholder="hyperscale, PR, tier-1" /></Field>
      </div>
      <Field label="Deal types"><Checks name="dealTypes" options={DEAL_TYPES} selected={csv(inv?.dealTypes)} /></Field>
      <Field label="Facility types"><Checks name="facilityTypes" options={FACILITY_TYPES} selected={csv(inv?.facilityTypes)} /></Field>
      <Field label="Markets of interest"><MarketPicker regions={csv(inv?.preferredRegions)} states={csv(inv?.preferredStates)} /></Field>
      <Field label="Notes"><textarea name="notes" rows={3} defaultValue={inv?.notes ?? ""} className="input" /></Field>
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="accredited" defaultChecked={inv?.accredited} /> Accredited / QIB</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="ndaSigned" defaultChecked={inv?.ndaSigned} /> NDA signed</label>
      </div>
      {inv ? <SaveButton label="Save changes" /> : <button className="btn">Create investor</button>}
    </form>
  );
}
