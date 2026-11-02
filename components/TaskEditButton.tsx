"use client";
import { useEffect, useState } from "react";
import { TaskForm, type EditableTask } from "@/components/TaskForm";
import type { TaskEditing } from "@/lib/tasks-db";

export type { TaskEditing };

/** "Edit" link on a task that opens the full task form in a dialog. */
export function TaskEditButton({ task, editing, className = "text-xs text-slate-400 hover:text-brand-600" }: { task: EditableTask; editing: TaskEditing; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>Edit</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 pt-[10vh] text-left text-sm font-normal whitespace-normal" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div role="dialog" aria-modal="true" aria-label="Edit task" className="card w-full max-w-xl p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">Edit task</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-xl leading-none text-slate-400 hover:text-slate-700">×</button>
            </div>
            <TaskForm {...editing} task={task} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
