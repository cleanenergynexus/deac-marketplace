"use client";
import { useState } from "react";
import { useKeepOnReset } from "@/lib/use-keep-on-reset";
import { COUNTRIES, country as findCountry, flag, formatNational, parsePhone } from "@/lib/phone";

/**
 * Phone field with a country picker. Submits `<name>` (the number as typed) and `<name>Country`;
 * the server stores it with its country code (see phoneFromForm). Typing a + number switches the country.
 */
export function PhoneInput({ name, defaultValue, defaultCountry, required, placeholder }: { name: string; defaultValue?: string | null; defaultCountry?: string | null; required?: boolean; placeholder?: string }) {
  const start = parsePhone(defaultValue, defaultCountry ?? "US");
  const [iso, setIso] = useState(start?.country.iso ?? findCountry(defaultCountry)?.iso ?? "US");
  const [value, setValue] = useState(start ? formatNational(start) : (defaultValue ?? ""));
  const c = findCountry(iso)!;
  const ref = useKeepOnReset(iso);

  function tidy(text: string, pick = iso) {
    const p = parsePhone(text, pick);
    if (!p) return;
    setIso(p.country.iso);
    setValue(formatNational(p));
  }

  return (
    <div className="flex">
      <label className="relative flex shrink-0 items-center gap-1 rounded-l-md border border-r-0 border-slate-300 bg-slate-50 px-2 text-sm text-slate-700 focus-within:ring-2 focus-within:ring-brand-500">
        <span aria-hidden>{flag(iso)}</span>
        <span>+{c.dial}</span>
        <svg aria-hidden viewBox="0 0 20 20" className="h-3 w-3 text-slate-400"><path fill="currentColor" d="M5 7l5 6 5-6z" /></svg>
        <select ref={ref} name={`${name}Country`} value={iso} onChange={(e) => { setIso(e.target.value); tidy(value, e.target.value); }} aria-label="Country code" className="absolute inset-0 cursor-pointer opacity-0">
          {COUNTRIES.map((x) => <option key={x.iso} value={x.iso}>{flag(x.iso)} {x.name} (+{x.dial})</option>)}
        </select>
      </label>
      <input name={name} type="tel" value={value} required={required} onChange={(e) => setValue(e.target.value)} onBlur={(e) => tidy(e.target.value)} placeholder={placeholder ?? (c.dial === "1" ? "(555) 555-5555" : "")} className="input !rounded-l-none" />
    </div>
  );
}
