import { Calculator } from "@/components/Calculator";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getScoring } from "@/lib/scoring-db";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const scoring = await getScoring();
  return (
    <div>
      <PageHeader title="Valuation calculator" subtitle="Quick screening for new leads. To save a score to a lead, open the listing and use the Valuation section." action={<Link href="/admin/scoring" className="btn-ghost">Scoring settings</Link>} />
      <Calculator scoring={scoring} />
    </div>
  );
}
