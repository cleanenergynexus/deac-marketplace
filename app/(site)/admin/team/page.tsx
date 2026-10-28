import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { addTeamAdmin, removeTeamAdmin } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { TeamMemberForm } from "@/components/TeamMemberForm";
import { Badge, Field, PageHeader, Section } from "@/components/ui";
import { date } from "@/lib/format";
import { STAFF_LEVELS, staffLevel, staffLevelLabel } from "@/lib/tasks";

export const dynamic = "force-dynamic";

const TONE = { ADMIN: "blue", MANAGER: "green", SUPPORT: "slate" } as const;

export default async function Team() {
  const me = await currentUser();
  const isAdmin = staffLevel(me?.staffLevel) === "ADMIN";
  const team = await db.user.findMany({ where: { role: "ADMIN" }, include: { manager: { select: { name: true } }, _count: { select: { reports: true } } }, orderBy: { createdAt: "asc" } });
  const managers = team.filter((u) => staffLevel(u.staffLevel) !== "SUPPORT").map((u) => ({ id: u.id, name: u.name }));
  return (
    <div className="space-y-6">
      <PageHeader title="Team" subtitle="DEAC staff who can sign in to the admin area. The access level decides whose tasks they see and can assign." />
      <div className="grid gap-3 sm:grid-cols-3">
        {STAFF_LEVELS.map((l) => (
          <div key={l.value} className="card p-4 text-sm"><Badge tone={TONE[l.value]}>{l.label}</Badge><p className="mt-2 text-slate-600">{l.help}</p></div>
        ))}
      </div>
      <Section title={`Team members (${team.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">{isAdmin ? "Access level · Reports to" : "Access level"}</th>{!isAdmin && <th className="th">Reports to</th>}<th className="th">Added</th><th className="th"></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {team.map((a) => (
                <tr key={a.id}>
                  <td className="td font-medium">
                    {a.name}{a.id === me?.id && <span className="ml-2 text-xs text-slate-500">(you)</span>}
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
      {isAdmin && (
        <Section title="Add a team member">
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
