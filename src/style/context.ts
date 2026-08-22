import type { StyleMeta } from "./types.js";
import { paletteColor, strokeForSeries } from "./palette.js";

export type StyleEvalContext = {
  meta: StyleMeta;
};

let active: StyleEvalContext | null = null;

export function setStyleContext(ctx: StyleEvalContext | null): void {
  active = ctx;
}

export function getStyleContext(): StyleEvalContext | null {
  return active;
}

export function evalPaletteBuiltin(series: unknown, kind?: unknown): string {
  if (!active) return "#888888";
  const k = typeof kind === "string" ? (kind as import("./types.js").PaletteKind) : "categorical";
  return paletteColor(active.meta, series as import("../eval.js").Value, k);
}

export function evalPaletteStrokeBuiltin(series: unknown, kind?: unknown): string {
  if (!active) return "#1f2937";
  const fill = evalPaletteBuiltin(series, kind);
  return strokeForSeries(active.meta, fill);
}
