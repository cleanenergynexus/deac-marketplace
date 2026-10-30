"use client";
import { useState, useTransition, type FormEvent } from "react";
import { DEFAULT_TEMPLATE, TEMPLATE_MAX_DEPTH, type TemplateNode } from "@/lib/dataroom";
import { FolderIcon } from "@/components/DataRoomIcons";

type State = { error?: string; ok?: string } | undefined;
type Row = { key: number; name: string; depth: number };

let seq = 0;
const toRows = (nodes: TemplateNode[], depth = 0): Row[] => nodes.flatMap((n) => [{ key: ++seq, name: n.name, depth }, ...toRows(n.children, depth + 1)]);
function toTree(rows: Row[]): TemplateNode[] {
  const root: TemplateNode[] = [];
  const stack: { depth: number; children: TemplateNode[] }[] = [{ depth: -1, children: root }];
  for (const r of rows) {
    while (stack.length > 1 && stack[stack.length - 1].depth >= r.depth) stack.pop();
    const node = { name: r.name.trim(), children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push({ depth: r.depth, children: node.children });
  }
  return root;
}
/** Index just past row i and its subfolders. */
const blockEnd = (rows: Row[], i: number) => { let j = i + 1; while (j < rows.length && rows[j].depth > rows[i].depth) j++; return j; };

/** Outline-style editor for the data room folder template. */
export function DataRoomTemplateEditor({ initial, action }: { initial: TemplateNode[]; action: (s: State, f: FormData) => Promise<State> }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(initial));
  const [state, setState] = useState<State>(undefined);
  const [pending, start] = useTransition();
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const edit = (fn: (rs: Row[]) => Row[]) => { setRows(fn); setState(undefined); };

  const shift = (i: number, by: 1 | -1) => edit((rs) => {
    const end = blockEnd(rs, i);
    const deepest = Math.max(...rs.slice(i, end).map((r) => r.depth));
    if (by === 1 && (i === 0 || rs[i].depth > rs[i - 1].depth || deepest + 1 >= TEMPLATE_MAX_DEPTH)) return rs;
    if (by === -1 && rs[i].depth === 0) return rs;
    return rs.map((r, j) => (j >= i && j < end ? { ...r, depth: r.depth + by } : r));
  });
  const move = (i: number, dir: 1 | -1) => edit((rs) => {
    const end = blockEnd(rs, i);
    const block = rs.slice(i, end);
    if (dir === -1) {
      let p = i - 1;
      while (p >= 0 && rs[p].depth > rs[i].depth) p--;
      if (p < 0 || rs[p].depth !== rs[i].depth) return rs;
      return [...rs.slice(0, p), ...block, ...rs.slice(p, i), ...rs.slice(end)];
    }
    if (end >= rs.length || rs[end].depth !== rs[i].depth) return rs;
    const nextEnd = blockEnd(rs, end);
    return [...rs.slice(0, i), ...rs.slice(end, nextEnd), ...block, ...rs.slice(nextEnd)];
  });
  const addAfter = (i: number | null, child: boolean) => {
    const key = ++seq;
    edit((rs) => {
      if (i === null) return [...rs, { key, name: "", depth: 0 }];
      const at = blockEnd(rs, i);
      return [...rs.slice(0, at), { key, name: "", depth: rs[i].depth + (child ? 1 : 0) }, ...rs.slice(at)];
    });
    setFocusKey(key);
  };
  const remove = (i: number) => {
    const sub = blockEnd(rows, i) - i - 1;
    if (sub && !confirm(`Remove "${rows[i].name || "this folder"}" and its ${sub} subfolder${sub > 1 ? "s" : ""} from the template?`)) return;
    edit((rs) => [...rs.slice(0, i), ...rs.slice(blockEnd(rs, i))]);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("config", JSON.stringify(toTree(rows.filter((r) => r.name.trim()))));
    start(async () => setState(await action(undefined, fd)));
  };

  const btn = "h-7 w-7 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30";
  return (
    <form onSubmit={submit} className="card p-5">
      <ul className="space-y-1">
        {rows.map((r, i) => (
          <li key={r.key} className="flex items-center gap-1" style={{ paddingLeft: r.depth * 28 }}>
            <FolderIcon className="h-5 w-5" />
            <input value={r.name} autoFocus={focusKey === r.key} aria-label="Folder name" placeholder="Folder name"
              onChange={(e) => { const v = e.target.value; edit((rs) => rs.map((x, j) => (j === i ? { ...x, name: v } : x))); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addAfter(i, false); }
                if (e.key === "Tab") { e.preventDefault(); shift(i, e.shiftKey ? -1 : 1); }
              }}
              className="input min-w-0 flex-1 py-1" />
            <button type="button" title="Move up" aria-label="Move up" onClick={() => move(i, -1)} className={btn}>↑</button>
            <button type="button" title="Move down" aria-label="Move down" onClick={() => move(i, 1)} className={btn}>↓</button>
            <button type="button" title="Move out a level" aria-label="Move out a level" onClick={() => shift(i, -1)} disabled={r.depth === 0} className={btn}>←</button>
            <button type="button" title="Make it a subfolder of the folder above" aria-label="Make subfolder of the folder above" onClick={() => shift(i, 1)} disabled={i === 0 || r.depth > rows[i - 1].depth} className={btn}>→</button>
            <button type="button" title="Add a subfolder" onClick={() => addAfter(i, true)} disabled={r.depth + 1 >= TEMPLATE_MAX_DEPTH} className="whitespace-nowrap rounded px-2 py-1 text-xs text-brand-600 hover:bg-brand-50 disabled:opacity-30">+ Subfolder</button>
            <button type="button" title="Remove" aria-label={`Remove ${r.name}`} onClick={() => remove(i)} className={`${btn} hover:!text-red-600`}>×</button>
          </li>
        ))}
        {!rows.length && <li className="py-3 text-sm text-slate-500">No folders. &quot;Create standard folders&quot; won&apos;t add anything until you add some.</li>}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <button type="button" onClick={() => addAfter(null, false)} className="btn-ghost">+ Folder</button>
        <button type="button" onClick={() => { if (confirm("Replace the template with the DEAC default folders?")) edit(() => toRows(DEFAULT_TEMPLATE)); }} className="btn-ghost">Restore DEAC default</button>
        <span className="text-xs text-slate-500">Tip: Enter adds a folder below, Tab / Shift+Tab moves it in or out a level.</span>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? "Saving…" : "Save template"}</button>
        {state?.ok && <span role="status" className="text-sm font-medium text-emerald-700">✓ {state.ok}</span>}
        {state?.error && <span role="alert" className="text-sm text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
