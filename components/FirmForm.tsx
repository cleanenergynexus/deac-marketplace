import type { InvestorFirm } from "@prisma/client";
import { Field, Select } from "@/components/ui";
import { SaveButton } from "@/components/SaveButton";
import { MoneyInput } from "@/components/MoneyInput";
import { AddressFields } from "@/components/AddressFields";
import { INVESTOR_TYPES } from "@/lib/constants";

/** Investor CRM company (fund, family office, lender...). With `firm` it edits; without, it adds one. */
export function FirmForm({ firm, action }: { firm?: InvestorFirm; action: (f: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-4">
      {firm && <input type="hidden" name="id" value={firm.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Company"><input name="name" defaultValue={firm?.name} required className="input" placeholder="e.g. Meridian Infrastructure Partners" /></Field>
        <Field label="Investor type"><Select name="investorType" options={INVESTOR_TYPES} defaultValue={firm?.investorType} placeholder="—" /></Field>
        <Field label="Assets under management ($)"><MoneyInput name="aum" defaultValue={firm?.aum} /></Field>
        <Field label="Website"><input name="website" defaultValue={firm?.website ?? ""} className="input" /></Field>
        <Field label="LinkedIn"><input name="linkedin" defaultValue={firm?.linkedin ?? ""} className="input" /></Field>
        <Field label="Source"><input name="source" defaultValue={firm?.source ?? ""} className="input" placeholder="Referral, conference…" /></Field>
        <Field label="Relationship owner"><input name="owner" defaultValue={firm?.owner ?? ""} className="input" /></Field>
      </div>
      <AddressFields value={firm ?? { country: "US" }} className="grid gap-4 sm:grid-cols-3" />
      <Field label="Internal notes"><textarea name="notes" rows={3} defaultValue={firm?.notes ?? ""} className="input" /></Field>
      {firm ? <SaveButton label="Save company" /> : <button className="btn">Create company</button>}
    </form>
  );
}
