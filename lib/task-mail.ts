import "server-only";
import { db } from "./db";
import { sendEmail } from "./email";
import { taskAssignedEmail } from "./tasks";

const appUrl = () => process.env.PUBLIC_APP_URL || "https://marketplace.deacna.com";

/** Task fields the email needs. */
type MailTask = { id: string; subject: string | null; body: string; dueAt: Date | null; assigneeId: string | null; contactId: string | null; investorId: string | null; projectId: string | null };

/**
 * Emails the assignee that a task is now theirs. Skips when nobody is assigned, when the assignee didn't change,
 * or when people assign tasks to themselves. Sent from the assigner's linked Gmail, else through Resend.
 * Never throws: a failed email must not undo the task change.
 */
export async function notifyTaskAssignee(task: MailTask, by: { id: string; name: string }, previousAssigneeId: string | null = null) {
  if (!task.assigneeId || task.assigneeId === previousAssigneeId || task.assigneeId === by.id) return;
  try {
    const [assignee, contact, investor, project] = await Promise.all([
      db.user.findUnique({ where: { id: task.assigneeId }, select: { name: true, email: true, role: true } }),
      task.contactId ? db.contact.findUnique({ where: { id: task.contactId }, select: { name: true, developer: { select: { company: true } } } }) : null,
      task.investorId ? db.investor.findUnique({ where: { id: task.investorId }, select: { name: true, firm: true } }) : null,
      task.projectId ? db.project.findUnique({ where: { id: task.projectId }, select: { code: true, title: true } }) : null,
    ]);
    if (!assignee?.email) return;
    const about = [
      ...(contact ? [`Contact: ${contact.name} · ${contact.developer.company}`] : []),
      ...(investor ? [`Investor: ${investor.name}${investor.firm ? ` · ${investor.firm}` : ""}`] : []),
      ...(project ? [`Project: ${project.code} · ${project.title}`] : []),
    ];
    // Referral agents work from their portal, so their link goes to their task list there.
    const link = assignee.role === "AGENT" ? `${appUrl()}/agent/tasks` : `${appUrl()}${task.contactId ? `/admin/developers/contacts/${task.contactId}?tab=tasks` : task.investorId ? `/admin/investors/${task.investorId}?tab=tasks` : "/admin/tasks"}`;
    const mail = taskAssignedEmail({ assigneeName: assignee.name, byName: by.name, title: task.subject || "Task", body: task.body, due: task.dueAt, about, link });
    const res = await sendEmail({ to: assignee.email, toName: assignee.name, fromUserId: by.id, ...mail });
    if (res.status === "FAILED") console.error("[task-mail] couldn't email the assignee", res.error);
  } catch (e) {
    console.error("[task-mail] couldn't email the assignee", e);
  }
}
