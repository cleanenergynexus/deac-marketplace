import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { saveSprintTemplates } from "@/app/actions/sprints";
import { SprintTemplateEditor } from "@/components/SprintTemplateEditor";
import { PageHeader } from "@/components/ui";
import { allStages } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";
import { parseTemplates } from "@/lib/sprints";
import { assigneeOptions } from "@/lib/tasks";
import { getTaskPeople } from "@/lib/tasks-db";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function SprintTemplatesPage() {
  const [me, people, pipeline, row] = await Promise.all([requireAdmin(), getTaskPeople(), getPipeline(), db.sprintTemplate.findUnique({ where: { id: "default" } })]);
  return (
    <div>
      <Link href="/admin/sprints" className="text-sm text-brand-600">← Sprints</Link>
      <PageHeader
        title="Sprint Templates"
        subtitle={<>The tasks and sub-tasks each project gets when it enters a CRM stage. Stages come from the <Link href="/admin/developers/funnels" className="text-brand-600">Developer CRM funnels</Link> and are shared by every deal type. Editing a template changes sprints started from now on; sprints already running keep their tasks. {row ? `Last saved ${date(row.updatedAt)}${row.updatedBy ? ` by ${row.updatedBy}` : ""}.` : "Using DEAC's default sprints."}</>}
      />
      <SprintTemplateEditor initial={parseTemplates(row?.config)} stages={allStages(pipeline)} people={assigneeOptions(me, people)} action={saveSprintTemplates} />
    </div>
  );
}
