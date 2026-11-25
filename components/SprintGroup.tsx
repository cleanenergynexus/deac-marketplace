import type { ReactNode } from "react";
import { deleteActivity } from "@/app/actions/contacts";
import { startProjectSprint } from "@/app/actions/sprints";
import { AssigneeSelect } from "@/components/AssigneeSelect";
import { ConfirmButton } from "@/components/ConfirmButton";
import { TaskEditButton, type TaskEditing } from "@/components/TaskEditButton";
import { AddTaskRow, PriorityCell, StatusCell } from "@/components/SprintCells";
import { initials } from "@/lib/crm";
import { POSITION_LABEL, progress, type RoadmapStage, type StageDates, type StageSprint } from "@/lib/sprints";
import type { ProjectSprint } from "@/lib/sprints-db";
import { NO_PRIORITY_COLOR, POSITION_TONE, PRIORITY_COLOR, WORK_STATE_COLOR, groupColor } from "@/lib/sprint-colors";
import { agentCanUpdateTask } from "@/lib/listing-collab";
import { PRIORITIES, WORK_STATES, priorityOf, taskWorkState, workStateLabel, type AssigneeOption } from "@/lib/tasks";

type Task = ProjectSprint["tasks"][number];
type Row = Omit<Task, "subtasks">;

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "May 20 - 27", "May 27 - Jun 3", or one date. */
export function span(a: Date | null, b: Date | null) {
  if (!a && !b) return null;
  if (!a || !b || day(a) === day(b)) return day((a ?? b)!);
  const [m1, d1] = day(a).split(" "), [m2, d2] = day(b).split(" ");
  return m1 === m2 ? `${m1} ${d1} - ${d2}` : `${m1} ${d1} - ${m2} ${d2}`;
}

const AVATAR = ["#579bfc", "#a25ddc", "#00c875", "#fdab3d", "#e2445c", "#037f4c", "#1f6bff", "#ff642e"];
const avatarColor = (id: string) => AVATAR[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % AVATAR.length];
export function Avatar({ person, size = 28 }: { person: { id: string; name: string } | null; size?: number }) {
  if (!person) return <span title="Unassigned" className="inline-flex items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-[10px] text-slate-400" style={{ width: size, height: size }}>?</span>;
  return <span title={person.name} className="inline-flex shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-white" style={{ width: size, height: size, backgroundColor: avatarColor(person.id) }}>{initials(person.name)}</span>;
}

/** Timeline pill: the elapsed part of the task's dates is filled with the group color, like a progress bar. */
function TimelinePill({ start, end, color, done, now }: { start: Date | null; end: Date | null; color: string; done: boolean; now: Date }) {
  const text = span(start, end);
  if (!text) return <span className="text-xs text-slate-300">—</span>;
  const a = (start ?? end)!.getTime(), b = (end ?? start)!.getTime();
  const pct = done ? 100 : b <= a ? (now.getTime() >= b ? 100 : 0) : Math.max(0, Math.min(100, ((now.getTime() - a) / (b - a)) * 100));
  const late = !done && end && end < now;
  return (
    <span className="inline-block w-full max-w-[9.5rem] rounded-full px-2 py-1 text-center text-xs font-medium text-white" title={late ? "Past due" : undefined}
      style={{ background: `linear-gradient(to right, ${color} ${pct}%, ${late ? "#df2f4a" : "#333333"} ${pct}%)` }}>{text}</span>
  );
}

/** A colored bar showing how many rows have each value (the group footer's Status and Priority summaries). */
function DistributionBar({ parts }: { parts: { color: string; n: number; label: string }[] }) {
  const total = parts.reduce((t, p) => t + p.n, 0);
  if (!total) return null;
  return (
    <div className="flex h-6 w-full overflow-hidden rounded" title={parts.filter((p) => p.n).map((p) => `${p.label}: ${p.n}`).join(" · ")}>
      {parts.filter((p) => p.n).map((p) => <span key={p.label} style={{ width: `${(p.n / total) * 100}%`, backgroundColor: p.color }} />)}
    </div>
  );
}

function People({ people }: { people: { id: string; name: string }[] }) {
  return (
    <span className="inline-flex items-center -space-x-1.5">
      {people.slice(0, 3).map((u) => <Avatar key={u.id} person={u} size={26} />)}
      {people.length > 3 && <span className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-full bg-slate-700 text-[10px] font-semibold text-white ring-2 ring-white">+{people.length - 3}</span>}
    </span>
  );
}

export type Assigning = { options: AssigneeOption[]; allowUnassigned: boolean };
type FormAction = (f: FormData) => Promise<void>;

/**
 * Who is looking at the board. The DEAC team can edit, reassign, delete and start sprints on every task they can see.
 * A referral agent (their own listings, in the agent portal) updates the status and priority of tasks that are theirs
 * or that they created, and adds tasks and sub-tasks for themselves; everything else is read-only for them.
 */
export type SprintMode =
  | { kind: "TEAM"; editing: TaskEditing; assigning: Assigning }
  | { kind: "AGENT"; agent: { id: string; name: string }; actions: { state: FormAction; priority: FormAction; add: FormAction } };

/** A Status or Priority cell someone can't change: the same color, no menu. */
function StaticCell({ color, label }: { color: string; label: string }) {
  return <div className="flex h-10 items-center justify-center px-2 text-sm font-medium text-white" style={{ backgroundColor: color }}>{label}</div>;
}

/**
 * One stage of a project's roadmap as a monday.com-style group: a colored, collapsible table of the sprint's tasks
 * (sub-tasks indented under their task) with People, Timeline, Status and Priority cells, an "+ Add Task" row, and a
 * footer that sums up the group. A stage with no sprint yet shows its template's tasks as the plan.
 */
export function SprintGroup({ index, stage, dates, template, projectId, mode, now = new Date() }: {
  index: number;
  stage: RoadmapStage<ProjectSprint>;
  dates: StageDates;
  template: StageSprint;
  projectId: string;
  mode: SprintMode;
  now?: Date;
}) {
  const color = groupColor(index);
  const sprint = stage.sprint;
  const all: Row[] = sprint ? sprint.tasks.flatMap((t) => [t, ...t.subtasks]) : [];
  const prog = progress(all);
  const open = stage.position === "ACTIVE" || (stage.position === "DONE" && prog.done < prog.total);
  const people = [...new Map(all.flatMap((t) => (t.assignee ? [[t.assignee.id, t.assignee] as const] : []))).values()];
  const starts = all.flatMap((t) => (t.startAt ?? t.dueAt ? [(t.startAt ?? t.dueAt)!] : []));
  const ends = all.flatMap((t) => (t.dueAt ? [t.dueAt] : []));
  const first = starts.length ? new Date(Math.min(...starts.map(Number))) : null;
  const last = ends.length ? new Date(Math.max(...ends.map(Number))) : null;
  const stateOf = (t: Row) => taskWorkState(t);

  const add = mode.kind === "AGENT" ? mode.actions.add : undefined;
  const row = (t: Row, sub: boolean) => {
    const state = stateOf(t);
    const team = mode.kind === "TEAM" ? mode : null;
    const canUpdate = mode.kind === "TEAM" || agentCanUpdateTask(mode.agent, t);
    const p = priorityOf(t.priority);
    return (
      <tr key={t.id} className="h-10 border-t border-slate-200 bg-white hover:bg-slate-50">
        <td className="border-r border-slate-200 px-3 text-sm" style={{ paddingLeft: sub ? 36 : undefined }}>
          <div className="flex items-center gap-2">
            {sub && <span className="text-slate-300">↳</span>}
            <span className={`min-w-0 flex-1 ${state === "DONE" ? "text-slate-400 line-through" : sub ? "text-slate-700" : "font-medium text-slate-900"}`} title={t.body || undefined}>{t.subject}</span>
            {team && (
              <span className="flex shrink-0 items-center gap-2 opacity-60 hover:opacity-100">
                <TaskEditButton task={{ ...t, sprintId: t.sprintId, startAt: t.startAt }} editing={team.editing} />
                <form action={deleteActivity}><input type="hidden" name="id" value={t.id} />
                  <ConfirmButton message={`Delete "${t.subject}"${sub ? "" : " and its sub-tasks"}?`} className="text-xs text-slate-400 hover:text-red-600">×</ConfirmButton>
                </form>
              </span>
            )}
          </div>
        </td>
        <td className="relative border-r border-slate-200 text-center">
          <Avatar person={t.assignee} />
          {team && (team.assigning.options.length > 1 || team.assigning.allowUnassigned) && (
            <AssigneeSelect taskId={t.id} assigneeId={t.assigneeId} options={withCurrent(team.assigning.options, t.assignee)} allowUnassigned={team.assigning.allowUnassigned} className="!absolute inset-0 !h-full cursor-pointer opacity-0" />
          )}
        </td>
        <td className="border-r border-slate-200 px-2 text-center"><TimelinePill start={t.startAt} end={t.dueAt} color={color} done={state === "DONE"} now={now} /></td>
        <td className="border-r border-slate-200 p-0">
          {!canUpdate ? <StaticCell color={WORK_STATE_COLOR[state]} label={workStateLabel(state)} /> : mode.kind === "AGENT" ? <StatusCell taskId={t.id} state={state} action={mode.actions.state} /> : <StatusCell taskId={t.id} state={state} />}
        </td>
        <td className="p-0">
          {!canUpdate ? <StaticCell color={p ? PRIORITY_COLOR[p] : NO_PRIORITY_COLOR} label={p ? `${PRIORITIES.find((x) => x.value === p)!.label}${p === "CRITICAL" ? " ⚠" : ""}` : "—"} /> : mode.kind === "AGENT" ? <PriorityCell taskId={t.id} priority={t.priority} action={mode.actions.priority} /> : <PriorityCell taskId={t.id} priority={t.priority} />}
        </td>
      </tr>
    );
  };

  let body: ReactNode;
  if (sprint) {
    body = (
      <>
        {sprint.tasks.map((t) => [
          row(t, false),
          ...t.subtasks.map((x) => row(x, true)),
          <tr key={`${t.id}-add`} className="border-t border-slate-100 bg-white"><td colSpan={5} className="py-0 pr-3" style={{ paddingLeft: 52 }}><AddTaskRow sprintId={sprint.id} parentId={t.id} label="+ Add sub-task" action={add} /></td></tr>,
        ])}
        <tr className="border-t border-slate-200 bg-white"><td colSpan={5} className="px-3 py-1"><AddTaskRow sprintId={sprint.id} label="+ Add task" action={add} /></td></tr>
      </>
    );
  } else {
    // No sprint yet: the stage template is the plan.
    body = (
      <>
        {template.tasks.map((t) => (
          <tr key={t.id} className="h-10 border-t border-slate-200 bg-white text-slate-400">
            <td className="border-r border-slate-200 px-3 text-sm">{t.title}{t.subtasks.length > 0 && <span className="ml-2 text-xs">+{t.subtasks.length} sub-task{t.subtasks.length === 1 ? "" : "s"}</span>}</td>
            <td className="border-r border-slate-200 text-center"><Avatar person={null} /></td>
            <td className="border-r border-slate-200 px-2 text-center text-xs">{t.dueDays === null ? "—" : `Day ${t.startDays ?? 0}–${t.dueDays}`}</td>
            <td className="border-r border-slate-200 text-center text-xs">Planned</td>
            <td className="text-center text-xs">{PRIORITIES.find((p) => p.value === t.priority)?.label ?? "—"}</td>
          </tr>
        ))}
        <tr className="border-t border-slate-200 bg-white">
          <td colSpan={5} className="px-3 py-2 text-sm text-slate-500">
            {stage.position === "ACTIVE" && mode.kind === "AGENT" ? (
              <>The project is in this stage. The DEAC team will start its sprint.</>
            ) : stage.position === "ACTIVE" ? (
              <form action={startProjectSprint} className="flex flex-wrap items-center gap-3">
                <input type="hidden" name="projectId" value={projectId} />
                <span>The project is in this stage but its sprint hasn&apos;t started.</span>
                <button className="btn">Start Sprint</button>
              </form>
            ) : stage.position === "UPCOMING" ? (
              <>Starts automatically when the project moves to {stage.label}{template.tasks.length ? `, with these ${template.tasks.length} tasks` : ""}.</>
            ) : (
              <>No sprint was run for this stage.</>
            )}
          </td>
        </tr>
      </>
    );
  }

  return (
    <details open={open} className="group">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-2 [&::-webkit-details-marker]:hidden">
        <span className="text-slate-400 transition group-open:rotate-90">▶</span>
        <span className="text-lg font-semibold" style={{ color }}>{stage.label}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${POSITION_TONE[stage.position]}`}>{POSITION_LABEL[stage.position]}</span>
        {sprint && <span className="text-sm text-slate-500">{prog.done}/{prog.total} done</span>}
        {dates && <span className="text-sm text-slate-500">{dates.projected ? "Projected " : ""}{span(dates.start, dates.end)}</span>}
        {(sprint?.goal || template.goal) && <span className="w-full pl-6 text-sm text-slate-600">{sprint?.goal || template.goal}</span>}
      </summary>
      <div className="mb-6 overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed overflow-hidden rounded-md border border-slate-200 border-l-[6px]" style={{ borderLeftColor: color }}>
          <colgroup><col /><col className="w-24" /><col className="w-44" /><col className="w-36" /><col className="w-32" /></colgroup>
          <thead className="bg-slate-50">
            <tr><th className="th border-r border-slate-200 normal-case">Task</th><th className="th border-r border-slate-200 text-center normal-case">People</th><th className="th border-r border-slate-200 text-center normal-case">Timeline</th><th className="th border-r border-slate-200 text-center normal-case">Status</th><th className="th text-center normal-case">Priority</th></tr>
          </thead>
          <tbody>{body}</tbody>
          {sprint && all.length > 0 && (
            <tfoot className="bg-white">
              <tr className="h-11 border-t-2 border-slate-200">
                <td className="border-r border-slate-200 px-3 text-xs text-slate-500">{prog.total} task{prog.total === 1 ? "" : "s"} · {prog.pct}% done{sprint.targetAt && <> · target {span(sprint.targetAt, null)}</>}</td>
                <td className="border-r border-slate-200 text-center"><People people={people} /></td>
                <td className="border-r border-slate-200 px-2 text-center"><TimelinePill start={first} end={last} color={color} done={prog.done === prog.total} now={now} /></td>
                <td className="border-r border-slate-200 px-2"><DistributionBar parts={WORK_STATES.map((s) => ({ label: workStateLabel(s.value), color: WORK_STATE_COLOR[s.value], n: all.filter((t) => stateOf(t) === s.value).length }))} /></td>
                <td className="px-2"><DistributionBar parts={[...PRIORITIES.map((p) => ({ label: p.label, color: PRIORITY_COLOR[p.value], n: all.filter((t) => priorityOf(t.priority) === p.value).length })), { label: "No priority", color: NO_PRIORITY_COLOR, n: all.filter((t) => !priorityOf(t.priority)).length }]} /></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </details>
  );
}

/** Keeps a task's current assignee in its menu even when this person couldn't pick them. */
function withCurrent(options: AssigneeOption[], current: { id: string; name: string } | null) {
  return current && !options.some((o) => o.id === current.id) ? [{ id: current.id, name: current.name }, ...options] : options;
}
