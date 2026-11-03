import Link from "next/link";
import { db } from "@/lib/db";
import { saveScreeningTemplate } from "@/app/actions/screening";
import { ScreeningTemplateEditor } from "@/components/ScreeningTemplateEditor";
import { PageHeader } from "@/components/ui";
import { parseTemplate } from "@/lib/screening";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ScreeningTemplatePage() {
  const row = await db.screeningTemplate.findUnique({ where: { id: "default" } });
  return (
    <div>
      <Link href="/admin/screening" className="text-sm text-brand-600">← Screening</Link>
      <PageHeader
        title="Screening template"
        subtitle={<>The categories and questions every project is <Link href="/admin/screening" className="text-brand-600">screened</Link> against, and that Claude researches. &quot;Canada only&quot; questions appear just for projects in Canada. Editing a question keeps the answers already given to it. {row ? `Last saved ${date(row.updatedAt)}${row.updatedBy ? ` by ${row.updatedBy}` : ""}.` : "Using the DEAC default."}</>}
      />
      <ScreeningTemplateEditor initial={parseTemplate(row?.config)} action={saveScreeningTemplate} />
    </div>
  );
}
