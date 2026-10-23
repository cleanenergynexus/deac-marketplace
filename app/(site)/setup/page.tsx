import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createFirstAdmin } from "@/app/actions/public";
import { ActionForm } from "@/components/ActionForm";
import { Field } from "@/components/ui";

export const dynamic = "force-dynamic";

/** One-time first-admin setup. Works only while no admin exists and SETUP_TOKEN is set. */
export default async function Setup() {
  if ((await db.user.count({ where: { role: "ADMIN" } })) > 0) redirect("/login");
  if (!process.env.SETUP_TOKEN) {
    return <div className="mx-auto max-w-lg card p-6 text-sm">Setup is disabled. Add a <code>SETUP_TOKEN</code> environment variable and redeploy.</div>;
  }
  return (
    <div className="mx-auto max-w-md card p-6">
      <h1 className="text-xl font-bold">Create the first admin</h1>
      <p className="mt-1 text-sm text-slate-600">This page disappears once an admin exists.</p>
      <ActionForm action={createFirstAdmin} submitLabel="Create admin" className="mt-5 space-y-3">
        <Field label="Setup token"><input name="token" type="password" required className="input" /></Field>
        <Field label="Your name"><input name="name" required className="input" /></Field>
        <Field label="Email"><input name="email" type="email" required className="input" /></Field>
        <Field label="Password (10+ characters)"><input name="password" type="password" minLength={10} required className="input" /></Field>
      </ActionForm>
    </div>
  );
}
