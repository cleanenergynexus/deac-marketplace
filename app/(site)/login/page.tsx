import { login } from "@/app/actions/public";
import { ActionForm } from "@/components/ActionForm";
import Link from "next/link";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-sm card p-6">
      <h1 className="text-xl font-bold">Sign in</h1>
      <p className="mt-1 text-sm text-slate-600">Members and DEAC team only.</p>
      <ActionForm action={login} submitLabel="Sign in" className="mt-5 space-y-3">
        <input type="hidden" name="next" value={next ?? ""} />
        <input name="email" type="email" placeholder="Email" required className="input" />
        <input name="password" type="password" placeholder="Password" required className="input" />
      </ActionForm>
      <p className="mt-4 text-sm text-slate-600">Not a member? <Link href="/apply" className="text-brand-600">Request access</Link></p>
    </div>
  );
}
