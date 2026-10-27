import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { deleteProject, grantStage, saveDisclosure, saveValuation, updateProject } from "@/app/actions/admin";
import { ProjectForm } from "@/components/ProjectForm";
import { StageSelect } from "@/components/StageSelect";
import { projectPipelineStage } from "@/lib/constants";
import { Calculator } from "@/components/Calculator";
import { Badge, Field, PageHeader, Section, Select, statusTone } from "@/components/ui";
import { DEFAULT_INPUTS, parseInputs, type ValuationInputs } from "@/lib/valuation";
import { usd } from "@/lib/format";
import { getScoring } from "@/lib/scoring-db";
import { docStage, investorStage, parseDisclosure, SECTIONS, STAGES, STAGE_INFO, type StepStatus } from "@/lib/disclosure";

const stageOptions = STAGES.map((s) => ({ value: s, label: `${STAGE_INFO[s].step}${s === "TEASER" ? " (all members)" : ""}` }));

export const dynamic = "force-dynamic";

export default async function ProjectAdmin({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [p, developers, investors, scoring] = await Promise.all([
    db.project.findUnique({ where: { id }, include: { documents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }, dataRoomFolders: { select: { id: true, parentId: true, name: true } }, dataRoomFiles: { select: { id: true, folderId: true, name: true } }, lois: { include: { investor: true } }, dealSteps: { include: { investor: true } }, developer: true } }),
    db.developer.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } }),
    db.investor.findMany({ select: { id: true, name: true, firm: true }, orderBy: { name: "asc" } }),
    getScoring(),
  ]);
  if (!p) notFound();
  const show = parseDisclosure(p.disclosure);

  // Every investor engaged on this listing, with the stage they've reached.
  type Row = { investor: (typeof p.lois)[number]["investor"]; nda?: StepStatus; loi?: StepStatus; diligence?: StepStatus; amount?: number | null };
  const engaged = new Map<string, Row>();
  const row = (inv: Row["investor"]) => engaged.get(inv.id) ?? engaged.set(inv.id, { investor: inv }).get(inv.id)!;
  for (const l of p.lois) Object.assign(row(l.investor), { loi: l.status as StepStatus, amount: l.amount });
  for (const d of p.dealSteps) row(d.investor)[d.step === "NDA" ? "nda" : "diligence"] = d.status as StepStatus;

  // Pre-fill the calculator from listing data when it hasn't been scored yet.
  const assetMap: Record<string, string> = { "Powered Land": "Powered Land", "Powered Shell": "Powered Shell", "Mining Facility": "Mining Facility", "Industrial Conversion": "Industrial Conversion", "Old Data Center": "Old Data Center" };
  const initial: ValuationInputs = parseInputs(p.valuationInputs) ?? {
    ...DEFAULT_INPUTS,
    assetType: assetMap[p.facilityType] ?? "Powered Shell",
    mw: p.mw,
    powerStatus: p.powerStatus ?? DEFAULT_INPUTS.powerStatus,
    monthsToPower: p.monthsToPower ?? DEFAULT_INPUTS.monthsToPower,
    powerRateCents: p.powerRateCents ?? DEFAULT_INPUTS.powerRateCents,
    askingPrice: p.dealType === "SALE" ? p.fundingNeeded : 0,
  };
  const save = async (inputs: ValuationInputs) => { "use server"; return saveValuation(id, inputs); };

  return (
    <div className="space-y-6">
      <Link href="/admin/projects" className="text-sm text-brand-600">← Listings</Link>
      <PageHeader title={p.title} subtitle={<>{p.code} · <Link href={`/admin/developers/${p.developerId}`} className="text-brand-600">{p.developer.company}</Link> · <Badge tone={statusTone(p.visibility)}>{p.visibility}</Badge></>}
        action={<div className="flex flex-wrap items-center gap-2"><span className="text-sm text-slate-500">CRM stage</span><StageSelect projectId={p.id} stage={projectPipelineStage(p, p.developer.stage)} className="w-44" /><Link href={`/admin/projects/${p.id}/data-room`} className="btn-ghost">📁 Data room{p.dataRoomFiles.length ? ` (${p.dataRoomFiles.length})` : ""}</Link><Link href={`/marketplace/${p.id}`} className="btn-ghost">Preview as investor</Link></div>} />
      <Section title="Listing"><ProjectForm p={p} developers={developers} action={updateProject} deleteAction={deleteProject}
        documents={p.documents.map((d) => ({ id: d.id, name: d.name, url: d.url === "#" ? "" : d.url, access: docStage(d.access), ...(d.fileId && { fileId: d.fileId }) }))}
        dataRoom={{ projectId: p.id, folders: p.dataRoomFolders, files: p.dataRoomFiles }} /></Section>

      <div id="disclosure">
        <Section title="Investor disclosure" action={<Link href={`/marketplace/${p.id}?as=TEASER`} className="text-sm text-brand-600">Preview by stage</Link>}>
          <p className="mb-4 text-sm text-slate-600">Investors start at the teaser and see more as you confirm each step: NDA, LOI, then full diligence. Pick the stage that opens each part of the listing. Headline facts (MW, facility, location, funding, status) are always visible to approved members.</p>
          <form action={saveDisclosure} className="space-y-3">
            <input type="hidden" name="projectId" value={p.id} />
            <div className="grid gap-3 sm:grid-cols-2">
              {SECTIONS.map((x) => <Field key={x.key} label={x.label}><Select name={x.key} options={stageOptions} defaultValue={show[x.key]} /></Field>)}
              <Field label="Project NDA link (optional; otherwise the standard confidentiality terms apply)"><input name="ndaUrl" defaultValue={p.ndaUrl ?? ""} className="input" placeholder="https://…" /></Field>
            </div>
            <button className="btn-ghost">Save disclosure</button>
          </form>
        </Section>
      </div>

      <Section title="Investor access" action={<Link href="/admin/lois" className="text-sm text-brand-600">Review queue</Link>}>
        {engaged.size ? (
          <table className="w-full"><thead><tr><th className="th">Investor</th><th className="th">Stage</th><th className="th">NDA</th><th className="th">LOI</th><th className="th">Diligence</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{[...engaged.values()].map((r) => {
              const st = investorStage({ masterNda: r.investor.ndaSigned, ...r });
              return (
                <tr key={r.investor.id}>
                  <td className="td"><Link href={`/admin/investors/${r.investor.id}`} className="text-brand-600">{r.investor.name}</Link><div className="text-xs text-slate-500">{r.investor.firm}</div></td>
                  <td className="td"><Badge tone={st === "TEASER" ? "slate" : "green"}>{STAGE_INFO[st].label}</Badge></td>
                  <td className="td">{r.nda ? <Badge tone={statusTone(r.nda)}>{r.nda}</Badge> : r.investor.ndaSigned ? <span className="text-xs text-slate-500">Master NDA</span> : "—"}</td>
                  <td className="td">{r.loi ? <><Badge tone={statusTone(r.loi)}>{r.loi}</Badge> <span className="text-xs">{usd(r.amount)}</span></> : "—"}</td>
                  <td className="td">{r.diligence ? <Badge tone={statusTone(r.diligence)}>{r.diligence}</Badge> : "—"}</td>
                </tr>
              );
            })}</tbody></table>
        ) : <p className="text-sm text-slate-500">No investor has signed an NDA or sent an LOI yet.</p>}
        <form action={grantStage} className="mt-4 grid items-end gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
          <input type="hidden" name="projectId" value={p.id} />
          <Field label="Set access for investor" className="sm:col-span-2"><Select name="investorId" required placeholder="Choose investor…" options={investors.map((i) => ({ value: i.id, label: `${i.name}${i.firm ? ` (${i.firm})` : ""}` }))} /></Field>
          <Field label="Stage"><Select name="stage" options={stageOptions} defaultValue="NDA" /></Field>
          <div><button className="btn-ghost">Set access</button></div>
          <p className="text-xs text-slate-500 sm:col-span-4">Use this when an NDA or LOI was signed outside the portal. Choosing a lower stage revokes the later steps. An investor with a master NDA on their CRM record always has at least NDA access.</p>
        </form>
      </Section>

      <div id="valuation">
        <Section title="Valuation & lead score (internal only)">
          <Calculator initial={initial} onSave={save} scoring={scoring} />
        </Section>
      </div>
    </div>
  );
}
