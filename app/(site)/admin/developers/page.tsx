import Link from "next/link";
import { PageHeader, Empty } from "@/components/ui";
import { PipelineBoard, type BoardCard } from "@/components/PipelineBoard";
import { DEAL_TYPES } from "@/lib/constants";
import { FUNNEL_KEYS, funnelKey, pipelineLabel, placeStage, projectStage } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";
import { recommendation } from "@/lib/valuation";
import { getScoring } from "@/lib/scoring-db";
import { loadCrm } from "@/lib/contacts-db";
import { ago, initials, projectContactId } from "@/lib/crm";

export const dynamic = "force-dynamic";

export default async function Developers({ searchParams }: { searchParams: Promise<{ funnel?: string; stage?: string; q?: string }> }) {
  const sp = await searchParams;
  const [{ developers: devs, lastTouch, openTasks }, scoring, pipeline] = await Promise.all([loadCrm(), getScoring(), getPipeline()]);
  const q = sp.q?.trim().toLowerCase();
  // One funnel per deal type. Default to the first one that has projects.
  const perFunnel = Object.fromEntries(FUNNEL_KEYS.map((k) => [k, devs.reduce((a, d) => a + d.projects.filter((p) => funnelKey(p.dealType) === k).length, 0)]));
  const funnel = sp.funnel && FUNNEL_KEYS.includes(sp.funnel) ? sp.funnel : FUNNEL_KEYS.find((k) => perFunnel[k] > 0) ?? FUNNEL_KEYS[0];
  const stages = pipeline.funnels[funnel];

  // Tiles lead with the person and the company. Each project still gets its own tile so it moves through
  // the pipeline on its own (one project can close while another from the same developer is passed).
  const cards: BoardCard[] = devs.flatMap((d): BoardCard[] => {
    const person = (contactId: string | null) => {
      const c = d.contacts.find((x) => x.id === contactId);
      return c ? { id: c.id, name: c.name, title: c.title, initials: initials(c.name), lastTouch: ago(lastTouch.get(c.id)), openTasks: openTasks.get(c.id) ?? 0 } : null;
    };
    // A company with no project yet has no deal type, so it shows in every funnel.
    if (!d.projects.length) return [{ kind: "company", id: d.id, stage: placeStage(stages, d.stage), developerId: d.id, company: d.company, contact: person(projectContactId({ contactId: null }, d.contacts)), contacts: d.contacts.length }];
    return d.projects.filter((p) => funnelKey(p.dealType) === funnel).map((p) => ({
      kind: "project", id: p.id, stage: projectStage(pipeline, p, d.stage), developerId: d.id, company: d.company, contact: person(projectContactId(p, d.contacts)), contacts: d.contacts.length,
      project: { title: p.title, code: p.code, mw: p.mw, score: p.valueScore, scoreTone: p.valueScore != null ? recommendation(p.valueScore, scoring).tone : undefined },
    }));
  }).filter((c) => (!sp.stage || c.stage === sp.stage) && (!q || [c.contact?.name, c.company, c.project?.title, c.project?.code].some((x) => x?.toLowerCase().includes(q))));
  const contactCount = devs.reduce((a, d) => a + d.contacts.length, 0);
  const projectCount = devs.reduce((a, d) => a + d.projects.length, 0);

  const tab = (k: string) => `?funnel=${k}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`;

  return (
    <div>
      <PageHeader title="Developer CRM" subtitle={`${devs.length} companies · ${contactCount} contacts · ${projectCount} projects${sp.stage ? ` · ${pipelineLabel(stages, sp.stage)}` : ""}`} action={
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-2">
            <input type="hidden" name="funnel" value={funnel} />
            {sp.stage && <input type="hidden" name="stage" value={sp.stage} />}
            <input name="q" defaultValue={sp.q} placeholder="Search contact, company, project" className="input w-64 py-1.5" />
          </form>
          {(sp.stage || q) && <Link href={`?funnel=${funnel}`} className="btn-ghost">Clear</Link>}
          <Link href="/admin/developers/funnels" className="btn-ghost">Edit funnels</Link>
          <Link href="/admin/developers/new" className="btn">Add company</Link>
        </div>} />
      {!devs.length ? <Empty>No developers yet.</Empty> : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <nav aria-label="Funnel" className="inline-flex rounded-lg bg-slate-100 p-1 text-sm">
              {DEAL_TYPES.map((d) => (
                <Link key={d.value} href={tab(d.value)} aria-current={d.value === funnel ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 font-medium ${d.value === funnel ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                  {d.label} <span className="ml-1 text-xs text-slate-400">{perFunnel[d.value]}</span>
                </Link>
              ))}
            </nav>
            <span className="text-sm text-slate-500">{stages.length} columns · <Link href={`/admin/developers/funnels?funnel=${funnel}`} className="text-brand-600">rename or add columns</Link></span>
          </div>
          <p className="mb-3 text-sm text-slate-500">Each tile is a contact and their company working one project. Projects show in the funnel for their deal type; companies with no project yet show in every funnel. Drag a tile to another column or pick a stage on it.</p>
          <PipelineBoard key={funnel} cards={cards} stages={stages} />
        </>
      )}
    </div>
  );
}
