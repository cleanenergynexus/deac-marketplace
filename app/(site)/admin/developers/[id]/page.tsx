import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { addTeamMember, deleteTeamMember, setDeveloperStage, updateDeveloper } from "@/app/actions/admin";
import { DeveloperForm } from "@/components/DeveloperForm";
import { Timeline } from "@/components/Timeline";
import { Badge, Field, PageHeader, Section, statusTone } from "@/components/ui";
import { StageSelect } from "@/components/StageSelect";
import { DEVELOPER_STAGES, projectPipelineStage } from "@/lib/constants";
import { usd } from "@/lib/format";
import { recommendation } from "@/lib/valuation";

export const dynamic = "force-dynamic";

export default async function DeveloperDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dev = await db.developer.findUnique({ where: { id }, include: { team: { orderBy: { sortOrder: "asc" } }, projects: true, activities: { orderBy: { createdAt: "desc" } } } });
  if (!dev) notFound();
  return (
    <div className="space-y-6">
      <Link href="/admin/developers" className="text-sm text-brand-600">← Developer CRM</Link>
      <PageHeader title={dev.company} subtitle={`${dev.contactName} · ${dev.email}`} action={
        // With projects, each project carries its own stage (see the Projects table). Until then the developer has one.
        dev.projects.length ? undefined : (
        <form action={setDeveloperStage} className="flex items-center gap-2">
          <input type="hidden" name="id" value={dev.id} />
          <select name="stage" defaultValue={dev.stage} className="input w-48">{DEVELOPER_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <button className="btn">Update stage</button>
        </form>)} />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Section title="Projects" action={<Link href={`/admin/projects/new?developerId=${dev.id}`} className="btn-ghost">Add a project</Link>}>
            {!dev.projects.length ? <p className="text-sm text-slate-500">No projects yet. Add one by entering the details or importing a teaser or offering memo.</p> : (
            <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className="th">Code</th><th className="th">Project</th><th className="th">CRM stage</th><th className="th">MW</th><th className="th">Raise</th><th className="th">Score</th><th className="th">Visibility</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{dev.projects.map((p) => (
                <tr key={p.id}><td className="td font-mono text-xs">{p.code}</td><td className="td"><Link href={`/admin/projects/${p.id}`} className="text-brand-600">{p.title}</Link></td><td className="td"><StageSelect projectId={p.id} stage={projectPipelineStage(p, dev.stage)} className="w-40" /></td><td className="td">{p.mw}</td><td className="td">{usd(p.fundingNeeded)}</td>
                  <td className="td">{p.valueScore != null ? <Badge tone={recommendation(p.valueScore).tone}>{p.valueScore} · {recommendation(p.valueScore).label}</Badge> : <Link href={`/admin/projects/${p.id}#valuation`} className="text-xs text-brand-600">Score it</Link>}</td>
                  <td className="td"><Badge tone={statusTone(p.visibility)}>{p.visibility}</Badge></td></tr>
              ))}</tbody></table></div>)}
          </Section>
          <Section title="Company profile"><DeveloperForm dev={dev} action={updateDeveloper} /></Section>
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
        <Section title="Activity"><Timeline items={dev.activities} developerId={dev.id} /></Section>
      </div>
    </div>
  );
}
