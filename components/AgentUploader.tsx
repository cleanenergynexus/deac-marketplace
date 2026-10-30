"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upload, uploadPresigned } from "@vercel/blob/client";
import { agentRegisterFile, agentUploadsDone } from "@/app/actions/agent";
import { formatBytes, storagePath } from "@/lib/dataroom";

type Props = { projectId: string; folders: { id: string; label: string }[]; storage: "blob" | "local" | "missing"; uploadMethod: "token" | "presigned" };
type Job = { id: number; name: string; size: number; pct: number; status: "uploading" | "done" | "error"; error?: string };

const MULTIPART_OVER = 50 * 1024 * 1024;
let seq = 0;

/** Upload-only data room box for referral agents: pick a folder, add files. Nothing here opens or downloads a file. */
export function AgentUploader({ projectId, folders, storage, uploadMethod }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [folderId, setFolderId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const patch = (id: number, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const send = async (files: File[]) => {
    if (!files.length) return;
    const batch = files.map((file) => ({ file, id: ++seq }));
    setJobs((js) => [...js.filter((j) => j.status === "uploading"), ...batch.map((b) => ({ id: b.id, name: b.file.name, size: b.file.size, pct: 0, status: "uploading" as const }))]);
    const done: string[] = [];
    const queue = [...batch];
    const worker = async () => {
      for (let b = queue.shift(); b; b = queue.shift()) {
        const job = b;
        try {
          let key: string;
          if (storage === "blob") {
            const put = uploadMethod === "presigned" ? uploadPresigned : upload;
            const blob = await put(storagePath(projectId, job.file.name, crypto.randomUUID().slice(0, 8)), job.file, {
              access: "private", handleUploadUrl: "/api/data-room/upload", clientPayload: projectId,
              multipart: job.file.size > MULTIPART_OVER, contentType: job.file.type || undefined,
              onUploadProgress: ({ percentage }) => patch(job.id, { pct: Math.min(99, Math.round(percentage)) }),
            });
            key = blob.pathname;
          } else {
            const body = new FormData();
            body.set("projectId", projectId);
            body.set("file", job.file);
            const res = await fetch("/api/data-room/local-upload", { method: "POST", body });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || "Upload failed");
            key = json.key;
          }
          const r = await agentRegisterFile({ projectId, folderId: folderId || null, name: job.file.name, storageKey: key, contentType: job.file.type });
          if (r.error) throw new Error(r.error);
          done.push(job.file.name);
          patch(job.id, { pct: 100, status: "done" });
        } catch (e) {
          patch(job.id, { status: "error", error: (e as Error).message });
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (done.length) await agentUploadsDone(projectId, done);
    if (input.current) input.current.value = "";
    startTransition(() => router.refresh());
  };

  if (storage === "missing") return <p className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">File uploads aren&apos;t switched on yet. Ask your DEAC partner.</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block">
          <span className="label">Folder</span>
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className="input">
            <option value="">Top level</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <button type="button" className="btn" onClick={() => input.current?.click()}>Choose files to upload</button>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => send([...(e.target.files ?? [])])} />
      </div>
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); send([...e.dataTransfer.files]); }}
        className="rounded-lg border-2 border-dashed border-slate-300 p-6 text-center text-sm text-slate-500"
      >
        Or drop files here. They go straight into the project&apos;s data room for the DEAC team.
      </div>
      {jobs.length > 0 && (
        <ul className="space-y-1 text-sm">
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between gap-3 rounded border border-slate-200 px-3 py-2">
              <span className="min-w-0 truncate">{j.name} <span className="text-xs text-slate-400">{formatBytes(j.size)}</span></span>
              <span className={`shrink-0 text-xs ${j.status === "error" ? "text-red-600" : j.status === "done" ? "text-emerald-700" : "text-slate-500"}`}>
                {j.status === "uploading" ? `${j.pct}%` : j.status === "done" ? "Uploaded" : j.error}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
