import { findForSigner } from "@/lib/esign-db";
import { SigningScreen } from "@/components/SigningScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review and sign — DEAC" };

/** A signed-in referral agent signs an agreement DEAC sent them. */
export default async function AgentSign({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SigningScreen found={await findForSigner({ id })} refKey="id" refValue={id} />;
}
