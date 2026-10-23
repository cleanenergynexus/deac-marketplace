"use client";
import { useActionState, type ReactNode } from "react";

type State = { error?: string; ok?: boolean } | undefined;

/** Form bound to a server action returning {error?, ok?}. Shows the error or a success message. */
export function ActionForm({ action, children, success, className, submitLabel }: { action: (s: State, f: FormData) => Promise<State>; children: ReactNode; success?: ReactNode; className?: string; submitLabel: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  if (state?.ok && success) return <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{success}</div>;
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{state.error}</p>}
      <button className="btn mt-4" disabled={pending}>{pending ? "Submitting…" : submitLabel}</button>
    </form>
  );
}
