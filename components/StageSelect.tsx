"use client";
import { setProjectPipelineStage } from "@/app/actions/admin";
import { DEVELOPER_STAGES } from "@/lib/constants";

/** Developer CRM stage menu for one project. Saves as soon as a stage is picked. */
export function StageSelect({ projectId, stage, className = "" }: { projectId: string; stage: string; className?: string }) {
  return (
    <form action={setProjectPipelineStage}>
      <input type="hidden" name="id" value={projectId} />
      <select name="stage" defaultValue={stage} key={stage} aria-label="CRM stage" onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`input py-1 text-sm ${className}`}>
        {DEVELOPER_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </form>
  );
}
