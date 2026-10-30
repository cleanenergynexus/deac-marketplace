import { requireAgent } from "@/lib/auth";
import { changeAgentPassword } from "@/app/actions/agent";
import { getPartner } from "@/lib/agent-portal";
import { ActionForm } from "@/components/ActionForm";
import { PartnerCard } from "@/components/PartnerCard";
import { Field, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AgentAccount() {
  const me = await requireAgent();
  const partner = await getPartner(me.partnerId);
  return (
    <div className="space-y-6">
      <PageHeader title="My account" subtitle={`${me.name} · ${me.email}${me.company ? ` · ${me.company}` : ""}`} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Section title="Change password">
          <ActionForm action={changeAgentPassword} submitLabel="Update password" success="Password updated." className="grid max-w-md gap-4">
            <Field label="Current password"><input name="current" type="password" required className="input" /></Field>
            <Field label="New password (10+ characters)"><input name="next" type="password" minLength={10} required className="input" /></Field>
          </ActionForm>
        </Section>
        <PartnerCard partner={partner} />
      </div>
    </div>
  );
}
