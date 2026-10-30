import Link from "next/link";
import { placeShort } from "@/lib/location";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { setInvestorStage, updateInvestor } from "@/app/actions/admin";
import { addInterest, removeInterest } from "@/app/actions/investors";
import { ActivityComposer } from "@/components/ActivityComposer";
import { ActivityFeed } from "@/components/ActivityFeed";
import { Avatar, CrmIcon } from "@/components/CrmIcons";
import { ConfirmButton } from "@/components/ConfirmButton";
import { InvestorForm } from "@/components/InvestorForm";
import { InvitePanel } from "@/components/InvitePanel";
import { cancelInvite } from "@/app/actions/invites";
import { loginState } from "@/lib/invites";
import { StageSelect } from "@/components/StageSelect";
import { Badge, statusTone } from "@/components/ui";
import { INVESTOR_STAGES, stageLabel } from "@/lib/constants";
import { CONTACT_TABS, contactTab, initials } from "@/lib/crm";
import { fitsMandate, memberTone } from "@/lib/investor-crm";
import { ensureFirms, ensureInterests } from "@/lib/investor-crm-db";
import { funnelStages, placeStage } from "@/lib/pipeline";
import { getInvestorPipeline } from "@/lib/pipeline-db";
import { num, usd } from "@/lib/format";
import { formatPhone, telHref } from "@/lib/phone";
import { addressLines, hasAddress, mapsHref, shortPlace } from "@/lib/address";
import { marketSummary } from "@/lib/regions";
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

const EMAIL_ERRORS: Record<string, string> = {
  invalid: "That email address doesn't look right.",
  crm: "Another Investor CRM contact already uses that email.",
  login: "That email already belongs to another login (team, referral agent or another investor).",
};

const STEP_TONE = { PENDING: "amber", APPROVED: "green", DECLINED: "red" } as const;

/** Investor contact record, same layout as a Developer CRM contact: details left, communications middle, company and listings right. */
export default async function InvestorRecord({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; emailError?: string }> }) {
  const { id } = await params;
  const { tab: rawTab, emailError } = await searchParams;
  const profile = rawTab === "profile";
  const tab = contactTab(rawTab);
  await ensureFirms();
  await ensureInterests();
  const inv = await db.investor.findUnique({
    where: { id },
    include: {
      user: true,
      referredBy: { select: { name: true } },
      company: { include: { investors: { where: { id: { not: id } }, orderBy: { name: "asc" }, select: { id: true, name: true, title: true, email: true } } } },
      interests: { include: { project: { select: { id: true, code: true, title: true, mw: true, dealType: true, country: true, state: true, visibility: true } } }, orderBy: { createdAt: "asc" } },
      lois: { select: { projectId: true, status: true, amount: true } },
      dealSteps: { select: { projectId: true, step: true, status: true } },
      analysisRequests: { include: { project: { select: { code: true } } } },
    },
  });
  if (!inv) notFound();
  const [pipeline, me, team, listings, firms, agents] = await Promise.all([
    getInvestorPipeline(), requireAdmin(), getTeam(),
    db.project.findMany({ select: { id: true, code: true, title: true, mw: true, country: true, state: true, dealType: true, facilityType: true, visibility: true }, orderBy: { code: "asc" } }),
    db.investorFirm.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    getAgents(),
  ]);
  const assignees = visibleStaff(me, team).map((u) => ({ id: u.id, name: u.name }));
  const allowUnassigned = staffLevel(me.staffLevel) === "ADMIN";

  const all = await db.activity.findMany({
    where: { AND: [{ investorId: id }, visibleTimelineWhere(me, team)] },
    include: { project: { select: { id: true, code: true, title: true } }, assignee: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const count = (kinds: readonly string[] | null) => (kinds ? all.filter((a) => kinds.includes(a.kind)).length : all.length);
  let items = tab.kinds ? all.filter((a) => (tab.kinds as readonly string[]).includes(a.kind)) : all;
  if (tab.value === "tasks") items = [...items].sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  const openTasks = all.filter((a) => a.kind === "TASK" && !a.doneAt).length;

  const linked = new Set(inv.interests.map((it) => it.projectId));
  const notLinked = listings.filter((p) => !linked.has(p.id));
  const fits = notLinked.filter((p) => p.visibility !== "DRAFT" && fitsMandate(inv, p));
  const firstName = inv.name.split(" ")[0];
  const login = loginState(inv.user);
  const steps = (projectId: string) => [
    ...inv.dealSteps.filter((d) => d.projectId === projectId && d.step === "NDA").map((d) => ({ label: "NDA", status: d.status })),
    ...inv.lois.filter((l) => l.projectId === projectId).map((l) => ({ label: `LOI${l.amount ? ` ${usd(l.amount)}` : ""}`, status: l.status })),
    ...inv.dealSteps.filter((d) => d.projectId === projectId && d.step === "DILIGENCE").map((d) => ({ label: "Diligence", status: d.status })),
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_270px]">
      {/* Left: who they are */}
      <aside className="space-y-4">
        <Link href="/admin/investors/contacts" className="text-sm text-brand-600">← Contacts</Link>
        <div className="card p-5 text-center">
          <Avatar name={inv.name} initials={initials(inv.name)} size="lg" />
          <h1 className="mt-3 text-xl font-bold">{inv.name}</h1>
          {inv.title && <div className="text-sm text-slate-600">{inv.title}</div>}
          {inv.company ? <Link href={`/admin/investors/companies/${inv.company.id}`} className="text-sm text-brand-600">{inv.company.name}</Link> : <Link href={`?tab=profile`} className="text-sm text-slate-500 hover:text-brand-600">Add a company</Link>}
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Badge tone={memberTone(inv.stage)}>{stageLabel(INVESTOR_STAGES, inv.stage)}</Badge>
            {inv.referredBy && <Badge tone="purple">Referred by {inv.referredBy.name}</Badge>}
            {openTasks > 0 && <Badge tone="amber">{openTasks} open task{openTasks === 1 ? "" : "s"}</Badge>}
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
            <a href={`mailto:${inv.email}`} className="block truncate text-brand-600">{inv.email}</a>
            {inv.phone && <a href={telHref(inv.phone)} className="block text-slate-700">{formatPhone(inv.phone)}</a>}
            {inv.mobile && <a href={telHref(inv.mobile)} className="block text-slate-700">{formatPhone(inv.mobile)} <span className="text-xs text-slate-400">mobile</span></a>}
            {hasAddress(inv) && (
              <a href={mapsHref(inv)} target="_blank" rel="noreferrer" className="block pt-1 text-slate-600 hover:text-brand-600">
                {addressLines(inv).map((l) => <span key={l} className="block">{l}</span>)}
              </a>
            )}
            {inv.linkedin && <a href={inv.linkedin.startsWith("http") ? inv.linkedin : `https://${inv.linkedin}`} target="_blank" rel="noreferrer" className="block truncate text-brand-600">LinkedIn</a>}
          </div>
        </div>
        <section className="card space-y-2 p-4 text-sm">
          <h2 className="font-semibold">Mandate</h2>
          <dl className="space-y-1 text-xs">
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Type</dt><dd className="text-right">{inv.investorType ?? "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Check size</dt><dd className="text-right">{inv.checkMin || inv.checkMax ? `${usd(inv.checkMin)}–${usd(inv.checkMax)}` : "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Size</dt><dd className="text-right">{inv.mwMin != null && inv.mwMax != null ? `${num(inv.mwMin)}–${num(inv.mwMax)} MW` : inv.mwMin != null ? `${num(inv.mwMin)}+ MW` : inv.mwMax != null ? `Up to ${num(inv.mwMax)} MW` : "Any"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-slate-500">Markets</dt><dd className="text-right">{marketSummary(inv.preferredStates, inv.preferredRegions)}</dd></div>
          </dl>
          <Link href="?tab=profile" className="text-xs text-brand-600">Edit profile & mandate</Link>
        </section>
        <section className="card p-4 text-sm">
          <h2 className="mb-2 font-semibold">Membership</h2>
          <p className="mb-2 text-xs text-slate-500">Marketplace login: {login === "INVITED" ? <Badge tone="blue">Invite sent</Badge> : login === "INVITE_EXPIRED" ? <Badge tone="amber">Invite expired</Badge> : inv.user ? <Badge tone={statusTone(inv.user.status)}>{inv.user.status}</Badge> : "none"}</p>
          {(login === "NONE" || login === "INVITED" || login === "INVITE_EXPIRED") && (
            <div className="mb-3 space-y-1">
              {login === "NONE" && <p className="text-xs text-slate-500">Invite {firstName} directly. They skip Access Requests and are approved straight away.</p>}
              <InvitePanel investorId={inv.id} label={login === "NONE" ? "Invite to marketplace" : "Create a new invite link"} />
              {login !== "NONE" && (
                <form action={cancelInvite} className="text-right">
                  <input type="hidden" name="investorId" value={inv.id} />
                  <ConfirmButton message={`Cancel ${inv.name}'s invite? The link stops working.`} className="text-[11px] text-slate-400 hover:text-red-600">Cancel invite</ConfirmButton>
                </form>
              )}
            </div>
          )}
          <form action={setInvestorStage} className="flex gap-2">
            <input type="hidden" name="id" value={inv.id} />
            <select key={inv.stage} name="stage" defaultValue={inv.stage} aria-label="Membership stage" className="input py-1 text-sm">{INVESTOR_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            <button className="btn-ghost px-2 py-1">Save</button>
          </form>
        </section>
      </aside>

      {/* Middle: communications (or the full profile) */}
      <main className="min-w-0 space-y-4">
        {inv.stage === "APPLIED" && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
            <span>{firstName} applied for membership. Approving grants access to the private portfolio.</span>
            <span className="flex gap-2">
              <form action={setInvestorStage}><input type="hidden" name="id" value={inv.id} /><input type="hidden" name="stage" value="APPROVED" /><button className="btn">Approve</button></form>
              <form action={setInvestorStage}><input type="hidden" name="id" value={inv.id} /><input type="hidden" name="stage" value="DECLINED" /><button className="btn-danger">Decline</button></form>
            </span>
          </div>
        )}
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
          {CONTACT_TABS.map((t) => (
            <Link key={t.value} href={`?tab=${t.value}`} className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${!profile && t.value === tab.value ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
              {t.label} <span className="text-xs text-slate-400">{count(t.kinds)}</span>
            </Link>
          ))}
          <Link href="?tab=profile" className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${profile ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800"}`}>Profile</Link>
        </nav>
        {profile ? (
          <div className="card p-5">
            {emailError && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{EMAIL_ERRORS[emailError] ?? EMAIL_ERRORS.invalid} Nothing was saved.</p>}
            {(login === "INVITED" || login === "INVITE_EXPIRED") && <p className="mb-4 rounded bg-amber-50 p-3 text-sm text-amber-900">{firstName} has an unused invite. If you correct the email, create a new invite link afterwards and send it to the new address.</p>}
            <InvestorForm inv={inv} action={updateInvestor} firms={firms.map((f) => f.name)} agents={agents} /></div>
        ) : (
          <>
            <ActivityComposer key={tab.value} investor about="listing" contactId={id} contactEmail={inv.email} initialKind={tab.log}
              projects={[...inv.interests.map((it) => it.project), ...notLinked].map((p) => ({ id: p.id, label: `${p.code} · ${p.title}` }))}
              assignees={assignees} me={me.id} allowUnassigned={allowUnassigned} />
            <ActivityFeed items={items} assigning={{ options: assignees, allowUnassigned }} empty={tab.value === "activity" ? `Nothing logged with ${inv.name} yet. Log a note, email, call, meeting or task above.` : `No ${tab.label.toLowerCase()} yet.`} />
          </>
        )}
      </main>

      {/* Right: associations */}
      <aside className="space-y-4 lg:col-start-2 xl:col-start-auto">
        <section className="card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CrmIcon name="COMPANY" /> Company</h2>
          {inv.company ? (
            <Link href={`/admin/investors/companies/${inv.company.id}`} className="block rounded-lg border border-slate-200 p-3 hover:border-brand-500">
              <div className="font-semibold text-brand-700">{inv.company.name}</div>
              {inv.company.website && <div className="truncate text-xs text-slate-500">{inv.company.website.replace(/^https?:\/\//, "")}</div>}
              <div className="mt-1 text-xs text-slate-500">{[inv.company.investorType, shortPlace(inv.company), `${inv.company.investors.length + 1} contact${inv.company.investors.length ? "s" : ""}`].filter(Boolean).join(" · ")}</div>
            </Link>
          ) : <p className="text-sm text-slate-500">No company on file. <Link href="?tab=profile" className="text-brand-600">Add one</Link></p>}
        </section>

        <section className="card p-4" id="listings">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CrmIcon name="PROJECT" /> {firstName}&apos;s listings ({inv.interests.length})</h2>
          {!inv.interests.length && <p className="text-sm text-slate-500">Not on a listing yet. Add the listings {firstName} is interested in below.</p>}
          <ul className="space-y-3">
            {inv.interests.map((it) => {
              const st = funnelStages(pipeline, it.project.dealType);
              return (
                <li key={it.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <Link href={`/admin/investors?listing=${it.projectId}`} className="font-medium text-slate-900 hover:text-brand-600" title="Show this listing's investors">{it.project.title}</Link>
                  <div className="mt-0.5 flex items-center justify-between gap-1 text-xs text-slate-500">
                    <span className="font-mono">{it.project.code} · {num(it.project.mw)} MW</span>
                    <Link href={`/admin/projects/${it.projectId}`} className="text-brand-600">Listing</Link>
                  </div>
                  {steps(it.projectId).length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">{steps(it.projectId).map((s) => <Badge key={s.label} tone={STEP_TONE[s.status as keyof typeof STEP_TONE] ?? "slate"}>{s.label} {s.status.toLowerCase()}</Badge>)}</div>
                  )}
                  <div className="mt-2"><StageSelect interestId={it.id} stage={placeStage(st, it.stage)} stages={st} className="w-full" /></div>
                  <form action={removeInterest} className="mt-1 text-right">
                    <input type="hidden" name="id" value={it.id} />
                    <ConfirmButton message={`Take ${inv.name} off ${it.project.code}? Their NDA and LOI history stays.`} className="text-[11px] text-slate-400 hover:text-red-600">Remove from listing</ConfirmButton>
                  </form>
                </li>
              );
            })}
          </ul>
          {notLinked.length > 0 && (
            <form action={addInterest} className="mt-3 space-y-2 border-t border-slate-100 pt-3">
              <input type="hidden" name="investorId" value={inv.id} />
              <select name="projectId" required defaultValue="" aria-label="Listing" className="input py-1.5 text-sm">
                <option value="" disabled>Add to a listing…</option>
                {notLinked.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.title}{fits.includes(p) ? " ✓" : ""}</option>)}
              </select>
              <button className="btn-ghost w-full">Add to listing</button>
            </form>
          )}
        </section>

        {fits.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Fits {firstName}&apos;s mandate ({fits.length})</h2>
            <ul className="divide-y divide-slate-100 text-sm">
              {fits.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                  <span className="min-w-0"><Link href={`/admin/projects/${p.id}`} className="block truncate text-slate-800 hover:text-brand-600">{p.title}</Link><span className="font-mono text-xs text-slate-500">{p.code} · {num(p.mw)} MW · {placeShort(p)}</span></span>
                  <form action={addInterest}>
                    <input type="hidden" name="investorId" value={inv.id} />
                    <input type="hidden" name="projectId" value={p.id} />
                    <button className="whitespace-nowrap text-xs font-medium text-brand-600" aria-label={`Add ${inv.name} to ${p.code}`}>+ Add</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        {inv.analysisRequests.length > 0 && (
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Intake requests</h2>
            <ul className="space-y-2 text-sm">{inv.analysisRequests.map((r) => <li key={r.id} className="flex justify-between"><span>{r.project.code} · {r.format ?? "—"}</span><Badge tone={statusTone(r.status)}>{r.status}</Badge></li>)}</ul>
          </section>
        )}

        {inv.company && (
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Other contacts at {inv.company.name} ({inv.company.investors.length})</h2>
            <ul className="space-y-2">
              {inv.company.investors.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/investors/${c.id}`} className="flex items-center gap-2 text-sm hover:text-brand-600">
                    <Avatar name={c.name} initials={initials(c.name)} size="sm" />
                    <span className="min-w-0"><span className="block truncate font-medium">{c.name}</span><span className="block truncate text-xs text-slate-500">{c.title ?? c.email}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={`/admin/investors/new?firmId=${inv.company.id}`} className="mt-3 inline-flex items-center gap-1 text-sm text-brand-600"><CrmIcon name="PLUS" /> Add contact</Link>
          </section>
        )}
      </aside>
    </div>
  );
}
