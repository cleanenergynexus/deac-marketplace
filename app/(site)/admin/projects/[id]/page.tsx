import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { deleteProject, duplicateListing, grantStage, reviewDealStep, reviewLoi, saveDisclosure, saveValuation, updateProject } from "@/app/actions/admin";
import { listingGroup } from "@/lib/listing-links-db";
import { dealShort, groupRootId } from "@/lib/listing-links";
import { DuplicateListingForm } from "@/components/DuplicateListingForm";
import { DEAL_STAGES, dealTypeLabel } from "@/lib/constants";
import { ProjectForm } from "@/components/ProjectForm";
import { StageSelect } from "@/components/StageSelect";
import { funnelStages, projectStage } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";
import { Calculator } from "@/components/Calculator";
import { Badge, Field, PageHeader, Section, Select, statusTone } from "@/components/ui";
import { DEFAULT_INPUTS, parseInputs, type ValuationInputs } from "@/lib/valuation";
import { usd } from "@/lib/format";
import { getScoring } from "@/lib/scoring-db";
import { requireAdmin } from "@/lib/auth";
import { assigneeOptions, staffLevel } from "@/lib/tasks";
import { getTaskEditing, getTaskPeople, getTaskPickers, visibleTaskWhere } from "@/lib/tasks-db";
import { TaskForm } from "@/components/TaskForm";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Discussion, EditLog } from "@/components/ListingCollab";
import { CommentForm } from "@/components/ListingCollabForms";
import { listingAgents, listingCollab } from "@/lib/listing-collab-db";
import { docStage, investorStage, parseDisclosure, SECTIONS, STAGES, STAGE_INFO, type StepStatus } from "@/lib/disclosure";

const stageOptions = STAGES.map((s) => ({ value: s, label: `${STAGE_INFO[s].step}${s === "TEASER" ? " (all members)" : ""}` }));

export const dynamic = "force-dynamic";

export default async function ProjectAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ duplicated?: string }> }) {
  const { id } = await params;
  const { duplicated } = await searchParams;
  const [p, developers, investors, scoring, pipeline] = await Promise.all([
    db.project.findUnique({ where: { id }, include: { documents: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }, dataRoomFolders: { select: { id: true, parentId: true, name: true } }, dataRoomFiles: { select: { id: true, folderId: true, name: true } }, lois: { include: { investor: true } }, dealSteps: { include: { investor: true } }, developer: true } }),
    db.developer.findMany({ select: { id: true, company: true }, orderBy: { company: "asc" } }),
    db.investor.findMany({ select: { id: true, name: true, firm: true }, orderBy: { name: "asc" } }),
    getScoring(),
    getPipeline(),
  ]);
  if (!p) notFound();
  // Linked listings: the same project for Sale / Lease / Financing. They share the original listing's data room.
  const group = await listingGroup(p.id);
  const root = groupRootId(p);
  const room = root === p.id
    ? { folders: p.dataRoomFolders, files: p.dataRoomFiles }
    : await db.project.findUniqueOrThrow({ where: { id: root }, select: { dataRoomFolders: { select: { id: true, parentId: true, name: true } }, dataRoomFiles: { select: { id: true, folderId: true, name: true } } } }).then((r) => ({ folders: r.dataRoomFolders, files: r.dataRoomFiles }));
  // Tasks about this project, limited to the ones this team member may see.
  const [me, people] = await Promise.all([requireAdmin(), getTaskPeople()]);
  const [tasks, pickers, editing, agents, collab] = await Promise.all([
    db.activity.findMany({
      where: { AND: [visibleTaskWhere(me, people), { projectId: id }] },
      include: { contact: { select: { id: true, name: true } }, investor: { select: { id: true, name: true } }, project: { select: { id: true, code: true, title: true } }, assignee: { select: { id: true, name: true } } },
      orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
      take: 100,
    }),
    getTaskPickers(),
    getTaskEditing(me, people),
    listingAgents(p.developerId),
    listingCollab(id),
  ]);
  const assignees = assigneeOptions(me, people);
  const allowUnassigned = staffLevel(me.staffLevel) === "ADMIN";
  const show = parseDisclosure(p.disclosure);

  // Every investor engaged on this listing, with the stage they've reached.
  type Row = { investor: (typeof p.lois)[number]["investor"]; nda?: StepStatus; loi?: StepStatus; diligence?: StepStatus; amount?: number | null; ndaId?: string; loiId?: string; diligenceId?: string };
  const engaged = new Map<string, Row>();
  const row = (inv: Row["investor"]) => engaged.get(inv.id) ?? engaged.set(inv.id, { investor: inv }).get(inv.id)!;
  for (const l of p.lois) Object.assign(row(l.investor), { loi: l.status as StepStatus, amount: l.amount, loiId: l.id });
  for (const d of p.dealSteps) Object.assign(row(d.investor), d.step === "NDA" ? { nda: d.status as StepStatus, ndaId: d.id } : { diligence: d.status as StepStatus, diligenceId: d.id });

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
        action={<div className="flex flex-wrap items-center gap-2"><span className="text-sm text-slate-500">CRM stage</span><StageSelect projectId={p.id} stage={projectStage(pipeline, p, p.developer.stage)} stages={funnelStages(pipeline, p.dealType)} className="w-44" /><Link href={`/admin/projects/${p.id}/screening`} className="btn-ghost">🔎 Screening</Link><Link href={`/admin/projects/${p.id}/data-room`} className="btn-ghost">📁 Data room{room.files.length ? ` (${room.files.length})` : ""}</Link><a href="#linked" className="btn-ghost">⧉ Duplicate</a><Link href={`/admin/investors?listing=${p.id}`} className="btn-ghost">Investors</Link><Link href={`/marketplace/${p.id}`} className="btn-ghost">Preview as investor</Link></div>} />
      {duplicated && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <b>Linked listing created as a draft.</b> It shares the data room and project facts with {group.filter((g) => g.id !== p.id).map((g) => `${g.code} (${dealShort(g.dealType)})`).join(", ")}. Set its pricing, terms and documents below, then change Visibility to publish it.
        </div>
      )}
      <Section title="Listing"><ProjectForm p={p} developers={developers} action={updateProject} deleteAction={deleteProject} linkedCount={group.length - 1}
        documents={p.documents.map((d) => ({ id: d.id, name: d.name, url: d.url === "#" ? "" : d.url, access: docStage(d.access), ...(d.fileId && { fileId: d.fileId }) }))}
        dataRoom={{ projectId: root, folders: room.folders, files: room.files }} /></Section>

      <div id="linked" className="scroll-mt-4">
        <Section title="Linked Listings (Sale, Lease, Financing)">
          <p className="mb-4 text-sm text-slate-600">Market this same project under another deal type. A duplicate is a linked listing: it shares this project&apos;s data room, screening and valuation, and the project facts marked 🔗 above stay in sync when you save any of them. Title, summary, highlights, pricing, terms, deal stage, visibility, disclosure, the documents investors see, investor access and LOIs stay separate for each listing.</p>
          {group.length > 1 && (
            <table className="mb-4 w-full"><thead><tr><th className="th">Listing</th><th className="th">Deal type</th><th className="th">Deal stage</th><th className="th">Visibility</th><th className="th"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">{group.map((g) => (
                <tr key={g.id} className={g.id === p.id ? "bg-slate-50" : ""}>
                  <td className="td"><span className="font-mono text-xs">{g.code}</span> {g.id === p.id ? <span className="font-medium">{g.title}</span> : <Link href={`/admin/projects/${g.id}`} className="font-medium text-brand-600">{g.title}</Link>}{!g.linkedToId && <span className="ml-2 text-xs text-slate-500">original · owns the data room</span>}</td>
                  <td className="td text-sm">{dealTypeLabel(g.dealType)}</td>
                  <td className="td text-sm">{DEAL_STAGES.find((x) => x.value === g.dealStage)?.label ?? g.dealStage}</td>
                  <td className="td"><Badge tone={statusTone(g.visibility)}>{g.visibility}</Badge></td>
                  <td className="td text-right">{g.id === p.id ? <span className="text-xs text-slate-400">this listing</span> : <Link href={`/admin/investors?listing=${g.id}`} className="text-xs text-brand-600">Investors</Link>}</td>
                </tr>
              ))}</tbody></table>
          )}
          <DuplicateListingForm id={p.id} title={p.title} dealType={p.dealType} fundingNeeded={p.fundingNeeded} used={group.map((g) => g.dealType)} action={duplicateListing} />
        </Section>
      </div>

      <div id="disclosure">
        <Section title="Investor Disclosure" action={<Link href={`/marketplace/${p.id}?as=TEASER`} className="text-sm text-brand-600">Preview by stage</Link>}>
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

      <Section title="Investor Access" action={<Link href="/admin/lois" className="text-sm text-brand-600">Review queue</Link>}>
        {engaged.size ? (
          <table className="w-full"><thead><tr><th className="th">Investor</th><th className="th">Stage</th><th className="th">NDA</th><th className="th">LOI</th><th className="th">Diligence</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{[...engaged.values()].map((r) => {
              const st = investorStage({ masterNda: r.investor.ndaSigned, ...r });
              return (
                <tr key={r.investor.id}>
                  <td className="td"><Link href={`/admin/investors/${r.investor.id}`} className="text-brand-600">{r.investor.name}</Link><div className="text-xs text-slate-500">{r.investor.firm}</div></td>
                  <td className="td"><Badge tone={st === "TEASER" ? "slate" : "green"}>{STAGE_INFO[st].label}</Badge></td>
                  <td className="td">{r.nda ? <Badge tone={statusTone(r.nda)}>{r.nda}</Badge> : r.investor.ndaSigned ? <span className="text-xs text-slate-500">Master NDA</span> : "—"}{r.nda === "PENDING" && r.ndaId && <Confirm id={r.ndaId} />}</td>
                  <td className="td">{r.loi ? <><Badge tone={statusTone(r.loi)}>{r.loi}</Badge> <span className="text-xs">{usd(r.amount)}</span></> : "—"}{r.loi === "PENDING" && r.loiId && <Confirm id={r.loiId} loi />}</td>
                  <td className="td">{r.diligence ? <Badge tone={statusTone(r.diligence)}>{r.diligence}</Badge> : "—"}{r.diligence === "PENDING" && r.diligenceId && <Confirm id={r.diligenceId} />}</td>
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

      <div id="tasks">
        <Section title="Tasks" action={<Link href="/admin/tasks" className="text-sm text-brand-600">All tasks</Link>}>
          <details className="mb-4 rounded-lg border border-slate-200 p-4" open={!tasks.length}>
            <summary className="cursor-pointer text-sm font-semibold">New Task for This Project</summary>
            <div className="mt-4"><TaskForm assignees={assignees} me={me.id} allowUnassigned={allowUnassigned} {...pickers} defaults={{ projectId: p.id }} /></div>
          </details>
          <ActivityFeed items={tasks} showContact assigning={{ options: assignees, allowUnassigned }} editing={editing} empty="No tasks on this project yet. Assign one to a team member or a referral agent above." />
        </Section>
      </div>

      {(agents.length > 0 || collab.comments.length > 0 || collab.edits.length > 0) && (
        <div id="collaboration" className="scroll-mt-4">
          <Section title="Referral Agent Collaboration">
            <p className="mb-4 text-sm text-slate-600">
              {agents.length ? <>Brought in by {agents.map((a) => a.name).join(", ")}. </> : null}
              Referral agents see this listing&apos;s CRM stages, investor pipeline and activity, its tasks and its whole data room. They can edit its details (logged below), add tasks for themselves or the team, and talk it through here. Investors never see this discussion.
            </p>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="mb-2 text-sm font-semibold">Discussion</h3>
                <Discussion comments={collab.comments} meId={me.id} empty="No messages yet." />
                <div className="mt-3"><CommentForm projectId={p.id} team placeholder={agents.length ? `Message ${agents.map((a) => a.name.split(" ")[0]).join(" and ")}…` : "Write a message…"} /></div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-semibold">Edits by Referral Agents</h3>
                <EditLog edits={collab.edits} empty="No edits by referral agents yet." />
              </div>
            </div>
          </Section>
        </div>
      )}

      <div id="valuation">
        <Section title="Valuation & Lead Score (Internal Only)">
          <Calculator initial={initial} onSave={save} scoring={scoring} />
        </Section>
      </div>
    </div>
  );
}

/** One-click confirm for a pending NDA / LOI / diligence step (same as the NDAs & LOIs queue). */
function Confirm({ id, loi }: { id: string; loi?: boolean }) {
  return (
    <form action={loi ? reviewLoi : reviewDealStep} className="mt-1">
      <input type="hidden" name="id" value={id} /><input type="hidden" name="status" value="APPROVED" />
      <button className="text-xs font-semibold text-brand-600 hover:underline">{loi ? "Accept" : "Confirm"}</button>
    </form>
  );
}
