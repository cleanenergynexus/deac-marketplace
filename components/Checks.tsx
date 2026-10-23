export function Checks({ name, options, selected = [] }: { name: string; options: readonly (string | { value: string; label: string })[]; selected?: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <label key={v} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50 has-[:checked]:text-brand-700">
            <input type="checkbox" name={name} value={v} defaultChecked={selected.includes(v)} className="sr-only" />
            {l}
          </label>
        );
      })}
    </div>
  );
}
