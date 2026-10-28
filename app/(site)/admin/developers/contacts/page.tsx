import Link from "next/link";
import { formatPhone } from "@/lib/phone";
import { shortPlace } from "@/lib/address";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { Avatar } from "@/components/CrmIcons";
import { loadCrm } from "@/lib/contacts-db";
import { ago, initials, projectContactId } from "@/lib/crm";
import { projectStageLabel } from "@/lib/pipeline";
import { getPipeline } from "@/lib/pipeline-db";

export const dynamic = "force-dynamic";

export default async function Contacts({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase();
  const [{ developers, lastTouch, openTasks }, pipeline] = await Promise.all([loadCrm(), getPipeline()]);
  const rows = developers.flatMap((d) => d.contacts.map((c) => ({ c, d, projects: d.projects.filter((p) => projectContactId(p, d.contacts) === c.id) })))
    .filter(({ c, d }) => !q || [c.name, c.email, c.title, c.city, d.company].some((x) => x?.toLowerCase().includes(q)))
    .sort((a, b) => (lastTouch.get(b.c.id)?.getTime() ?? 0) - (lastTouch.get(a.c.id)?.getTime() ?? 0) || a.c.name.localeCompare(b.c.name));

  return (
    <div>
      <PageHeader title="Contacts" subtitle={`${rows.length} people at ${developers.length} development companies`} action={
        <div className="flex gap-2">
          <form><input name="q" defaultValue={sp.q} placeholder="Search name, email, company" className="input w-64 py-1.5" /></form>
          <Link href="/admin/developers/contacts/new" className="btn">Add contact</Link>
        </div>} />
      {!rows.length ? <Empty>{q ? "No contacts match." : "No contacts yet."}</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><th className="th">Contact</th><th className="th">Company</th><th className="th">Email / phone</th><th className="th">Projects</th><th className="th">Last touch</th><th className="th">Tasks</th><th className="th">Owner</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ c, d, projects }) => (
                <tr key={c.id}>
                  <td className="td">
                    <Link href={`/admin/developers/contacts/${c.id}`} className="flex items-center gap-2">
                      <Avatar name={c.name} initials={initials(c.name)} size="sm" />
                      <span><span className="block font-medium text-brand-600">{c.name}</span>{c.title && <span className="block text-xs text-slate-500">{c.title}</span>}{shortPlace(c) && <span className="block text-xs text-slate-400">{shortPlace(c)}</span>}</span>
                    </Link>
                  </td>
                  <td className="td"><Link href={`/admin/developers/${d.id}`} className="hover:text-brand-600">{d.company}</Link>{c.isPrimary && <div><Badge tone="blue">Primary</Badge></div>}</td>
                  <td className="td text-xs">{c.email && <a href={`mailto:${c.email}`} className="block text-brand-600">{c.email}</a>}<span className="whitespace-nowrap text-slate-500">{formatPhone(c.phone ?? c.mobile)}</span></td>
                  <td className="td">
                    <ul className="space-y-0.5 text-xs">{projects.map((p) => (
                      <li key={p.id}><Link href={`/admin/projects/${p.id}`} className="text-slate-700 hover:text-brand-600">{p.code}</Link> <span className="text-slate-500">· {projectStageLabel(pipeline, p, d.stage)}</span></li>
                    ))}</ul>
                    {!projects.length && <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="td text-xs text-slate-600">{ago(lastTouch.get(c.id)) ?? "—"}</td>
                  <td className="td">{openTasks.get(c.id) ? <Link href={`/admin/developers/contacts/${c.id}?tab=tasks`}><Badge tone="amber">{openTasks.get(c.id)} open</Badge></Link> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="td text-xs text-slate-600">{c.owner ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
