import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { addTeamAdmin, removeTeamAdmin } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { TeamMemberForm } from "@/components/TeamMemberForm";
import { Badge, Field, PageHeader, Section } from "@/components/ui";
import { date } from "@/lib/format";
import { STAFF_LEVELS, staffLevel, staffLevelLabel } from "@/lib/tasks";
import { SupportInboxPanel } from "@/components/SupportInboxPanel";
import { gmailSetupMissing } from "@/lib/gmail-db";
import { getSupportMember } from "@/lib/support-db";

export const dynamic = "force-dynamic";
// Linking the support Gmail or "Check now" can read a lot of mail.
export const maxDuration = 300;

const NOTICE: Record<string, { tone: "ok" | "error"; text: string }> = {
  linked: { tone: "ok", text: "Support Gmail linked. New emails to it become tasks." },
  denied: { tone: "error", text: "Gmail wasn't linked: the Google screen was cancelled." },
  expired: { tone: "error", text: "That Google sign-in took too long or came from another browser. Try again." },
  scopes: { tone: "error", text: "Gmail is linked, but Google didn't grant every permission. Link again and leave both Gmail boxes ticked." },
  setup: { tone: "error", text: "Gmail linking isn't set up on the server yet." },
  error: { tone: "error", text: "Gmail wasn't linked." },
};

const TONE = { ADMIN: "blue", MANAGER: "green", SUPPORT: "slate" } as const;

export default async function Team({ searchParams }: { searchParams: Promise<{ gmail?: string; msg?: string }> }) {
  const me = await currentUser();
  const { gmail, msg } = await searchParams;
  const notice = gmail ? NOTICE[gmail] : null;
  const isAdmin = staffLevel(me?.staffLevel) === "ADMIN";
  const [team, support] = await Promise.all([
    db.user.findMany({ where: { role: "ADMIN" }, include: { manager: { select: { name: true } }, _count: { select: { reports: true } } }, orderBy: { createdAt: "asc" } }),
    getSupportMember(),
  ]);
  const openSupport = support ? await db.activity.count({ where: { kind: "TASK", assigneeId: support.id, doneAt: null, supportEmails: { some: {} } } }) : 0;
  const managers = team.filter((u) => staffLevel(u.staffLevel) !== "SUPPORT").map((u) => ({ id: u.id, name: u.name }));
  return (
    <div className="space-y-6">
      <PageHeader title="Team" subtitle="DEAC staff who can sign in to the admin area. The access level decides whose tasks they see and can assign." />
      <div className="grid gap-3 sm:grid-cols-3">
        {STAFF_LEVELS.map((l) => (
          <div key={l.value} className="card p-4 text-sm"><Badge tone={TONE[l.value]}>{l.label}</Badge><p className="mt-2 text-slate-600">{l.help}</p></div>
        ))}
      </div>
      <Section title={`Team Members (${team.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">{isAdmin ? "Access level · Reports to" : "Access level"}</th>{!isAdmin && <th className="th">Reports to</th>}<th className="th">Added</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {team.map((a) => (
                <tr key={a.id}>
                  <td className="td font-medium">
                    {a.name}{a.id === me?.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}
                    {a.id === support?.id && <span className="ml-2"><Badge tone="amber">Technical Support</Badge></span>}
                    {a._count.reports > 0 && <div className="text-xs font-normal text-slate-500">{a._count.reports} report{a._count.reports === 1 ? "" : "s"}</div>}
                  </td>
                  <td className="td">{a.email}</td>
                  {isAdmin ? (
                    <td className="td"><TeamMemberForm id={a.id} staffLevel={staffLevel(a.staffLevel)} managerId={a.managerId} managers={managers} /></td>
                  ) : (
                    <>
                      <td className="td"><Badge tone={TONE[staffLevel(a.staffLevel)]}>{staffLevelLabel(a.staffLevel)}</Badge></td>
                      <td className="td">{a.manager?.name ?? "—"}</td>
                    </>
                  )}
                  <td className="td text-xs">{date(a.createdAt)}</td>
                  <td className="td text-right">
                    {isAdmin && a.id !== me?.id && (
                      <form action={removeTeamAdmin}>
                        <input type="hidden" name="id" value={a.id} />
                        <ConfirmButton message={`Remove ${a.name}? Their open tasks become unassigned.`} className="btn-danger">Remove</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Technical Support">
        {notice && <p className={`mb-4 rounded p-3 text-sm ${notice.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>{notice.text}{gmail === "error" && msg ? ` ${msg}` : ""}</p>}
        <SupportInboxPanel
          team={team.map((u) => ({ id: u.id, name: u.name, email: u.email }))}
          member={support && { id: support.id, name: support.name, email: support.email, since: support.supportSince }}
          gmail={support?.gmail ? { email: support.gmail.email, supportSyncAt: support.gmail.supportSyncAt, supportError: support.gmail.supportError } : null}
          openTasks={openSupport}
          setupMissing={gmailSetupMissing()}
          canEdit={isAdmin}
        />
      </Section>
      {isAdmin && (
        <Section title="Add a Team Member">
          <ActionForm action={addTeamAdmin} submitLabel="Add team member" success="Team member added. Share the temporary password with them privately; they can change it under My account." className="grid gap-4 sm:grid-cols-3">
            <Field label="Name"><input name="name" required className="input" /></Field>
            <Field label="Email"><input name="email" type="email" required className="input" /></Field>
            <Field label="Temporary password (10+ characters)"><input name="password" type="text" minLength={10} required className="input" autoComplete="off" /></Field>
            <Field label="Access level">
              <select name="staffLevel" defaultValue="SUPPORT" className="input">{STAFF_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
            </Field>
            <Field label="Reports to">
              <select name="managerId" defaultValue="" className="input"><option value="">No manager</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            </Field>
          </ActionForm>
        </Section>
      )}
    </div>
  );
}
