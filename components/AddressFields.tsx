"use client";
import { useState } from "react";
import { COUNTRIES, flag } from "@/lib/phone";
import { STATE_NAMES } from "@/lib/regions";
import type { Address } from "@/lib/address";
import { useKeepOnReset } from "@/lib/use-keep-on-reset";

const STATES = Object.entries(STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1]));

/** Street, city, state/region, postal code and country. US addresses get a state picker. */
export function AddressFields({ value, className = "grid gap-3 sm:grid-cols-2" }: { value?: Address | null; className?: string }) {
  const [country, setCountry] = useState(value?.country ?? "US");
  const us = country === "US";
  const ref = useKeepOnReset(country);
  const [state, setState] = useState(value?.country === "US" || !value?.country ? (value?.region ?? "") : "");
  const stateRef = useKeepOnReset(state);
  return (
    <div role="group" aria-label="Address" className={className}>
      <label className="col-span-full block"><span className="label">Street address</span><input name="street" defaultValue={value?.street ?? ""} placeholder="Street address, suite" autoComplete="street-address" className="input" /></label>
      <label className="block"><span className="label">City</span><input name="city" defaultValue={value?.city ?? ""} autoComplete="address-level2" className="input" /></label>
      <label className="block">
        <span className="label">{us ? "State" : "State / region"}</span>
        {us ? (
          <select key="us" ref={stateRef} name="region" value={state} onChange={(e) => setState(e.target.value)} className="input"><option value="">—</option>{STATES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>
        ) : <input key="intl" name="region" defaultValue={value?.country === country ? (value?.region ?? "") : ""} autoComplete="address-level1" className="input" />}
      </label>
      <label className="block"><span className="label">{us ? "ZIP code" : "Postal code"}</span><input name="postalCode" defaultValue={value?.postalCode ?? ""} autoComplete="postal-code" className="input" /></label>
      <label className="block">
        <span className="label">Country</span>
        <select ref={ref} name="country" value={country} onChange={(e) => setCountry(e.target.value)} className="input">
          {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{flag(c.iso)} {c.name}</option>)}
        </select>
      </label>
    </div>
  );
}
