"use client";

/** A <select> inside a GET filter form that applies as soon as an option is picked. */
export function AutoSubmitSelect({ name, defaultValue, options, className = "", label }: { name: string; defaultValue?: string; options: { value: string; label: string }[]; className?: string; label: string }) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} aria-label={label} onChange={(e) => e.currentTarget.form?.requestSubmit()} className={`input py-1.5 ${className}`}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
