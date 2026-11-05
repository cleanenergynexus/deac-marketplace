import Link from "next/link";
import { applyAsAgent } from "@/app/actions/public";
import { PhoneInput } from "@/components/PhoneInput";
import { ActionForm } from "@/components/ActionForm";
import { Checks } from "@/components/Checks";
import { Field } from "@/components/ui";
import { AGENT_FOCUS } from "@/lib/agents";

export default function BecomeAgent() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Become a Referral Agent</h1>
      <p className="mt-1 text-sm text-slate-600">
        Referral agents introduce data center developers and investors to DEAC. Approved agents get their own portal to refer contacts, share project documents, follow the activity on their referrals, and work with a dedicated DEAC partner on each transaction.
      </p>
      <ActionForm action={applyAsAgent} submitLabel="Submit application" className="card mt-6 space-y-6 p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name"><input name="name" required className="input" /></Field>
          <Field label="Company"><input name="company" className="input" /></Field>
          <Field label="Title"><input name="title" className="input" /></Field>
          <Field label="Phone"><PhoneInput name="phone" /></Field>
          <Field label="Email"><input name="email" type="email" required className="input" /></Field>
          <Field label="Create password (10+ characters)"><input name="password" type="password" minLength={10} required className="input" /></Field>
          <Field label="Where are you based?"><input name="location" placeholder="City, state or country" className="input" /></Field>
          <Field label="How did you hear about us?"><input name="source" className="input" /></Field>
        </div>
        <Field label="Who would you refer?" group><Checks name="focus" options={AGENT_FOCUS} /></Field>
        <Field label="Tell us about your background and network"><textarea name="experience" rows={4} placeholder="Markets you cover, the developers or investors you work with, deals you've been part of…" className="input" /></Field>
      </ActionForm>
      <p className="mt-4 text-sm text-slate-500">Already a referral agent? <Link href="/login" className="text-brand-600">Sign in</Link>.</p>
    </div>
  );
}
