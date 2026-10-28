"use client";
import { useEffect, useRef } from "react";

/**
 * React resets a form after a server action finishes, which puts a controlled <select> back on its
 * first option while React's state still holds the picked one. This puts the picked value back.
 */
export function useKeepOnReset(value: string) {
  const ref = useRef<HTMLSelectElement>(null);
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    // Listening on the document also covers a select that mounts after the form does.
    const restore = (e: Event) => {
      if (ref.current && e.target === ref.current.form) setTimeout(() => { if (ref.current) ref.current.value = latest.current; });
    };
    document.addEventListener("reset", restore, true);
    return () => document.removeEventListener("reset", restore, true);
  }, []);
  return ref;
}
