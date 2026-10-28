import Link from "next/link";
import { PageHeader, Empty } from "@/components/ui";
import { PipelineBoard, type BoardCard } from "@/components/PipelineBoard";
import { DEVELOPER_STAGES, projectPipelineStage, stageLabel } from "@/lib/constants";
import { recommendation } from "@/lib/valuation";
import { getScoring } from "@/lib/scoring-db";
import { loadCrm } from "@/lib/contacts-db";
import { ago, initials, projectContactId } from "@/lib/crm";

export const dynamic = "force-dynamic";

export default async function Developers({ searchParams }: { searchParams: Promise<{ stage?: string; q?: string }> }) {
  const sp = await searchParams;
  const [{ developers: devs, lastTouch, openTasks }, scoring] = await Promise.all([loadCrm(), getScoring()]);
  const q = sp.q?.trim().toLowerCase();

  // Tiles lead with the person and the company. Each project still gets its own tile so it moves through
  // the pipeline on its own (one project can close while another from the same developer is passed).
  const cards: BoardCard[] = devs.flatMap((d): BoardCard[] => {
    const person = (contactId: string | null) => {
      const c = d.contacts.find((x) => x.id === contactId);
      return c ? { id: c.id, name: c.name, title: c.title, initials: initials(c.name), lastTouch: ago(lastTouch.get(c.id)), openTasks: openTasks.get(c.id) ?? 0 } : null;
    };
    if (!d.projects.length) return [{ kind: "company", id: d.id, stage: d.stage, developerId: d.id, company: d.company, contact: person(projectContactId({ contactId: null }, d.contacts)), contacts: d.contacts.length }];
    return d.projects.map((p) => ({
      kind: "project", id: p.id, stage: projectPipelineStage(p, d.stage), developerId: d.id, company: d.company, contact: person(projectContactId(p, d.contacts)), contacts: d.contacts.length,
      project: { title: p.title, code: p.code, mw: p.mw, score: p.valueScore, scoreTone: p.valueScore != null ? recommendation(p.valueScore, scoring).tone : undefined },
    }));
  }).filter((c) => (!sp.stage || c.stage === sp.stage) && (!q || [c.contact?.name, c.company, c.project?.title, c.project?.code].some((x) => x?.toLowerCase().includes(q))));
  const contactCount = devs.reduce((a, d) => a + d.contacts.length, 0);
  const projectCount = devs.reduce((a, d) => a + d.projects.length, 0);

  return (
    <div>
      <PageHeader title="Developer CRM" subtitle={`${devs.length} companies · ${contactCount} contacts · ${projectCount} projects${sp.stage ? ` · ${stageLabel(DEVELOPER_STAGES, sp.stage)}` : ""}`} action={
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-2">
            {sp.stage && <input type="hidden" name="stage" value={sp.stage} />}
            <input name="q" defaultValue={sp.q} placeholder="Search contact, company, project" className="input w-64 py-1.5" />
          </form>
          {(sp.stage || q) && <Link href="?" className="btn-ghost">Clear</Link>}
          <Link href="/admin/developers/new" className="btn">Add company</Link>
        </div>} />
      {!devs.length ? <Empty>No developers yet.</Empty> : (
        <>
          <p className="mb-3 text-sm text-slate-500">Each tile is a contact and their company working one project. Drag a tile to another column or pick a stage on it. Click the name to open the contact record and log calls, emails, notes and tasks.</p>
          <PipelineBoard cards={cards} />
        </>
      )}
    </div>
  );
}
