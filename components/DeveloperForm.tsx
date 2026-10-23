import type { Developer } from "@prisma/client";
import { Field, Select } from "@/components/ui";
import { DEVELOPER_STAGES } from "@/lib/constants";

export function DeveloperForm({ dev, action }: { dev?: Developer; action: (f: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-4">
      {dev && <input type="hidden" name="id" value={dev.id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Company"><input name="company" defaultValue={dev?.company} required className="input" /></Field>
        <Field label="Contact name"><input name="contactName" defaultValue={dev?.contactName} required className="input" /></Field>
        <Field label="Email"><input name="email" type="email" defaultValue={dev?.email} required className="input" /></Field>
        <Field label="Phone"><input name="phone" defaultValue={dev?.phone ?? ""} className="input" /></Field>
        <Field label="Website"><input name="website" defaultValue={dev?.website ?? ""} className="input" /></Field>
        <Field label="HQ"><input name="hq" defaultValue={dev?.hq ?? ""} className="input" /></Field>
        <Field label="MW delivered"><input name="mwDelivered" defaultValue={dev?.mwDelivered ?? ""} className="input" /></Field>
        <Field label="Source"><input name="source" defaultValue={dev?.source ?? ""} className="input" /></Field>
        <Field label="Relationship owner"><input name="owner" defaultValue={dev?.owner ?? ""} className="input" /></Field>
        {!dev && <Field label="Stage"><Select name="stage" options={DEVELOPER_STAGES} /></Field>}
      </div>
      <Field label="Experience / track record (shown to investors)"><textarea name="experience" rows={4} defaultValue={dev?.experience ?? ""} className="input" /></Field>
      <Field label="Internal notes"><textarea name="notes" rows={2} defaultValue={dev?.notes ?? ""} className="input" /></Field>
      <button className="btn">{dev ? "Save changes" : "Create developer"}</button>
    </form>
  );
}
