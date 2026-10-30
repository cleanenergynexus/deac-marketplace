"use client";
import { useState } from "react";
import { COUNTRIES, flag } from "@/lib/phone";
import { STATE_NAMES } from "@/lib/regions";
import { isUS, type Place } from "@/lib/location";
import { useKeepOnReset } from "@/lib/use-keep-on-reset";

const STATES = Object.entries(STATE_NAMES).sort((a, b) => a[1].localeCompare(b[1]));

/**
 * Listing location: country (required) plus optional state / province, county and city.
 * US listings pick a state from a list; elsewhere the state or province is typed.
 * `pickCountry` leaves the country empty until chosen (import wizard, when the document didn't say).
 */
export function ListingLocationFields({ value, pickCountry = false }: { value?: Place | null; pickCountry?: boolean }) {
  const [country, setCountry] = useState(value?.country ?? (pickCountry ? "" : "US"));
  const countryRef = useKeepOnReset(country);
  const us = isUS(country) && country !== "";
  const [state, setState] = useState(isUS(value?.country) ? (value?.state ?? "") : "");
  const stateRef = useKeepOnReset(state);
  return (
    <>
      <label className="block">
        <span className="label">Country</span>
        <select ref={countryRef} name="country" value={country} onChange={(e) => setCountry(e.target.value)} required className="input">
          {country === "" && <option value="">Choose…</option>}
          {COUNTRIES.map((c) => <option key={c.iso} value={c.iso}>{flag(c.iso)} {c.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">{us ? "State (optional)" : "State / province (optional)"}</span>
        {us ? (
          <select key="us" ref={stateRef} name="state" value={state} onChange={(e) => setState(e.target.value)} className="input">
            <option value="">—</option>
            {STATES.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        ) : <input key={`intl-${country}`} name="state" defaultValue={value?.country === country ? (value?.state ?? "") : ""} autoComplete="address-level1" className="input" />}
      </label>
      <label className="block"><span className="label">County (optional)</span><input name="county" defaultValue={value?.county ?? ""} className="input" /></label>
      <label className="block"><span className="label">City (optional)</span><input name="city" defaultValue={value?.city ?? ""} autoComplete="address-level2" className="input" /></label>
    </>
  );
}
