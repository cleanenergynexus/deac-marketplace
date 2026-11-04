import { findForSigner } from "@/lib/esign-db";
import { SigningScreen } from "@/components/SigningScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review and Sign — DEAC" };

/** A signed-in investor signs a document sent to them (or a listing NDA they opened). */
export default async function SignInPortal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SigningScreen found={await findForSigner({ id })} refKey="id" refValue={id} />;
}
