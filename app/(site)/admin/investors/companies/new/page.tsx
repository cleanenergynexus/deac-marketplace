import Link from "next/link";
import { createFirm } from "@/app/actions/investors";
import { FirmForm } from "@/components/FirmForm";
import { PageHeader } from "@/components/ui";

export default function NewInvestorCompany() {
  return (
    <div>
      <Link href="/admin/investors/companies" className="text-sm text-brand-600">← Companies</Link>
      <PageHeader title="Add investor company" subtitle="A fund, family office, lender or other investor. Add its people on the company page." />
      <div className="card p-6"><FirmForm action={createFirm} /></div>
    </div>
  );
}
