import { logActivity } from "@/app/actions/admin";
import { date } from "@/lib/format";
import type { Activity } from "@prisma/client";

const icon: Record<string, string> = { CALL: "📞", EMAIL: "✉️", MEETING: "🤝", NOTE: "📝", STAGE: "➡️", SYSTEM: "⚙️" };

export function Timeline({ items, investorId, developerId }: { items: Activity[]; investorId?: string; developerId?: string }) {
  return (
    <div>
      <form action={logActivity} className="mb-4 space-y-2">
        {investorId && <input type="hidden" name="investorId" value={investorId} />}
        {developerId && <input type="hidden" name="developerId" value={developerId} />}
        <div className="flex gap-2">
          <select name="kind" className="input w-32"><option value="NOTE">Note</option><option value="CALL">Call</option><option value="EMAIL">Email</option><option value="MEETING">Meeting</option></select>
          <input name="body" placeholder="Log a touchpoint…" className="input" required />
          <button className="btn-ghost">Log</button>
        </div>
      </form>
      <ul className="space-y-3">
        {items.map((a) => (
          <li key={a.id} className="flex gap-3 text-sm">
            <span>{icon[a.kind] ?? "•"}</span>
            <div><div>{a.body}</div><div className="text-xs text-slate-500">{date(a.createdAt)}{a.by ? ` · ${a.by}` : ""}</div></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
