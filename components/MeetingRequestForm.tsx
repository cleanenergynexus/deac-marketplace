import { requestMeeting } from "@/app/actions/agent";
import { ActionForm } from "@/components/ActionForm";
import { Field } from "@/components/ui";

/** Asks the agent's DEAC partner to set up a meeting. `about` pre-picks a contact ("dev:<id>" or "inv:<id>"). */
export function MeetingRequestForm({ contacts, about, partnerName }: { contacts: { value: string; label: string }[]; about?: string; partnerName?: string | null }) {
  return (
    <ActionForm action={requestMeeting} submitLabel="Send request" success={`Request sent. ${partnerName ?? "The DEAC team"} will get back to you to schedule it.`} className="grid gap-3">
      <Field label="With / about">
        <select name="about" defaultValue={about ?? ""} className="input">
          <option value="">General (no specific contact)</option>
          {contacts.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </Field>
      <Field label="What is the meeting for?"><input name="topic" required className="input" placeholder="e.g. Intro call with the developer" /></Field>
      <Field label="Preferred times"><input name="when" className="input" placeholder="e.g. Tue or Wed afternoon ET" /></Field>
      <Field label="Notes"><textarea name="notes" rows={2} className="input" /></Field>
    </ActionForm>
  );
}
