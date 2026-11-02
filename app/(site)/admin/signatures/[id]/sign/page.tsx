import { requireAdmin } from "@/lib/auth";
import { findForSigner } from "@/lib/esign-db";
import { SigningScreen } from "@/components/SigningScreen";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sign — DEAC" };

/** A DEAC team member signs (e.g. countersigns) a document they were added to as a signer. */
export default async function TeamSign({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const found = await findForSigner({ id });
  return <SigningScreen found={found?.cosigner ? found : null} refKey="id" refValue={id} backHref={`/admin/signatures/${id}`} />;
}
