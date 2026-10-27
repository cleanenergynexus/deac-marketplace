import Link from "next/link";
import { db } from "@/lib/db";
import { saveScoring } from "@/app/actions/admin";
import { ScoringEditor } from "@/components/ScoringEditor";
import { PageHeader } from "@/components/ui";
import { parseScoring } from "@/lib/scoring";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ScoringSettings() {
  const row = await db.scoringSettings.findUnique({ where: { id: "default" } });
  return (
    <div>
      <PageHeader
        title="Scoring settings"
        subtitle={<>Points for each characteristic and selection behind the lead score in the <Link href="/admin/calculator" className="text-brand-600">valuation calculator</Link>. Starts from the DEAC workbook values. {row ? `Last saved ${date(row.updatedAt)}${row.updatedBy ? ` by ${row.updatedBy}` : ""}.` : "Not edited yet."}</>}
      />
      <ScoringEditor initial={parseScoring(row?.config)} action={saveScoring} />
    </div>
  );
}
