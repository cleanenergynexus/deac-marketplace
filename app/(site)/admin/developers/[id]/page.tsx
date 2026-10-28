import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { addTeamMember, deleteTeamMember, setDeveloperStage, updateDeveloper } from "@/app/actions/admin";
import { DeveloperForm } from "@/components/DeveloperForm";
import { ActivityFeed } from "@/components/ActivityFeed";
import { ContactForm } from "@/components/ContactForm";
import { Avatar } from "@/components/CrmIcons";
import { ProjectContactSelect } from "@/components/ProjectContactSelect";
import { createContact } from "@/app/actions/contacts";
import { ensureContacts } from "@/lib/contacts-db";
import { ago, initials, projectContactId } from "@/lib/crm";
import { Badge, Field, PageHeader, Section, statusTone } from "@/components/ui";
import { StageSelect } from "@/components/StageSelect";
import { allStages, funnelStages, projectStage } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";
import { usd } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { addressLines, hasAddress, mapsHref, shortPlace } from "@/lib/address";
import { recommendation } from "@/lib/valuation";
import { getScoring } from "@/lib/scoring-db";

export const dynamic = "force-dynamic";

export default async function DeveloperDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureContacts(id);
  const dev = await db.developer.findUnique({ where: { id }, include: {
    team: { orderBy: { sortOrder: "asc" } },
    projects: true,
    contacts: { orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
    activities: { orderBy: { createdAt: "desc" }, take: 50, include: { contact: { select: { id: true, name: true } }, project: { select: { id: true, code: true, title: true } } } },
  } });
  if (!dev) notFound();
  const [scoring, pipeline] = await Promise.all([getScoring(), getPipeline()]);
  const lastTouch = new Map((await db.activity.groupBy({ by: ["contactId"], where: { developerId: id, contactId: { not: null }, kind: { in: ["NOTE", "EMAIL", "CALL", "MEETING", "TASK"] } }, _max: { createdAt: true } })).map((t) => [t.contactId!, t._max.createdAt]));
  return (
    <div className="space-y-6">
      <Link href="/admin/developers" className="text-sm text-brand-600">← Developer CRM</Link>
      <PageHeader title={dev.company} subtitle={[shortPlace(dev) || dev.hq, dev.website?.replace(/^https?:\/\//, ""), `${dev.contacts.length} contact${dev.contacts.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")} action={
        // With projects, each project carries its own stage (see the Projects table). Until then the developer has one.
        dev.projects.length ? undefined : (
        <form action={setDeveloperStage} className="flex items-center gap-2">
          <input type="hidden" name="id" value={dev.id} />
          <select name="stage" defaultValue={dev.stage} className="input w-48">{allStages(pipeline).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <button className="btn">Update stage</button>
        </form>)} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <section id="contacts" className="card p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Contacts</h2></div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {dev.contacts.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/developers/contacts/${c.id}`} className="flex gap-3 rounded-lg border border-slate-200 p-3 hover:border-brand-500">
                    <Avatar name={c.name} initials={initials(c.name)} />
                    <span className="min-w-0 text-sm">
                      <span className="flex items-center gap-2 font-semibold text-slate-900">{c.name}{c.isPrimary && <Badge tone="blue">Primary</Badge>}</span>
                      {c.title && <span className="block text-xs text-slate-500">{c.title}</span>}
                      <span className="block truncate text-xs text-slate-500">{[c.email, formatPhone(c.phone ?? c.mobile)].filter(Boolean).join(" · ")}</span>
                      <span className="block text-xs text-slate-400">{lastTouch.get(c.id) ? `Last touch ${ago(lastTouch.get(c.id))}` : "No touchpoints yet"}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-brand-600">+ Add a contact at {dev.company}</summary>
              <div className="mt-3"><ContactForm developerId={dev.id} action={createContact} country={dev.country} /></div>
            </details>
          </section>
          <Section title="Projects" action={<Link href={`/admin/projects/new?developerId=${dev.id}`} className="btn-ghost">Add a project</Link>}>
            {!dev.projects.length ? <p className="text-sm text-slate-500">No projects yet. Add one by entering the details or importing a teaser or offering memo.</p> : (
            <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Code</th><th className="th">Project</th><th className="th">Contact</th><th className="th">CRM stage</th><th className="th">MW</th><th className="th">Raise</th><th className="th">Score</th><th className="th">Visibility</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{dev.projects.map((p) => (
                <tr key={p.id}><td className="td whitespace-nowrap font-mono text-xs">{p.code}</td><td className="td min-w-48"><Link href={`/admin/projects/${p.id}`} className="text-brand-600">{p.title}</Link></td><td className="td"><ProjectContactSelect projectId={p.id} contactId={projectContactId(p, dev.contacts)} contacts={dev.contacts} className="min-w-36" /></td><td className="td"><StageSelect projectId={p.id} stage={projectStage(pipeline, p, dev.stage)} stages={funnelStages(pipeline, p.dealType)} className="min-w-36" /></td><td className="td">{p.mw}</td><td className="td">{usd(p.fundingNeeded)}</td>
                  <td className="td">{p.valueScore != null ? <Badge tone={recommendation(p.valueScore, scoring).tone}>{p.valueScore} · {recommendation(p.valueScore, scoring).label}</Badge> : <Link href={`/admin/projects/${p.id}#valuation`} className="text-xs text-brand-600">Score it</Link>}</td>
                  <td className="td"><Badge tone={statusTone(p.visibility)}>{p.visibility}</Badge></td></tr>
              ))}</tbody></table></div>)}
          </Section>
          <Section title="Company profile">
            {hasAddress(dev) && (
              <a href={mapsHref(dev)} target="_blank" rel="noreferrer" className="mb-4 block text-sm text-slate-700 hover:text-brand-600">
                {addressLines(dev).map((l) => <span key={l} className="block">{l}</span>)}
              </a>
            )}
            <DeveloperForm dev={dev} action={updateDeveloper} />
          </Section>
          <Section title="Team & bios (shown on listings)">
            <div className="grid gap-3 sm:grid-cols-2">
              {dev.team.map((m) => (
                <div key={m.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <div className="flex justify-between"><b>{m.name}</b><form action={deleteTeamMember}><input type="hidden" name="id" value={m.id} /><button className="text-xs text-red-600">Remove</button></form></div>
                  <div className="text-xs text-slate-500">{m.title}</div><p className="mt-2 text-slate-600">{m.bio}</p>
                </div>
              ))}
            </div>
            <form action={addTeamMember} className="mt-4 grid gap-3 sm:grid-cols-2">
              <input type="hidden" name="developerId" value={dev.id} />
              <Field label="Name"><input name="name" required className="input" /></Field>
              <Field label="Title"><input name="title" required className="input" /></Field>
              <Field label="Bio" className="sm:col-span-2"><textarea name="bio" rows={2} required className="input" /></Field>
              <div><button className="btn-ghost">Add team member</button></div>
            </form>
          </Section>
        </div>
        <Section title="Activity">
          <p className="mb-3 text-xs text-slate-500">Everything logged with {dev.company}&apos;s contacts. Open a contact to log a note, email, call, meeting or task.</p>
          <ActivityFeed items={dev.activities} showContact />
        </Section>
      </div>
    </div>
  );
}
