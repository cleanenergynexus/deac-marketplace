"use client";
import { setProjectPipelineStage } from "@/app/actions/admin";
import { setInterestStage } from "@/app/actions/investors";
import type { PipelineStage } from "@/lib/pipeline";

/**
 * CRM stage menu listing a deal type's funnel. Saves as soon as a stage is picked.
 * Developer CRM: `projectId`. Investor CRM: `interestId` (one investor on one listing).
 */
export function StageSelect({ projectId, interestId, stage, stages, className = "" }: { projectId?: string; interestId?: string; stage: string; stages: PipelineStage[]; className?: string }) {
  return (
    <form action={interestId ? setInterestStage : setProjectPipelineStage}>
      <input type="hidden" name="id" value={interestId ?? projectId} />
      <select name="stage" defaultValue={stage} key={stage} aria-label="CRM stage" onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`input py-1 text-sm ${className}`}>
        {stages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </form>
  );
}
