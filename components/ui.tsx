import type { ReactNode } from "react";

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" | "purple" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-700",
    blue: "bg-brand-100 text-brand-700",
    purple: "bg-violet-100 text-violet-800",
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export const statusTone = (s: string) =>
  (({ APPROVED: "green", PENDING: "amber", DECLINED: "red", REJECTED: "red", OPEN: "amber", IN_PROGRESS: "blue", DELIVERED: "green", SENT: "green", DRAFT: "slate", PRIVATE: "blue", TEASER: "purple" }) as Record<string, "green" | "amber" | "red" | "blue" | "slate" | "purple">)[s] ?? "slate";

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

/** Labelled form field. Use `group` when it wraps several inputs, so a click on text inside it doesn't toggle the first input. */
export function Field({ label, children, className = "", group }: { label: string; children: ReactNode; className?: string; group?: boolean }) {
  if (group) {
    return (
      <div role="group" aria-label={label} className={`block ${className}`}>
        <span className="label">{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Select({ name, options, defaultValue, placeholder, required }: { name: string; options: readonly (string | { value: string; label: string })[]; defaultValue?: string | null; placeholder?: string; required?: boolean }) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className="input" required={required}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}
