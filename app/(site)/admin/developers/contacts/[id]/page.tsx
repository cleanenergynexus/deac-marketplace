import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { deleteContact, makePrimaryContact, setProjectContact, updateContact } from "@/app/actions/contacts";
import { ActivityComposer } from "@/components/ActivityComposer";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ContactForm } from "@/components/ContactForm";
import { Avatar, CrmIcon } from "@/components/CrmIcons";
import { ConfirmButton } from "@/components/ConfirmButton";
import { StageSelect } from "@/components/StageSelect";
import { Badge } from "@/components/ui";
import { CONTACT_TABS, contactTab, initials, projectContactId } from "@/lib/crm";
import { funnelStages, projectStage, projectStageLabel } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";
import { num } from "@/lib/format";
import { formatPhone, telHref } from "@/lib/phone";
import { addressLines, hasAddress, mapsHref, shortPlace } from "@/lib/address";
import { recommendation } from "@/lib/valuation";
import { getScoring } from "@/lib/scoring-db";
import { requireAdmin } from "@/lib/auth";
import { getAgents } from "@/lib/agents-db";
import { staffLevel, visibleStaff } from "@/lib/tasks";
import { getTeam, visibleTimelineWhere } from "@/lib/tasks-db";

export const dynamic = "force-dynamic";

const QUICK = [
  { tab: "notes", kind: "NOTE", label: "Note" },
  { tab: "emails", kind: "EMAIL", label: "Email" },
  { tab: "calls", kind: "CALL", label: "Call" },
  { tab: "meetings", kind: "MEETING", label: "Meeting" },
  { tab: "tasks", kind: "TASK", label: "Task" },
] as const;

/** HubSpot-style contact record: details on the left, communications timeline in the middle, company and projects on the right. */
export default async function ContactRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const tab = contactTab((await searchParams).tab);
  const contact = await db.contact.findUnique({
    where: { id },
    include: {
      referredBy: { select: { name: true } },
      developer: {
        include: {
          referredBy: { select: { name: true } },
          contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
          projects: { select: { id: true, code: true, title: true, mw: true, valueScore: true, dealType: true, pipelineStage: true, contactId: true }, orderBy: { createdAt: "asc" } },
        },
      },
    },
  });
  if (!contact) notFound();
  const dev = contact.developer;
  const [scoring, pipeline, me, team, agents] = await Promise.all([getScoring(), getPipeline(), requireAdmin(), getTeam(), getAgents()]);
  const assignees = visibleStaff(me, team).map((u) => ({ id: u.id, name: u.name }));
  const allowUnassigned = staffLevel(me.staffLevel) === "ADMIN";

  // The primary contact also carries company-wide history logged before contact records existed.
  // Tasks only show to the people who may see them (Admin: all, Manager: their team's, Support: their own).
  const where = { AND: [{ OR: [{ contactId: id }, ...(contact.isPrimary ? [{ developerId: dev.id, contactId: null }] : [])] }, visibleTimelineWhere(me, team)] };
  const all = await db.activity.findMany({ where, include: { contact: { select: { id: true, name: true } }, project: { select: { id: true, code: true, title: true } }, assignee: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } });
  const count = (kinds: readonly string[] | null) => (kinds ? all.filter((a) => kinds.includes(a.kind)).length : all.length);
  let items = tab.kinds ? all.filter((a) => (tab.kinds as readonly string[]).includes(a.kind)) : all;
  if (tab.value === "tasks") {
    // Open tasks first, soonest due first; then completed ones.
    items = [...items].sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  }
  const openTasks = all.filter((a) => a.kind === "TASK" && !a.doneAt).length;

  const mine = dev.projects.filter((p) => projectContactId(p, dev.contacts) === id);
  const others = dev.projects.filter((p) => !mine.includes(p));
  const otherContacts = dev.contacts.filter((c) => c.id !== id);

  return (
    <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_250px]">
      {/* Left: who they are */}
      <aside className="space-y-4">
        <Link href="/admin/developers/contacts" className="text-sm text-brand-600">← Contacts</Link>
        <div className="card p-5 text-center">
          <Avatar name={contact.name} initials={initials(contact.name)} size="lg" />
          <h1 className="mt-3 text-xl font-bold">{contact.name}</h1>
          {contact.title && <div className="text-sm text-slate-600">{contact.title}</div>}
          <Link href={`/admin/developers/${dev.id}`} className="text-sm text-brand-600">{dev.company}</Link>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {contact.isPrimary ? <Badge tone="blue">Primary contact</Badge> : (
              <form action={makePrimaryContact}><input type="hidden" name="id" value={id} /><button className="text-xs text-brand-600">Make primary contact</button></form>
            )}
            {openTasks > 0 && <Badge tone="amber">{openTasks} open task{openTasks === 1 ? "" : "s"}</Badge>}
            {(contact.referredBy ?? dev.referredBy) && <Badge tone="purple">Referred by {(contact.referredBy ?? dev.referredBy)!.name}</Badge>}
          </div>
          <div className="mt-4 flex justify-center gap-3">
            {QUICK.map((q) => (
              <Link key={q.kind} href={`?tab=${q.tab}#composer`} className="group flex flex-col items-center gap-1 text-xs text-slate-600">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 bg-white group-hover:border-brand-500 group-hover:text-brand-600"><CrmIcon name={q.kind} /></span>
                {q.label}
              </Link>
            ))}
          </div>
          <div className="mt-4 space-y-1 text-left text-sm">
            {contact.email && <a href={`mailto:${contact.email}`} className="block truncate text-brand-600">{contact.email}</a>}
            {contact.phone && <a href={telHref(contact.phone)} className="block text-slate-700">{formatPhone(contact.phone)}</a>}
            {contact.mobile && <a href={telHref(contact.mobile)} className="block text-slate-700">{formatPhone(contact.mobile)} <span className="text-xs text-slate-400">mobile</span></a>}
            {hasAddress(contact) && (
              <a href={mapsHref(contact)} target="_blank" rel="noreferrer" className="block pt-1 text-slate-600 hover:text-brand-600">
                {addressLines(contact).map((l) => <span key={l} className="block">{l}</span>)}
              </a>
            )}
            {contact.linkedin && <a href={contact.linkedin.startsWith("http") ? contact.linkedin : `https://${contact.linkedin}`} target="_blank" rel="noreferrer" className="block truncate text-brand-600">LinkedIn</a>}
          </div>
        </div>
        <details className="card p-5" open>
          <summary className="cursor-pointer text-sm font-semibold">About this contact</summary>
          <div className="mt-4"><ContactForm contact={contact} action={updateContact} compact country={dev.country} agents={agents} /></div>
        </details>
        {otherContacts.length > 0 && (
          <form action={deleteContact} className="text-center">
            <input type="hidden" name="id" value={id} />
            <ConfirmButton message={`Delete ${contact.name}? Their logged activity stays on ${dev.company}.`} className="text-xs text-red-600">Delete contact</ConfirmButton>
          </form>
        )}
      </aside>

      {/* Middle: communications */}
      <main className="min-w-0 space-y-4">
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {CONTACT_TABS.map((t) => (
            <Link key={t.value} href={`?tab=${t.value}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${t.value === tab.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              {t.label} <span className="text-xs text-slate-400">{count(t.kinds)}</span>
            </Link>
          ))}
        </nav>
        <ActivityComposer key={tab.value} contactId={id} contactEmail={contact.email} initialKind={tab.log} projects={dev.projects.map((p) => ({ id: p.id, label: `${p.code} · ${p.title}` }))} assignees={assignees} me={me.id} allowUnassigned={allowUnassigned} />
        <ActivityFeed items={items} assigning={{ options: assignees, allowUnassigned }} empty={tab.value === "activity" ? `Nothing logged with ${contact.name} yet. Log a note, email, call, meeting or task above.` : `No ${tab.label.toLowerCase()} yet.`} />
      </main>

      {/* Right: associations */}
      <aside className="space-y-4 lg:col-start-2 xl:col-start-auto">
        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CrmIcon name="COMPANY" /> Company</h2>
          <Link href={`/admin/developers/${dev.id}`} className="block rounded-lg border border-slate-200 p-3 hover:border-brand-500">
            <div className="font-semibold text-brand-700">{dev.company}</div>
            {dev.website && <div className="truncate text-xs text-slate-500">{dev.website.replace(/^https?:\/\//, "")}</div>}
            <div className="mt-1 text-xs text-slate-500">{[shortPlace(dev) || dev.hq, `${dev.projects.length} project${dev.projects.length === 1 ? "" : "s"}`, `${dev.contacts.length} contact${dev.contacts.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</div>
          </Link>
        </section>

        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CrmIcon name="PROJECT" /> {contact.name.split(" ")[0]}&apos;s projects ({mine.length})</h2>
          {!mine.length && <p className="text-sm text-slate-500">No projects assigned to this contact.</p>}
          <ul className="space-y-3">
            {mine.map((p) => (
              <li key={p.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <Link href={`/admin/projects/${p.id}`} className="font-medium text-slate-900 hover:text-brand-600">{p.title}</Link>
                <div className="mt-0.5 flex flex-wrap items-center justify-between gap-1 text-xs text-slate-500">
                  <span className="font-mono">{p.code} · {num(p.mw)} MW</span>
                  {p.valueScore != null && <span className="shrink-0 whitespace-nowrap"><Badge tone={recommendation(p.valueScore, scoring).tone}>Score {p.valueScore}</Badge></span>}
                </div>
                <div className="mt-2"><StageSelect projectId={p.id} stage={projectStage(pipeline, p, dev.stage)} stages={funnelStages(pipeline, p.dealType)} className="w-full" /></div>
              </li>
            ))}
          </ul>
          <Link href={`/admin/projects/new?developerId=${dev.id}`} className="btn-ghost mt-3 w-full">Add a project</Link>
        </section>

        {others.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Other {dev.company} projects</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {others.map((p) => {
                const owner = dev.contacts.find((c) => c.id === projectContactId(p, dev.contacts));
                return (
                  <li key={p.id} className="py-2">
                    <Link href={`/admin/projects/${p.id}`} className="text-slate-800 hover:text-brand-600">{p.title}</Link>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{projectStageLabel(pipeline, p, dev.stage)}{owner ? ` · ${owner.name}` : ""}</span>
                      <form action={setProjectContact}>
                        <input type="hidden" name="projectId" value={p.id} />
                        <input type="hidden" name="contactId" value={id} />
                        <button className="text-brand-600">Assign to {contact.name.split(" ")[0]}</button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="card p-4">
          <h2 className="mb-2 text-sm font-semibold">Other contacts at {dev.company} ({otherContacts.length})</h2>
          <ul className="space-y-2">
            {otherContacts.map((c) => (
              <li key={c.id}>
                <Link href={`/admin/developers/contacts/${c.id}`} className="flex items-center gap-2 text-sm hover:text-brand-600">
                  <Avatar name={c.name} initials={initials(c.name)} size="sm" />
                  <span className="min-w-0"><span className="block truncate font-medium">{c.name}</span><span className="block truncate text-xs text-slate-500">{c.title ?? c.email ?? ""}</span></span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={`/admin/developers/${dev.id}#contacts`} className="mt-3 inline-flex items-center gap-1 text-sm text-brand-600"><CrmIcon name="PLUS" /> Add contact</Link>
        </section>
      </aside>
    </div>
  );
}
