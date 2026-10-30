"use client";
import { useState, useTransition } from "react";
import { toggleFavorite } from "@/app/actions/member";

/** Star that saves a listing to the investor's Favorites in My Portal. "icon" sits on a tile; "button" is a labelled pill. */
export function FavoriteButton({ projectId, initial, variant = "icon", className = "" }: { projectId: string; initial: boolean; variant?: "icon" | "button"; className?: string }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const click = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !on;
    setOn(next);
    start(async () => {
      const r = await toggleFavorite(projectId);
      if ("error" in r) { setOn(!next); alert(r.error); } else setOn(r.favorite);
    });
  };
  const label = on ? "Remove from favorites" : "Save to favorites";
  if (variant === "button") {
    return (
      <button type="button" onClick={click} disabled={pending} aria-pressed={on} title={label}
        className={`rounded-full px-4 py-1.5 text-sm font-semibold shadow transition ${on ? "bg-amber-400 text-amber-950 hover:bg-amber-300" : "bg-white text-brand-900 hover:bg-brand-50"} ${className}`}>
        {on ? "★ Favorited" : "☆ Save to favorites"}
      </button>
    );
  }
  return (
    <button type="button" onClick={click} disabled={pending} aria-pressed={on} aria-label={label} title={label}
      className={`flex h-9 w-9 items-center justify-center rounded-full text-xl leading-none shadow transition hover:scale-110 ${on ? "bg-amber-400 text-white" : "bg-black/40 text-white hover:bg-black/60"} ${className}`}>
      {on ? "★" : "☆"}
    </button>
  );
}
