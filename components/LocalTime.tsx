"use client";
import { useEffect, useState } from "react";

/** Date (and optionally time) in the viewer's own time zone. The server render shows the date in UTC until the browser takes over. */
export function LocalTime({ value, time = true, timeOnly = false }: { value: Date | string; time?: boolean; timeOnly?: boolean }) {
  const d = new Date(value);
  const fmt = (tz?: string) => d.toLocaleString("en-US", { ...(timeOnly ? {} : { month: "short", day: "numeric", year: "numeric" }), ...(time || timeOnly ? { hour: "numeric", minute: "2-digit" } : {}), timeZone: tz });
  const [text, setText] = useState(() => fmt("UTC"));
  useEffect(() => setText(fmt()), [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <time dateTime={d.toISOString()} suppressHydrationWarning>{text}</time>;
}
