"use client";
import type { ReactNode } from "react";

/** Submit button that asks "Are you sure?" first. */
export function ConfirmButton({ message, className, children }: { message: string; className?: string; children: ReactNode }) {
  return <button className={className} onClick={(e) => { if (!confirm(message)) e.preventDefault(); }}>{children}</button>;
}
