import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { listingOptions, loadSignerOptions } from "@/lib/esign-db";
import { UploadSignedForm } from "@/components/NewEnvelopeForm";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";

/** File an NDA or contract that was signed elsewhere on an investor, developer contact or agent record. */
export default async function UploadSigned({ searchParams }: { searchParams: Promise<{ projectId?: string; signer?: string; kind?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const [listings, signers] = await Promise.all([listingOptions(), loadSignerOptions()]);
  return (
    <div>
      <PageHeader title="Upload a Signed Document" subtitle="Keep an NDA, LOI or contract that was signed on paper or in another tool with the contact's record. Nothing is sent to them." action={<Link href="/admin/signatures" className="btn-ghost">Back</Link>} />
      <UploadSignedForm listings={listings} signers={signers} initial={sp} />
    </div>
  );
}
