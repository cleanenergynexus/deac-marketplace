import Link from "next/link";
import { acceptInvite } from "@/app/actions/invites";
import { ActionForm } from "@/components/ActionForm";
import { db } from "@/lib/db";
import { hashInviteToken, inviteExpired } from "@/lib/invites";

export const dynamic = "force-dynamic";

/** Where an invited investor sets their password. The token in the link is the only proof needed. */
export default async function AcceptInvite({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await db.user.findFirst({ where: { inviteTokenHash: hashInviteToken(token) }, select: { name: true, email: true, role: true, inviteExpiresAt: true } });
  if (!user || user.role !== "INVESTOR" || inviteExpired(user.inviteExpiresAt)) {
    return (
      <div className="mx-auto max-w-sm card p-6">
        <h1 className="text-xl font-bold">This invite link has expired</h1>
        <p className="mt-2 text-sm text-slate-600">It may have been used already or replaced by a newer link. Ask your DEAC contact for a new invite, or <Link href="/login" className="text-brand-600">sign in</Link> if you already set a password.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-sm card p-6">
      <h1 className="text-xl font-bold">Welcome, {user.name.split(" ")[0]}</h1>
      <p className="mt-1 text-sm text-slate-600">You&apos;re invited to the DEAC private investor marketplace and your membership is approved. Choose a password to sign in.</p>
      <ActionForm action={acceptInvite} submitLabel="Set password and sign in" className="mt-5 space-y-3">
        <input type="hidden" name="token" value={token} />
        <input value={user.email} readOnly aria-label="Email" className="input bg-slate-50 text-slate-600" />
        <input name="password" type="password" placeholder="New password (8+ characters)" minLength={8} required autoComplete="new-password" className="input" />
        <input name="confirm" type="password" placeholder="Repeat password" minLength={8} required autoComplete="new-password" className="input" />
      </ActionForm>
    </div>
  );
}
