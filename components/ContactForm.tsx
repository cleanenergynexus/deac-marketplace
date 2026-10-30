import type { Contact } from "@prisma/client";
import { Field } from "@/components/ui";
import { SaveButton } from "@/components/SaveButton";
import { PhoneInput } from "@/components/PhoneInput";
import { AddressFields } from "@/components/AddressFields";
import { ReferredBySelect, type AgentOption } from "@/components/ReferredBySelect";

/** Contact properties. With `contact` it edits; without, it adds a new contact to `developerId`. */
/** `country` is the company's country, used as the default for new phone numbers and addresses. */
export function ContactForm({ contact, developerId, companies, action, compact = false, country, agents }: { contact?: Contact; developerId?: string; companies?: { id: string; company: string }[]; action: (f: FormData) => Promise<void>; compact?: boolean; country?: string | null; agents?: AgentOption[] }) {
  const grid = compact ? "grid gap-3" : "grid gap-3 sm:grid-cols-2";
  const home = contact?.country ?? country ?? "US";
  return (
    <form action={action} className="space-y-3">
      {contact && <input type="hidden" name="id" value={contact.id} />}
      {developerId && <input type="hidden" name="developerId" value={developerId} />}
      <div className={grid}>
        {companies && (
          <Field label="Company" className="sm:col-span-2">
            <select name="developerId" required defaultValue="" className="input">
              <option value="" disabled>Pick the development company…</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.company}</option>)}
            </select>
          </Field>
        )}
        <Field label="Name"><input name="name" defaultValue={contact?.name} required className="input" /></Field>
        <Field label="Job title"><input name="title" defaultValue={contact?.title ?? ""} className="input" placeholder="e.g. CEO" /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={contact?.email ?? ""} className="input" /></Field>
        <Field label="Phone"><PhoneInput name="phone" defaultValue={contact?.phone} defaultCountry={home} /></Field>
        <Field label="Mobile"><PhoneInput name="mobile" defaultValue={contact?.mobile} defaultCountry={home} /></Field>
        <Field label="LinkedIn"><input name="linkedin" defaultValue={contact?.linkedin ?? ""} className="input" placeholder="https://linkedin.com/in/…" /></Field>
        <Field label="Location"><input name="location" defaultValue={contact?.location ?? ""} className="input" /></Field>
        <Field label="Source"><input name="source" defaultValue={contact?.source ?? ""} className="input" placeholder="Referral, conference…" /></Field>
        <Field label="Contact owner"><input name="owner" defaultValue={contact?.owner ?? ""} className="input" placeholder="Team member responsible" /></Field>
        {agents && <ReferredBySelect agents={agents} value={contact?.referredById} />}
      </div>
      <AddressFields value={contact ?? { country: home }} className={grid} />
      <Field label="Background notes"><textarea name="notes" rows={3} defaultValue={contact?.notes ?? ""} className="input" /></Field>
      {!contact && <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" name="isPrimary" /> Make primary contact for the company</label>}
      {contact ? <SaveButton label="Save contact" /> : <button className="btn">Add contact</button>}
    </form>
  );
}
