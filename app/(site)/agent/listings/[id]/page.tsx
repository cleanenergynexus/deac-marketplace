import Link from "next/link";
import { placeShort } from "@/lib/location";
import { notFound } from "next/navigation";
import { groupRootId } from "@/lib/listing-links";
import { listingGroup } from "@/lib/listing-links-db";
import { db } from "@/lib/db";
import { agentView } from "@/lib/auth";
import { agentContactWhere, agentInvestorWhere, agentProjectWhere, PUBLIC_TO_AGENTS } from "@/lib/agents";
import { AGENT_LINKS } from "@/lib/agent-portal";
import { blobUploadMethod, storageMode } from "@/lib/storage";
import { folderPath, formatBytes, inlineSafe } from "@/lib/dataroom";
import { ActivityFeed } from "@/components/ActivityFeed";
import { AgentUploader } from "@/components/AgentUploader";
import { LocalTime } from "@/components/LocalTime";
import { Discussion, EditLog } from "@/components/ListingCollab";
import { AgentEditListingForm, AgentTaskForm, CommentForm } from "@/components/ListingCollabForms";
import { toggleListingTask } from "@/app/actions/agent";
import { CrmIcon } from "@/components/CrmIcons";
import { Badge, PageHeader, Section, statusTone } from "@/components/ui";
import { DEAL_TYPES, stageLabel } from "@/lib/constants";
import { taskState } from "@/lib/crm";
import { funnelStages, placeStage, projectStage, projectStageLabel } from "@/lib/pipeline";
import { getInvestorPipeline, getPipeline } from "@/lib/pipeline-db";
import { sortTasks } from "@/lib/tasks";
import { AGENT_EDIT_FIELDS, agentAssigneeOptions, type FieldValue } from "@/lib/listing-collab";
import { listingCollab, taskTeam } from "@/lib/listing-collab-db";
import { num, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

const VIS: Record<string, string> = { DRAFT: "Draft: the DEAC team is reviewing it", PRIVATE: "Live to approved investors", TEASER: "Live, with a public teaser" };
const TABS = [
  { value: "overview", label: "Overview" },
  { value: "pipeline", label: "Pipeline & Activity" },
  { value: "tasks", label: "Tasks" },
  { value: "data-room", label: "Data Room" },
  { value: "discussion", label: "Discussion" },
] as const;
type Tab = (typeof TABS)[number]["value"];

/**
 * A listing the referral agent brought in, as a shared workspace with the DEAC team: the details (which the agent can
 * edit), where it sits on the CRM boards and its activity, tasks for the agent and the team, the full data room
 * (view, download, upload), and a discussion with the team.
 */
export default async function AgentListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; tab?: string; folder?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: Tab = TABS.find((t) => t.value === sp.tab)?.value ?? "overview";
  const { agent: me, preview } = await agentView();
  const p = await loadListing(id, me.id);
  if (!p) notFound();
  // Linked listings (the same project marketed for Sale / Lease / Financing) share the original listing's data room.
  const roomId = groupRootId(p);
  const [room, group] = await Promise.all([loadDataRoom(roomId), listingGroup(p.id)]);
  const [pipeline, investorPipeline, activity, myContacts, interests, tasks, team, collab] = await Promise.all([
    getPipeline(),
    getInvestorPipeline(),
    // Everything logged on this listing, developer and investor side, except emails copied from a team member's Gmail.
    db.activity.findMany({
      where: { projectId: id, kind: { not: "TASK" }, ...PUBLIC_TO_AGENTS },
      include: { contact: { select: { id: true, name: true } }, investor: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 60,
    }),
    db.contact.findMany({ where: { AND: [{ developerId: p.developerId }, agentContactWhere(me.id)] }, select: { id: true } }),
    db.investorInterest.findMany({ where: { projectId: id }, include: { investor: { select: { id: true, name: true, firm: true, referredById: true } } }, orderBy: { updatedAt: "desc" } }),
    db.activity.findMany({ where: { projectId: id, kind: "TASK" }, include: { assignee: { select: { id: true, name: true } } } }),
    taskTeam(),
    listingCollab(id),
  ]);
  // Only link people the agent can open in their portal; others show their name only.
  const visible = new Set(myContacts.map((c) => c.id));
  const myInvestors = new Set((await db.investor.findMany({ where: { AND: [{ id: { in: activity.flatMap((a) => (a.investorId ? [a.investorId] : [])) } }, agentInvestorWhere(me.id)] }, select: { id: true } })).map((i) => i.id));
  const feed = activity.map((a) => ({ ...a, contact: a.contact && visible.has(a.contact.id) ? a.contact : null, investor: a.investor && myInvestors.has(a.investor.id) ? a.investor : null, body: a.investor && !myInvestors.has(a.investor.id) ? `${a.investor.name}: ${a.body}` : a.body }));
  const openTasks = tasks.filter((t) => !t.doneAt).length;
  const counts: Partial<Record<Tab, number>> = { tasks: openTasks, "data-room": room.files.length, discussion: collab.comments.length };
  const href = (t: Tab, extra = "") => `/agent/listings/${p.id}?tab=${t}${extra}`;

  return (
    <div className="space-y-6">
      <Link href="/agent/listings" className="text-sm text-brand-600">← Listings</Link>
      <PageHeader title={p.title} subtitle={<><span className="font-mono">{p.code}</span> · {p.developer.company}{group.length > 1 && <> · Also marketed as {group.filter((g) => g.id !== p.id).map((g, i) => <span key={g.id}>{i ? ", " : ""}<Link href={`/agent/listings/${g.id}`} className="text-brand-600">{stageLabel(DEAL_TYPES, g.dealType)} ({g.code})</Link></span>)}</>}</>}
        action={p.visibility !== "DRAFT" ? <Link href={`/marketplace/${p.id}`} className="btn-ghost">Open on the marketplace</Link> : undefined} />
      {sp.created && <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">Listing created as a draft. Your DEAC partner has been asked to review it. Add the supporting documents in the Data Room tab.</p>}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4 text-sm"><div className="text-xs uppercase text-slate-500">Size</div><div className="mt-1 font-semibold">{num(p.mw)} MW · {placeShort(p)}{p.city ? ` · ${p.city}` : ""}</div></div>
        <div className="card p-4 text-sm"><div className="text-xs uppercase text-slate-500">Deal</div><div className="mt-1 font-semibold">{stageLabel(DEAL_TYPES, p.dealType)} · {usd(p.fundingNeeded)}</div></div>
        <div className="card p-4 text-sm"><div className="text-xs uppercase text-slate-500">DEAC stage</div><div className="mt-1 font-semibold">{projectStageLabel(pipeline, p, p.developer.stage)}</div></div>
        <div className="card p-4 text-sm"><div className="text-xs uppercase text-slate-500">Status</div><div className="mt-1"><Badge tone={statusTone(p.visibility)}>{VIS[p.visibility] ?? p.visibility}</Badge></div></div>
      </div>

      <nav aria-label="Listing" className="flex flex-wrap gap-1 border-b border-slate-200 text-sm">
        {TABS.map((t) => (
          <Link key={t.value} href={href(t.value)} aria-current={t.value === tab ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${t.value === tab ? "border-brand-600 text-brand-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {t.label}{counts[t.value] ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-xs text-slate-600">{counts[t.value]}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <>
        {p.summary && <Section title="Summary"><p className="whitespace-pre-wrap text-sm text-slate-700">{p.summary}</p></Section>}
        <div id="edit">
          <Section title="Edit Listing Details">
            <p className="mb-4 text-sm text-slate-600">You brought this listing in, so you can keep its details up to date. Changes save right away and investors see them on the marketplace. Each save is logged below and your DEAC partner gets an email with what changed. The deal type, stage, who can see the listing and the documents investors get stay with the DEAC team.</p>
            <AgentEditListingForm projectId={p.id} values={Object.fromEntries(AGENT_EDIT_FIELDS.map((f) => [f.key, (p as unknown as Record<string, FieldValue>)[f.key] ?? null]))} disabled={preview} />
          </Section>
        </div>
        <Section title="Edit History"><EditLog edits={collab.edits} empty="No edits by referral agents yet." /></Section>
      </>}

      {tab === "pipeline" && <PipelineTab p={p} pipeline={pipeline} investorPipeline={investorPipeline} interests={interests} agentId={me.id} feed={feed} />}

      {tab === "tasks" && <>
        <Section title="New Task">
          <AgentTaskForm projectId={p.id} assignees={agentAssigneeOptions(me, team)} disabled={preview} />
        </Section>
        <Section title={`Tasks on This Listing (${openTasks} open)`}>
          <ListingTasks tasks={sortTasks(tasks)} agent={me} />
        </Section>
      </>}

      {tab === "data-room" && <DataRoomTab p={p} room={room} folderId={sp.folder ?? null} agentId={me.id} preview={preview} href={(f) => href("data-room", f ? `&folder=${f}` : "")} />}

      {tab === "discussion" && (
        <Section title="Discussion With the DEAC Team">
          <p className="mb-4 text-sm text-slate-600">Talk through this listing with the DEAC team. Investors never see this. Your DEAC partner gets an email for each message, and you get one when the team replies.</p>
          <Discussion comments={collab.comments} meId={me.id} empty="No messages yet. Start the conversation below." />
          <div className="mt-4"><CommentForm projectId={p.id} disabled={preview} /></div>
        </Section>
      )}
    </div>
  );
}

/** The listing, if this agent brought it in, with its whole data room. */
function loadListing(id: string, agentId: string) {
  return db.project.findFirst({
    where: { AND: [{ id }, agentProjectWhere(agentId)] },
    include: {
      developer: { select: { company: true, stage: true } },
    },
  });
}
type Listing = NonNullable<Awaited<ReturnType<typeof loadListing>>>;

/** A data room: the project that holds it (its listing group's original), with every folder and file. */
async function loadDataRoom(projectId: string) {
  const [folders, files, owner] = await Promise.all([
    db.dataRoomFolder.findMany({ where: { projectId }, select: { id: true, parentId: true, name: true }, orderBy: { name: "asc" } }),
    db.dataRoomFile.findMany({ where: { projectId }, select: { id: true, folderId: true, name: true, size: true, contentType: true, uploadedBy: true, uploadedById: true, createdAt: true }, orderBy: { name: "asc" } }),
    db.project.findUnique({ where: { id: projectId }, select: { code: true } }),
  ]);
  return { projectId, code: owner?.code ?? "", folders, files };
}
type Room = Awaited<ReturnType<typeof loadDataRoom>>;

/** Where the listing sits on the Developer CRM board, the investors working it on the Investor CRM board, and its activity. */
function PipelineTab({ p, pipeline, investorPipeline, interests, agentId, feed }: {
  p: Listing; pipeline: Awaited<ReturnType<typeof getPipeline>>; investorPipeline: Awaited<ReturnType<typeof getInvestorPipeline>>;
  interests: { id: string; stage: string; updatedAt: Date; investor: { id: string; name: string; firm: string | null; referredById: string | null } }[];
  agentId: string; feed: Parameters<typeof ActivityFeed>[0]["items"];
}) {
  const devStages = funnelStages(pipeline, p.dealType);
  const current = projectStage(pipeline, p, p.developer.stage);
  const at = devStages.findIndex((s) => s.value === current);
  const invStages = funnelStages(investorPipeline, p.dealType);
  return <>
    <Section title="Developer CRM Stage">
      <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Developer CRM stages">
        {devStages.map((s, i) => (
          <li key={s.value} aria-current={i === at ? "step" : undefined}
            className={`rounded-full px-2.5 py-1 font-medium ${i === at ? "bg-brand-600 text-white" : i < at ? "bg-brand-50 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
            {i < at ? "✓ " : ""}{s.label}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-slate-500">The column this listing is in on the DEAC team&apos;s Developer CRM board ({stageLabel(DEAL_TYPES, p.dealType)} funnel). The team moves it as the deal progresses.</p>
    </Section>

    <Section title={`Investor Pipeline (${interests.length})`}>
      {interests.length ? (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-3">
            {invStages.map((s) => {
              const col = interests.filter((it) => placeStage(invStages, it.stage) === s.value);
              return (
                <div key={s.value} className="w-52 shrink-0 rounded-lg bg-slate-50 p-2">
                  <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase text-slate-500"><span>{s.label}</span><span>{col.length}</span></div>
                  <ul className="space-y-2">
                    {col.map((it) => (
                      <li key={it.id} className="rounded-md border border-slate-200 bg-white p-2 text-sm shadow-sm">
                        {it.investor.referredById === agentId ? <Link href={AGENT_LINKS.investor(it.investor.id)} className="block truncate font-semibold text-brand-600">{it.investor.name}</Link> : <span className="block truncate font-semibold text-slate-900">{it.investor.name}</span>}
                        <span className="block truncate text-xs text-slate-500">{it.investor.firm || "No company on file"}</span>
                        <span className="mt-1 block text-[11px] text-slate-400">Updated <LocalTime value={it.updatedAt} time={false} /></span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      ) : <p className="text-sm text-slate-500">No investors are working this listing yet. The DEAC team adds them as they engage.</p>}
      <p className="mt-2 text-xs text-slate-500">The DEAC team&apos;s Investor CRM board for this listing. Investors you referred link to their record.</p>
    </Section>

    <Section title="Activity on This Listing">
      <ActivityFeed items={feed} showContact readOnly links={AGENT_LINKS} empty="Nothing logged on this listing yet." />
    </Section>
  </>;
}

/** Every task on the listing. The agent ticks off the ones assigned to them or that they created. */
function ListingTasks({ tasks, agent }: { tasks: { id: string; subject: string | null; body: string; dueAt: Date | null; doneAt: Date | null; createdAt: Date; by: string | null; assigneeId: string | null; assignee: { id: string; name: string } | null }[]; agent: { id: string; name: string } }) {
  if (!tasks.length) return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No tasks on this listing yet. Add one above for yourself or the DEAC team.</p>;
  return (
    <ul className="space-y-2">
      {tasks.map((t) => {
        const state = taskState(t);
        const mine = t.assigneeId === agent.id || t.by === agent.name;
        const circle = `flex h-8 w-8 items-center justify-center rounded-full border-2 ${t.doneAt ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent"}`;
        return (
          <li key={t.id} className="flex gap-3 rounded-lg border border-slate-200 p-3 text-sm">
            {mine ? (
              <form action={toggleListingTask}>
                <input type="hidden" name="id" value={t.id} />
                <button aria-label={t.doneAt ? "Mark task not done" : "Mark task done"} title={t.doneAt ? "Mark not done" : "Mark done"} className={`${circle} ${t.doneAt ? "" : "hover:border-emerald-500 hover:text-emerald-500"}`}><CrmIcon name="TASK" /></button>
              </form>
            ) : <span className={circle}><CrmIcon name="TASK" /></span>}
            <div className="min-w-0 flex-1">
              <div className={`font-semibold ${t.doneAt ? "text-slate-400 line-through" : "text-slate-900"}`}>{t.subject || "Task"}</div>
              {t.body && <p className="mt-1 whitespace-pre-wrap text-slate-700">{t.body}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                {t.doneAt ? <span className="text-emerald-700">Completed <LocalTime value={t.doneAt} time={false} /></span>
                  : t.dueAt ? <span className={state === "overdue" ? "font-semibold text-red-600" : state === "due-today" ? "font-semibold text-amber-700" : ""}>{state === "overdue" ? "Overdue · " : state === "due-today" ? "Due today · " : "Due "}<LocalTime value={t.dueAt} time={false} /></span>
                  : <span>No due date</span>}
                <span>For <b className="font-medium text-slate-700">{t.assigneeId === agent.id ? "you" : t.assignee?.name ?? "the DEAC team"}</b></span>
                {t.by && <span>from {t.by === agent.name ? "you" : t.by}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** The listing's whole data room, folder by folder: open or download any file, and upload new ones. */
function DataRoomTab({ p, room, folderId, agentId, preview, href }: { p: Listing; room: Room; folderId: string | null; agentId: string; preview: boolean; href: (folder: string | null) => string }) {
  const folder = folderId && room.folders.some((f) => f.id === folderId) ? folderId : null;
  const crumbs = folderPath(room.folders, folder);
  const subfolders = room.folders.filter((f) => f.parentId === folder);
  const files = room.files.filter((f) => f.folderId === folder);
  const inside = (id: string): number => room.files.filter((f) => f.folderId === id).length + room.folders.filter((f) => f.parentId === id).reduce((n, f) => n + inside(f.id), 0);
  const options = room.folders
    .map((f) => ({ id: f.id, label: folderPath(room.folders, f.id).map((x) => x.name).join(" / ") }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const mine = room.files.filter((f) => f.uploadedById === agentId).length;
  return <>
    <Section title="Data Room">
      <p className="mb-3 text-sm text-slate-600">The full data room for this listing. Open or download any file. The DEAC team organizes the folders and decides which documents investors get. {room.projectId !== p.id && <>This listing shares the {room.code} data room with its linked listings. </>}{room.files.length} file{room.files.length === 1 ? "" : "s"} in total, {mine} uploaded by you.</p>
      <nav aria-label="Folder" className="mb-3 flex flex-wrap items-center gap-1 text-sm">
        <Link href={href(null)} className={folder ? "text-brand-600" : "font-semibold text-slate-900"}>📁 {room.code}</Link>
        {crumbs.map((c, i) => <span key={c.id} className="flex items-center gap-1"><span className="text-slate-400">/</span>{i === crumbs.length - 1 ? <span className="font-semibold text-slate-900">{c.name}</span> : <Link href={href(c.id)} className="text-brand-600">{c.name}</Link>}</span>)}
      </nav>
      {subfolders.length || files.length ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="th">Name</th><th className="th">Size</th><th className="th">Added</th><th className="th"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {subfolders.map((f) => (
                <tr key={f.id}>
                  <td className="td"><Link href={href(f.id)} className="font-medium text-brand-600">📁 {f.name}</Link></td>
                  <td className="td text-slate-500">{inside(f.id)} item{inside(f.id) === 1 ? "" : "s"}</td><td className="td" /><td className="td" />
                </tr>
              ))}
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="td"><a href={`/api/data-room/files/${f.id}`} target="_blank" rel="noreferrer" className="font-medium text-slate-900 hover:text-brand-600">📄 {f.name}</a>{f.uploadedById === agentId && <span className="ml-2 rounded bg-violet-50 px-1.5 py-0.5 text-[11px] text-violet-700">Yours</span>}</td>
                  <td className="td whitespace-nowrap text-slate-500">{formatBytes(f.size)}</td>
                  <td className="td whitespace-nowrap text-xs text-slate-500"><LocalTime value={f.createdAt} time={false} />{f.uploadedBy ? <div className="truncate">{f.uploadedBy}</div> : null}</td>
                  <td className="td whitespace-nowrap text-right">
                    {inlineSafe(f.contentType) && <a href={`/api/data-room/files/${f.id}`} target="_blank" rel="noreferrer" className="mr-3 text-brand-600">Open</a>}
                    <a href={`/api/data-room/files/${f.id}?download`} className="text-brand-600">Download</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{folder ? "This folder is empty." : "The data room is empty. Add the first documents below."}</p>}
    </Section>
    <Section title="Add Documents">
      <p className="mb-4 text-sm text-slate-600">Site plans, utility letters, financials… The DEAC team is told when you add files.</p>
      {preview ? <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">The agent sees an upload box here. It&apos;s turned off in the preview.</p>
        : <AgentUploader projectId={room.projectId} folders={options} storage={storageMode()} uploadMethod={blobUploadMethod()} />}
    </Section>
  </>;
}
