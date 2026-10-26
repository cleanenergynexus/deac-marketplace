"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { formatMoneyInput, parseMoney } from "@/lib/money";

type Props = {
  name?: string;
  defaultValue?: string | number | null;
  required?: boolean;
  placeholder?: string;
  className?: string;
  /** Called with the plain number (or null) on every change. */
  onValue?: (n: number | null) => void;
};

/** Dollar amount input that shows thousands separators while typing (1,000,000). The server strips the commas. */
export function MoneyInput({ name, defaultValue, required, placeholder, className = "input", onValue }: Props) {
  const [text, setText] = useState(() => (defaultValue == null || defaultValue === "" ? "" : formatMoneyInput(String(defaultValue))));
  const ref = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  // Keep the cursor after the same digit it was after before the commas moved.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caret.current == null || document.activeElement !== el) return;
    let digits = caret.current, pos = 0;
    while (pos < text.length && digits > 0) { if (/[\d.]/.test(text[pos])) digits--; pos++; }
    el.setSelectionRange(pos, pos);
    caret.current = null;
  }, [text]);

  return (
    <input
      ref={ref}
      name={name}
      value={text}
      required={required}
      placeholder={placeholder}
      inputMode="decimal"
      autoComplete="off"
      className={className}
      onChange={(e) => {
        const raw = e.target.value;
        const at = e.target.selectionStart ?? raw.length;
        caret.current = raw.slice(0, at).replace(/[^\d.]/g, "").length;
        const next = formatMoneyInput(raw);
        setText(next);
        onValue?.(parseMoney(next));
      }}
    />
  );
}
