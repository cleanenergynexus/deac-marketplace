import Link from "next/link";
import { SignatureList } from "@/components/SignatureList";
import { ActivityFeed } from "@/components/ActivityFeed";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { addAgent, removeAgent, viewAsAgent } from "@/app/actions/agents-admin";
import { ActionForm } from "@/components/ActionForm";
import { AgentEditForm } from "@/components/AgentEditForm";
import { AgentLoginEmailButton } from "@/components/AgentLoginEmailButton";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PhoneInput } from "@/components/PhoneInput";
import { Badge, Empty, Field, PageHeader, Section } from "@/components/ui";
import { agentStatusLabel } from "@/lib/agents";
import { formatPhone } from "@/lib/phone";
import { date } from "@/lib/format";
import { staffLevel } from "@/lib/tasks";

export const dynamic = "force-dynamic";

/** Referral agents: outside partners who see only the contacts they referred. Admins add them and assign their DEAC partner. */
export default async function Agents() {
  const me = await requireAdmin();
  const isAdmin = staffLevel(me.staffLevel) === "ADMIN";
  const [agents, partners, applications] = await Promise.all([
    db.user.findMany({
      where: { role: "AGENT" },
      include: {
        partner: { select: { name: true } },
        agentActivities: { where: { kind: "EMAIL" }, orderBy: { createdAt: "desc" }, take: 20 },
        _count: { select: { referredDevelopers: true, referredContacts: true, referredInvestors: true, agentActivities: { where: { kind: "EMAIL" } } } },
      },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.agentApplication.count({ where: { status: "PENDING" } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Referral Agents" subtitle="Outside agents who bring developers and investors to DEAC. Each agent signs in to their own portal and sees only the contacts they referred, with the activity on them." />
      {applications > 0 && (
        <Link href="/admin/access" className="flex items-center justify-between rounded-lg bg-amber-50 p-4 text-sm text-amber-900 hover:bg-amber-100">
          <span><b>{applications}</b> referral agent application{applications === 1 ? "" : "s"} from the website to review</span>
          <span className="font-semibold">Review →</span>
        </Link>
      )}
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <div className="card p-4"><b>Sees</b><p className="mt-1 text-slate-600">Only the contacts marked &quot;Referred by&quot; them (and, for a developer company they referred, its contacts and projects), plus the activity logged on them. On listings they brought in: the CRM stage, investor pipeline, activity, tasks and the whole data room.</p></div>
        <div className="card p-4"><b>Can do</b><p className="mt-1 text-slate-600">Refer new contacts, import a listing (saved as a draft for review), request meetings. On listings they brought in: edit the details (logged for you), add tasks for themselves or the team, open, download and upload data room files, and message the team.</p></div>
        <div className="card p-4"><b>Can&apos;t do</b><p className="mt-1 text-slate-600">See other contacts or listings, change a listing&apos;s deal type, stage, visibility or investor documents, or change anything else in the CRM.</p></div>
      </div>
      <Section title={`Agents (${agents.length})`}>
        {agents.length ? (
          <ul className="divide-y divide-slate-100">
            {agents.map((a) => (
              <li key={a.id} className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                <div className="text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{a.name}</span>
                    <Badge tone={a.status === "APPROVED" ? "green" : "red"}>{agentStatusLabel(a.status)}</Badge>
                  </div>
                  <div className="text-slate-600">{[a.company, a.email, a.phone ? formatPhone(a.phone) : null].filter(Boolean).join(" · ")}</div>
                  <div className="mt-1 text-slate-600">Partner: <b>{a.partner?.name ?? "not assigned"}</b></div>
                  <div className="mt-1 text-xs text-slate-500">
                    Referred {a._count.referredDevelopers} compan{a._count.referredDevelopers === 1 ? "y" : "ies"}, {a._count.referredContacts} developer contact{a._count.referredContacts === 1 ? "" : "s"}, {a._count.referredInvestors} investor{a._count.referredInvestors === 1 ? "" : "s"} · Added {date(a.createdAt)}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <form action={viewAsAgent} className="mt-3">
                      <input type="hidden" name="id" value={a.id} />
                      <button className="btn-ghost py-1.5">View as agent</button>
                    </form>
                    {isAdmin && a.status === "APPROVED" && <AgentLoginEmailButton id={a.id} name={a.name} />}
                  </div>
                  {a.inviteTokenHash && a.inviteExpiresAt && a.inviteExpiresAt > new Date() && <div className="mt-1 text-xs text-slate-500">Login email sent; set-password link open until {date(a.inviteExpiresAt)}.</div>}
                  <details className="mt-3 rounded-md border border-slate-200 p-2" id={`signatures-${a.id}`}>
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">NDAs &amp; Agreements</summary>
                    <div className="mt-2"><SignatureList signer={`AGENT:${a.id}`} /></div>
                  </details>
                  <details className="mt-3 rounded-md border border-slate-200 p-2" id={`emails-${a.id}`}>
                    <summary className="cursor-pointer text-xs font-semibold text-slate-700">Emails ({a._count.agentActivities})</summary>
                    <div className="mt-2">
                      <ActivityFeed items={a.agentActivities} empty={`No emails with ${a.name} yet. Emails from a linked Gmail (My account) show here.`} />
                    </div>
                  </details>
                  {isAdmin && (
                    <form action={removeAgent} className="mt-2">
                      <input type="hidden" name="id" value={a.id} />
                      <ConfirmButton message={`Remove ${a.name}'s login? The contacts they referred stay in the CRM.`} className="text-xs text-red-600">Remove agent</ConfirmButton>
                    </form>
                  )}
                </div>
                {isAdmin ? <AgentEditForm id={a.id} partnerId={a.partnerId} status={a.status} company={a.company} phone={a.phone} partners={partners} /> : <p className="text-xs text-slate-500">Only Admins can change agents.</p>}
              </li>
            ))}
          </ul>
        ) : <Empty>No referral agents yet.</Empty>}
      </Section>
      {isAdmin && (
        <Section title="Add a Referral Agent">
          <ActionForm action={addAgent} submitLabel="Add agent" success="Agent added. We emailed them the Referral Agent Login email with a link to set their own password. The temporary password also works; share it privately if they need it." className="grid gap-4 sm:grid-cols-3">
            <Field label="Name"><input name="name" required className="input" /></Field>
            <Field label="Email"><input name="email" type="email" required className="input" /></Field>
            <Field label="Temporary password (10+ characters)"><input name="password" type="text" minLength={10} required className="input" autoComplete="off" /></Field>
            <Field label="Company"><input name="company" className="input" /></Field>
            <Field label="Phone"><PhoneInput name="phone" /></Field>
            <Field label="DEAC partner">
              <select name="partnerId" defaultValue={me.id} className="input"><option value="">No partner yet</option>{partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </Field>
          </ActionForm>
        </Section>
      )}
      <p className="text-sm text-slate-500">To give an agent an existing contact, open the contact (or developer company) and set <b>Referred by agent</b>. Partners can add a phone number and meeting booking link under <Link href="/admin/account" className="text-brand-600">My account</Link>; agents see them on their portal.</p>
    </div>
  );
}
