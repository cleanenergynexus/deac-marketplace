// Task assignment and who-sees-what. No database access here (see lib/tasks-db.ts).

/** Access levels for team logins. Every team login has role ADMIN; staffLevel narrows what they see. */
export const STAFF_LEVELS = [
  { value: "ADMIN", label: "Admin", help: "Sees and assigns every task, manages the team." },
  { value: "MANAGER", label: "Manager", help: "Sees and assigns tasks for themselves and the people who report to them." },
  { value: "SUPPORT", label: "Support", help: "Sees only the tasks assigned to them." },
] as const;
export type StaffLevel = (typeof STAFF_LEVELS)[number]["value"];
export const isStaffLevel = (v: unknown): v is StaffLevel => STAFF_LEVELS.some((l) => l.value === v);
/** Older logins (and anything unexpected) count as Admin, which is what every team member was before levels existed. */
export const staffLevel = (v: string | null | undefined): StaffLevel => (isStaffLevel(v) ? v : "ADMIN");
export const staffLevelLabel = (v: string | null | undefined) => STAFF_LEVELS.find((l) => l.value === staffLevel(v))!.label;

export type Staff = { id: string; name: string; staffLevel: string; managerId: string | null };

/**
 * Team members whose tasks this person can see and assign to.
 * Admin: everyone. Manager: themselves and their direct reports. Support: only themselves.
 */
export function visibleStaff<T extends Staff>(viewer: Staff, team: T[]): T[] {
  const level = staffLevel(viewer.staffLevel);
  if (level === "ADMIN") return team;
  if (level === "MANAGER") return team.filter((u) => u.id === viewer.id || u.managerId === viewer.id);
  return team.filter((u) => u.id === viewer.id);
}

/** Assignee ids this person can see, or null for "everything, including unassigned tasks" (Admins). */
export function visibleAssigneeIds(viewer: Staff, team: Staff[]): string[] | null {
  if (staffLevel(viewer.staffLevel) === "ADMIN") return null;
  return visibleStaff(viewer, team).map((u) => u.id);
}

export function canSeeTask(viewer: Staff, team: Staff[], task: { assigneeId: string | null }): boolean {
  const ids = visibleAssigneeIds(viewer, team);
  return ids === null || (task.assigneeId !== null && ids.includes(task.assigneeId));
}

/** Who can be picked as the assignee. Unassigned (null) is only allowed for Admins. */
export function canAssign(viewer: Staff, team: Staff[], assigneeId: string | null): boolean {
  if (assigneeId === null) return staffLevel(viewer.staffLevel) === "ADMIN";
  return visibleStaff(viewer, team).some((u) => u.id === assigneeId);
}

/** Views on the Tasks page. Managers get "Team", Admins get "All". */
export type TaskScope = "mine" | "team" | "all";
export function taskScopes(level: string | null | undefined): { value: TaskScope; label: string }[] {
  const l = staffLevel(level);
  const scopes: { value: TaskScope; label: string }[] = [{ value: "mine", label: "My tasks" }];
  if (l === "MANAGER") scopes.push({ value: "team", label: "My team's tasks" });
  if (l === "ADMIN") scopes.push({ value: "all", label: "All tasks" });
  return scopes;
}
export function taskScope(v: string | undefined, level: string | null | undefined): TaskScope {
  const scopes = taskScopes(level);
  return scopes.find((s) => s.value === v)?.value ?? "mine";
}

/** Status filter on the Tasks page. */
export const TASK_STATUSES = [
  { value: "open", label: "Outstanding" },
  { value: "overdue", label: "Overdue" },
  { value: "done", label: "Completed" },
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number]["value"];
export const taskStatus = (v?: string): TaskStatus => TASK_STATUSES.find((s) => s.value === v)?.value ?? "open";

/** Open tasks first, soonest due first (no due date last), then completed tasks, most recently completed first. */
export function sortTasks<T extends { dueAt: Date | null; doneAt: Date | null; createdAt: Date }>(tasks: T[]): T[] {
  return [...tasks].sort((a, b) => {
    if (!!a.doneAt !== !!b.doneAt) return a.doneAt ? 1 : -1;
    if (a.doneAt && b.doneAt) return b.doneAt.getTime() - a.doneAt.getTime();
    return (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity) || b.createdAt.getTime() - a.createdAt.getTime();
  });
}

/**
 * Checks a change to someone's level or manager keeps the team sane:
 * somebody stays Admin, nobody reports to themselves, and managers are Managers or Admins.
 * Returns an error message, or null when the change is fine.
 */
export function checkStaffChange(team: Staff[], change: { id: string; staffLevel: string; managerId: string | null }): string | null {
  if (!isStaffLevel(change.staffLevel)) return "Pick an access level.";
  const next = team.map((u) => (u.id === change.id ? { ...u, staffLevel: change.staffLevel, managerId: change.managerId } : u));
  if (!next.some((u) => staffLevel(u.staffLevel) === "ADMIN")) return "Keep at least one Admin on the team.";
  if (change.managerId === change.id) return "A team member can't report to themselves.";
  if (change.managerId) {
    const m = next.find((u) => u.id === change.managerId);
    if (!m) return "That manager is not on the team.";
    if (staffLevel(m.staffLevel) === "SUPPORT") return `${m.name} has Support access. Make them a Manager first.`;
  }
  // Someone being made Support can't keep people reporting to them.
  if (change.staffLevel === "SUPPORT" && next.some((u) => u.managerId === change.id)) return "People report to this team member. Move their reports to another manager first.";
  return null;
}
