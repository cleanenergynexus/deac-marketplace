import Link from "next/link";
import { db } from "@/lib/db";
import { createContact } from "@/app/actions/contacts";
import { ContactForm } from "@/components/ContactForm";
import { getAgents } from "@/lib/agents-db";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function NewContact() {
  const [companies, agents] = await Promise.all([db.developer.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } }), getAgents()]);
  return (
    <div>
      <Link href="/admin/developers/contacts" className="text-sm text-brand-600">← Contacts</Link>
      <PageHeader title="Add contact" subtitle={<>Contacts belong to a development company. New company? <Link href="/admin/developers/new" className="text-brand-600">Add the company</Link> first.</>} />
      <div className="card max-w-3xl p-6"><ContactForm companies={companies} action={createContact} agents={agents} /></div>
    </div>
  );
}
