import { findForSigner } from "@/lib/esign-db";
import { SigningScreen } from "@/components/SigningScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review and sign — DEAC", robots: { index: false } };

/** Signing link from the email. The token is the only proof needed, so developer contacts and agents can sign too. */
export default async function SignByLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SigningScreen found={await findForSigner({ token })} refKey="token" refValue={token} />;
}
