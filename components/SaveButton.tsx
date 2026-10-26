"use client";
import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/** Submit button that shows "Saving…" and then a "Changes saved" note for a few seconds. Must sit inside a <form>. */
export function SaveButton({ label, savedText = "Changes saved" }: { label: string; savedText?: string }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (pending) { wasPending.current = true; setSaved(false); return; }
    if (!wasPending.current) return;
    wasPending.current = false;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 5000);
    return () => clearTimeout(t);
  }, [pending]);

  return (
    <div className="flex items-center gap-3">
      <button className="btn" disabled={pending}>{pending ? "Saving…" : label}</button>
      <span role="status" aria-live="polite" className={`text-sm font-medium text-emerald-700 transition-opacity ${saved ? "opacity-100" : "opacity-0"}`}>
        {saved && <>✓ {savedText}</>}
      </span>
    </div>
  );
}
