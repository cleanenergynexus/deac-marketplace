import { createCampaign } from "@/app/actions/admin";
import { Checks } from "@/components/Checks";
import { Field, PageHeader } from "@/components/ui";
import { DEAL_TYPES, INVESTOR_STAGES, INVESTOR_TYPES, US_STATES } from "@/lib/constants";
import { SUB_REGIONS } from "@/lib/regions";

export default function NewCampaign() {
  return (
    <div>
      <PageHeader title="New campaign" subtitle="Pick a segment, write the message, review recipients, then send." />
      <form action={createCampaign} className="card space-y-5 p-6">
        <Field label="Internal name"><input name="name" required className="input" placeholder="New listing: 60 MW Texas powered shell" /></Field>
        <h3 className="font-semibold">Segment</h3>
        <Field label="Stages (none = all)"><Checks name="stages" options={INVESTOR_STAGES} selected={["APPROVED", "ACTIVE"]} /></Field>
        <Field label="Investor types"><Checks name="investorTypes" options={INVESTOR_TYPES} /></Field>
        <Field label="Deal type interest"><Checks name="dealTypes" options={DEAL_TYPES} /></Field>
        <Field label="Regions of interest"><Checks name="regions" options={SUB_REGIONS.map((r) => ({ value: r.code, label: r.label }))} /></Field>
        <details><summary className="label cursor-pointer">US states</summary><div className="mt-2"><Checks name="states" options={US_STATES} /></div></details>
        <Field label="Tag contains"><input name="tags" className="input max-w-xs" /></Field>
        <h3 className="font-semibold">Message</h3>
        <Field label="Subject"><input name="subject" required className="input" /></Field>
        <Field label="Body ({{name}} and {{firm}} are filled in per recipient)"><textarea name="body" rows={10} required className="input font-mono text-sm" defaultValue={"Hi {{name}},\n\nWe've just added a new opportunity to the DEAC private portfolio that fits {{firm}}'s mandate.\n\n• \n\nSign in to review the full listing: https://marketplace.deacna.com/marketplace\n\nBest,\nDEAC Team"} /></Field>
        <button className="btn">Save & review recipients</button>
      </form>
    </div>
  );
}
