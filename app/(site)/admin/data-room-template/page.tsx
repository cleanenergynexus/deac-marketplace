import { db } from "@/lib/db";
import { saveDataRoomTemplate } from "@/app/actions/dataroom";
import { DataRoomTemplateEditor } from "@/components/DataRoomTemplateEditor";
import { PageHeader } from "@/components/ui";
import { parseTemplate } from "@/lib/dataroom";
import { date } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DataRoomTemplatePage() {
  const row = await db.dataRoomTemplate.findUnique({ where: { id: "default" } });
  return (
    <div>
      <PageHeader
        title="Data room template"
        subtitle={<>The folders and subfolders that <b>Create standard folders</b> adds to a project&apos;s data room. Changes apply to data rooms you set up from now on; existing ones keep their folders (you can still add the template to one from its right-click menu). {row ? `Last saved ${date(row.updatedAt)}${row.updatedBy ? ` by ${row.updatedBy}` : ""}.` : "Using the DEAC default."}</>}
      />
      <DataRoomTemplateEditor initial={parseTemplate(row?.config)} action={saveDataRoomTemplate} />
    </div>
  );
}
