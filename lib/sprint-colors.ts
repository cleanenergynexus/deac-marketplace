// Colors for the Sprints board (status / priority cells, stage groups). Plain module so server and client components share it.
import type { Priority, WorkState } from "./tasks";
import type { StagePosition } from "./sprints";

export const WORK_STATE_COLOR: Record<WorkState, string> = { NOT_STARTED: "#c4c4c4", WORKING: "#fdab3d", STUCK: "#df2f4a", DONE: "#00c875" };
export const PRIORITY_COLOR: Record<Priority, string> = { LOW: "#579bfc", MEDIUM: "#5559df", HIGH: "#401694", CRITICAL: "#333333" };
export const NO_PRIORITY_COLOR = "#c4c4c4";

/** Group colors, one per stage in funnel order (repeats after eight). */
const GROUP_COLORS = ["#579bfc", "#a25ddc", "#fdab3d", "#00c875", "#1f6bff", "#ff642e", "#037f4c", "#e2445c"];
export const groupColor = (i: number) => GROUP_COLORS[i % GROUP_COLORS.length];

export const POSITION_TONE: Record<StagePosition, string> = {
  DONE: "bg-emerald-50 text-emerald-700",
  ACTIVE: "bg-brand-50 text-brand-700",
  UPCOMING: "bg-slate-100 text-slate-600",
  NOT_REACHED: "bg-slate-100 text-slate-400",
};
