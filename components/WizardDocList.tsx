import Link from "next/link";
import { Badge } from "@/components/ui";
import { LocalTime } from "@/components/LocalTime";
import { KIND_INFO, effectiveStatus, type WizardKind } from "@/lib/wizard";

export type WizardDocRow = { id: string; kind: string; title: string; status: string; updatedAt: Date; createdBy: string | null; savedAt: Date | null };

const tone = { GENERATING: "blue", READY: "green", FAILED: "red" } as const;
const label = { GENERATING: "Writing…", READY: "Draft ready", FAILED: "Failed" } as const;

/** Wizard drafts for one project, newest first. */
export function WizardDocList({ projectId, docs }: { projectId: string; docs: WizardDocRow[] }) {
  if (!docs.length) return <p className="text-sm text-slate-500">No documents yet. Pick a type above and Claude writes the first draft.</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {docs.map((d) => {
        const status = effectiveStatus(d.status, d.updatedAt);
        return (
          <li key={d.id}>
            <Link href={`/admin/projects/${projectId}/data-room/wizard/${d.id}`} className="flex flex-wrap items-center gap-3 px-2 py-2.5 hover:bg-slate-50">
              <span className="text-xl" aria-hidden>{KIND_INFO[d.kind as WizardKind]?.icon ?? "📄"}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{d.title}</span>
                <span className="block text-xs text-slate-500">{KIND_INFO[d.kind as WizardKind]?.label ?? d.kind} · {d.createdBy ?? "DEAC"} · <LocalTime value={d.updatedAt} /></span>
              </span>
              {d.savedAt && status === "READY" && <Badge tone="purple">Saved to data room</Badge>}
              <Badge tone={tone[status]}>{label[status]}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
