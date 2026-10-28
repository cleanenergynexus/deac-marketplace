"use client";
import { setProjectPipelineStage } from "@/app/actions/admin";
import type { PipelineStage } from "@/lib/pipeline";

/** Developer CRM stage menu for one project, listing its deal type's funnel. Saves as soon as a stage is picked. */
export function StageSelect({ projectId, stage, stages, className = "" }: { projectId: string; stage: string; stages: PipelineStage[]; className?: string }) {
  return (
    <form action={setProjectPipelineStage}>
      <input type="hidden" name="id" value={projectId} />
      <select name="stage" defaultValue={stage} key={stage} aria-label="CRM stage" onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`input py-1 text-sm ${className}`}>
        {stages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </form>
  );
}
