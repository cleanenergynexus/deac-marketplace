/** Stroke icons for the Developer CRM (contact record and board). They take the text color. */
const PATHS: Record<string, string> = {
  NOTE: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  EMAIL: "M3 6h18v12H3zM3 7l9 6 9-6",
  CALL: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2",
  MEETING: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  TASK: "M4 12l5 5L20 6",
  STAGE: "M4 12h14M13 6l6 6-6 6",
  SYSTEM: "M12 8v5M12 16h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  COMPANY: "M4 21V5l8-2v18M12 21h8V9l-8-2M8 8h.01M8 12h.01M8 16h.01M16 12h.01M16 16h.01",
  PROJECT: "M3 21h18M5 21V9l7-5 7 5v12M10 21v-6h4v6",
  LINK: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  PLUS: "M12 5v14M5 12h14",
};

export function CrmIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.SYSTEM} />
    </svg>
  );
}

/** Round initials badge in DEAC blue, like the contact photo in HubSpot. */
export function Avatar({ name, initials, size = "md" }: { name: string; initials: string; size?: "sm" | "md" | "lg" }) {
  const cls = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-20 w-20 text-2xl" }[size];
  return <span title={name} className={`inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-semibold text-white ${cls}`}>{initials}</span>;
}
