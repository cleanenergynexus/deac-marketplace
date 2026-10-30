import Link from "next/link";
import { placeShort } from "@/lib/location";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { agentView } from "@/lib/auth";
import { agentContactWhere, agentProjectWhere } from "@/lib/agents";
import { AGENT_LINKS } from "@/lib/agent-portal";
import { blobUploadMethod, storageMode } from "@/lib/storage";
import { folderPath, formatBytes } from "@/lib/dataroom";
import { ActivityFeed } from "@/components/ActivityFeed";
import { AgentUploader } from "@/components/AgentUploader";
import { LocalTime } from "@/components/LocalTime";
import { Badge, PageHeader, Section, statusTone } from "@/components/ui";
import { DEAL_TYPES, stageLabel } from "@/lib/constants";
import { projectStageLabel } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";
import { num, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

const VIS: Record<string, string> = { DRAFT: "Draft: the DEAC team is reviewing it", PRIVATE: "Live to approved investors", TEASER: "Live, with a public teaser" };

/** A listing as the referral agent sees it: the basics, its stage, and an upload-only data room. */
export default async function AgentListing({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params;
  const created = (await searchParams).created;
  const { agent: me, preview } = await agentView();
  const p = await db.project.findFirst({
    where: { AND: [{ id }, agentProjectWhere(me.id)] },
    include: {
      developer: { select: { company: true, stage: true } },
      dataRoomFolders: { select: { id: true, parentId: true, name: true } },
      dataRoomFiles: { where: { uploadedById: me.id }, select: { id: true, folderId: true, name: true, size: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      _count: { select: { dataRoomFiles: true } },
    },
  });
  if (!p) notFound();
  const [pipeline, activity, mine] = await Promise.all([
    getPipeline(),
    db.activity.findMany({
      // Developer-side entries only: investor activity on the listing belongs to those investors.
      where: { projectId: id, developerId: p.developerId },
      include: { contact: { select: { id: true, name: true } }, assignee: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.contact.findMany({ where: { AND: [{ developerId: p.developerId }, agentContactWhere(me.id)] }, select: { id: true } }),
  ]);
  // Only link contacts the agent can open; other people at the company show no name.
  const visible = new Set(mine.map((c) => c.id));
  const feed = activity.map((a) => ({ ...a, contact: a.contact && visible.has(a.contact.id) ? a.contact : null }));
  const folders = p.dataRoomFolders
    .map((f) => ({ id: f.id, label: folderPath(p.dataRoomFolders, f.id).map((x) => x.name).join(" / ") }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const where = (folderId: string | null) => folderPath(p.dataRoomFolders, folderId).map((x) => x.name).join(" / ") || "Top level";

  return (
    <div className="space-y-6">
      <Link href="/agent/listings" className="text-sm text-brand-600">← Listings</Link>
      <PageHeader title={p.title} subtitle={<><span className="font-mono">{p.code}</span> · {p.developer.company}</>}
        action={p.visibility !== "DRAFT" ? <Link href={`/marketplace/${p.id}`} className="btn-ghost">Open on the marketplace</Link> : undefined} />
      {created && <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">Listing created as a draft. Your DEAC partner has been asked to review it. Add the supporting documents to its data room below.</p>}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card p-4 text-sm"><div className="text-xs uppercase text-slate-500">Size</div><div className="mt-1 font-semibold">{num(p.mw)} MW · {placeShort(p)}{p.city ? ` · ${p.city}` : ""}</div></div>
        <div className="card p-4 text-sm"><div className="text-xs uppercase text-slate-500">Deal</div><div className="mt-1 font-semibold">{stageLabel(DEAL_TYPES, p.dealType)} · {usd(p.fundingNeeded)}</div></div>
        <div className="card p-4 text-sm"><div className="text-xs uppercase text-slate-500">DEAC stage</div><div className="mt-1 font-semibold">{projectStageLabel(pipeline, p, p.developer.stage)}</div></div>
        <div className="card p-4 text-sm"><div className="text-xs uppercase text-slate-500">Status</div><div className="mt-1"><Badge tone={statusTone(p.visibility)}>{VIS[p.visibility] ?? p.visibility}</Badge></div></div>
      </div>
      {p.summary && <Section title="Summary"><p className="whitespace-pre-wrap text-sm text-slate-700">{p.summary}</p></Section>}

      <div id="data-room" className="scroll-mt-4">
        <Section title="Data room">
          <p className="mb-4 text-sm text-slate-600">Add documents for this project (site plans, utility letters, financials…). The DEAC team reviews and organizes them. Uploads go one way: files in the data room can&apos;t be opened or downloaded from here. It holds {p._count.dataRoomFiles} file{p._count.dataRoomFiles === 1 ? "" : "s"} in total.</p>
          {preview ? <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">The agent sees an upload box here. It&apos;s turned off in the preview.</p>
            : <AgentUploader projectId={p.id} folders={folders} storage={storageMode()} uploadMethod={blobUploadMethod()} />}
          <h3 className="mb-2 mt-6 text-sm font-semibold">Your uploads ({p.dataRoomFiles.length})</h3>
          {p.dataRoomFiles.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {p.dataRoomFiles.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="min-w-0 truncate">{f.name}</span>
                  <span className="text-xs text-slate-500">{where(f.folderId)} · {formatBytes(f.size)} · <LocalTime value={f.createdAt} /></span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-slate-500">You haven&apos;t uploaded anything to this project yet.</p>}
        </Section>
      </div>

      <Section title="Activity on this project">
        <ActivityFeed items={feed} showContact readOnly links={AGENT_LINKS} empty="Nothing logged on this project yet." />
      </Section>
    </div>
  );
}
