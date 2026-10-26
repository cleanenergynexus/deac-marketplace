import { currentUser } from "@/lib/auth";
import { changeOwnPassword } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { Field, PageHeader, Section } from "@/components/ui";

export default async function Account() {
  const me = await currentUser();
  return (
    <div className="space-y-6">
      <PageHeader title="My account" subtitle={`${me?.name} · ${me?.email}`} />
      <Section title="Change password">
        <ActionForm action={changeOwnPassword} submitLabel="Update password" success="Password updated." className="grid max-w-md gap-4">
          <Field label="Current password"><input name="current" type="password" required className="input" /></Field>
          <Field label="New password (10+ characters)"><input name="next" type="password" minLength={10} required className="input" /></Field>
        </ActionForm>
      </Section>
    </div>
  );
}
