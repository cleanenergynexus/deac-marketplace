import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { addTeamAdmin, removeTeamAdmin } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { Field, PageHeader, Section } from "@/components/ui";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Team() {
  const me = await currentUser();
  const admins = await db.user.findMany({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  return (
    <div className="space-y-6">
      <PageHeader title="Team" subtitle="DEAC staff who can sign in to the admin area. Every team member has full admin access." />
      <Section title={`Team members (${admins.length})`}>
        <table className="w-full">
          <thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Added</th><th className="th"></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {admins.map((a) => (
              <tr key={a.id}>
                <td className="td font-medium">{a.name}{a.id === me?.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}</td>
                <td className="td">{a.email}</td>
                <td className="td text-xs">{date(a.createdAt)}</td>
                <td className="td text-right">
                  {a.id !== me?.id && admins.length > 1 && (
                    <form action={removeTeamAdmin}><input type="hidden" name="id" value={a.id} /><button className="btn-danger">Remove</button></form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
      <Section title="Add a team member">
        <ActionForm action={addTeamAdmin} submitLabel="Add team member" success="Team member added. Share the temporary password with them privately; they can change it under My account." className="grid gap-4 sm:grid-cols-3">
          <Field label="Name"><input name="name" required className="input" /></Field>
          <Field label="Email"><input name="email" type="email" required className="input" /></Field>
          <Field label="Temporary password (10+ characters)"><input name="password" type="text" minLength={10} required className="input" autoComplete="off" /></Field>
        </ActionForm>
      </Section>
    </div>
  );
}
