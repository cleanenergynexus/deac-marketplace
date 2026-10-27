import { fileKind } from "@/lib/dataroom";

export function FolderIcon({ open = false, className = "h-5 w-5" }: { open?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden>
      <path d="M2 6.5A1.5 1.5 0 0 1 3.5 5h5l2 2h10A1.5 1.5 0 0 1 22 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5z" fill="#e8a33d" />
      <path d={open ? "M3.6 10h18.2l-1.9 9.1a1.2 1.2 0 0 1-1.2.9H3.4a1 1 0 0 1-1-1.2z" : "M2 9.5A1.5 1.5 0 0 1 3.5 8h17A1.5 1.5 0 0 1 22 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 18.5z"} fill="#f6c453" />
    </svg>
  );
}

const COLORS: Record<string, [string, string]> = {
  pdf: ["#dc2626", "PDF"], sheet: ["#15803d", "XLS"], doc: ["#1d4ed8", "DOC"], slides: ["#ea580c", "PPT"], image: ["#7c3aed", "IMG"],
  cad: ["#0f766e", "CAD"], zip: ["#64748b", "ZIP"], video: ["#be185d", "VID"], text: ["#475569", "TXT"], file: ["#94a3b8", ""],
};

export function FileIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const [color, label] = COLORS[fileKind(name).icon] ?? COLORS.file;
  return (
    <svg viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-hidden>
      <path d="M5 2.5h9.5L19 7v14a.5.5 0 0 1-.5.5h-13A.5.5 0 0 1 5 21z" fill="#fff" stroke="#94a3b8" />
      <path d="M14.5 2.5V7H19" fill="none" stroke="#94a3b8" />
      {label && <rect x="2" y="12" width="15" height="7" rx="1" fill={color} />}
      {label && <text x="9.5" y="17.6" textAnchor="middle" fontSize="5.2" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">{label}</text>}
    </svg>
  );
}
