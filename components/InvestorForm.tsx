import type { Investor } from "@prisma/client";
import { Field, Select } from "@/components/ui";
import { Checks } from "@/components/Checks";
import { DEAL_TYPES, FACILITY_TYPES, INVESTOR_STAGES, INVESTOR_TYPES } from "@/lib/constants";
import { MarketPicker } from "@/components/MarketPicker";
import { csv } from "@/lib/format";
import { SaveButton } from "@/components/SaveButton";
import { MoneyInput } from "@/components/MoneyInput";
import { PhoneInput } from "@/components/PhoneInput";
import { AddressFields } from "@/components/AddressFields";
import { ReferredBySelect, type AgentOption } from "@/components/ReferredBySelect";

/**
 * Investor contact profile and mandate. The Company field picks an Investor CRM company by name; a new name creates it.
 * `firm` pre-fills the company (adding from a company page); `projectId` links a new investor to that listing.
 */
export function InvestorForm({ inv, action, firms = [], firm, projectId, agents }: { inv?: Investor; action: (f: FormData) => Promise<void>; firms?: string[]; firm?: string | null; projectId?: string | null; agents?: AgentOption[] }) {
  const home = inv?.country ?? "US";
  return (
    <form action={action} className="space-y-5">
      {inv && <input type="hidden" name="id" value={inv.id} />}
      {projectId && <input type="hidden" name="projectId" value={projectId} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name"><input name="name" defaultValue={inv?.name} required className="input" /></Field>
        <Field label="Company">
          <input name="firm" defaultValue={inv?.firm ?? firm ?? ""} list="investor-firms" className="input" placeholder="Pick or type a new company" autoComplete="off" />
          <datalist id="investor-firms">{firms.map((f) => <option key={f} value={f} />)}</datalist>
        </Field>
        <Field label="Job title"><input name="title" defaultValue={inv?.title ?? ""} className="input" /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={inv?.email} required className="input" /></Field>
        <Field label="Phone"><PhoneInput name="phone" defaultValue={inv?.phone} defaultCountry={home} /></Field>
        <Field label="Mobile"><PhoneInput name="mobile" defaultValue={inv?.mobile} defaultCountry={home} /></Field>
        <Field label="LinkedIn"><input name="linkedin" defaultValue={inv?.linkedin ?? ""} className="input" placeholder="https://linkedin.com/in/…" /></Field>
        <Field label="Investor type"><Select name="investorType" options={INVESTOR_TYPES} defaultValue={inv?.investorType} placeholder="—" /></Field>
        {!inv && <Field label="Stage"><Select name="stage" options={INVESTOR_STAGES} /></Field>}
        <Field label="Min check ($)"><MoneyInput name="checkMin" defaultValue={inv?.checkMin} /></Field>
        <Field label="Max check ($)"><MoneyInput name="checkMax" defaultValue={inv?.checkMax} /></Field>
        <Field label="Source"><input name="source" defaultValue={inv?.source ?? ""} className="input" /></Field>
        <Field label="Min MW"><input name="mwMin" defaultValue={inv?.mwMin ?? ""} className="input" /></Field>
        <Field label="Max MW"><input name="mwMax" defaultValue={inv?.mwMax ?? ""} className="input" /></Field>
        <Field label="Relationship owner"><input name="owner" defaultValue={inv?.owner ?? ""} className="input" /></Field>
        {agents && <ReferredBySelect agents={agents} value={inv?.referredById} />}
        <Field label="Tags (comma separated)" className="sm:col-span-3"><input name="tags" defaultValue={inv?.tags} className="input" placeholder="hyperscale, PR, tier-1" /></Field>
      </div>
      <Field label="Deal types"><Checks name="dealTypes" options={DEAL_TYPES} selected={csv(inv?.dealTypes)} /></Field>
      <Field label="Facility types"><Checks name="facilityTypes" options={FACILITY_TYPES} selected={csv(inv?.facilityTypes)} /></Field>
      <Field label="Markets of interest" group><MarketPicker regions={csv(inv?.preferredRegions)} states={csv(inv?.preferredStates)} /></Field>
      <AddressFields value={inv ?? { country: home }} className="grid gap-4 sm:grid-cols-3" />
      <Field label="Notes"><textarea name="notes" rows={3} defaultValue={inv?.notes ?? ""} className="input" /></Field>
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="accredited" defaultChecked={inv?.accredited} /> Accredited / QIB</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="ndaSigned" defaultChecked={inv?.ndaSigned} /> NDA signed</label>
      </div>
      {inv ? <SaveButton label="Save changes" /> : <button className="btn">Create investor</button>}
    </form>
  );
}
