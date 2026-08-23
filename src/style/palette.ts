import type { Value } from "../eval.js";
import type { PaletteKind, StyleMeta, StylePreset } from "./types.js";

const seriesMaps = new WeakMap<StyleMeta, Map<string, number>>();

function seriesMap(meta: StyleMeta): Map<string, number> {
  let map = seriesMaps.get(meta);
  if (!map) {
    map = new Map();
    seriesMaps.set(meta, map);
  }
  return map;
}

export function paletteColor(
  meta: StyleMeta | null | undefined,
  series: Value,
  kind: PaletteKind = "categorical",
): string {
  if (!meta?.preset.palette) return "#888888";
  const paletteList = meta.preset.palette?.[kind as keyof import("./types.js").StylePalette];
  if (!Array.isArray(paletteList) || !paletteList.length) {
    if (kind !== "categorical" && meta.preset.palette?.categorical?.length) {
      return paletteColor(meta, series, "categorical");
    }
    return meta.preset.palette?.accent ?? "#888888";
  }
  if (kind === "sequential") {
    const n = typeof series === "number" ? series : Number(series);
    if (!Number.isNaN(n)) {
      const maxIdx = paletteList.length - 1;
      const t = Math.min(maxIdx, Math.max(0, n));
      const lo = Math.floor(t);
      const hi = Math.ceil(t);
      if (lo === hi) return paletteList[lo]!;
      return lerpHex(paletteList[lo]!, paletteList[hi]!, t - lo);
    }
  }
  const key = seriesKey(series);
  const map = seriesMap(meta);
  if (!map.has(key)) map.set(key, map.size);
  const idx = map.get(key)! % paletteList.length;
  return paletteList[idx]!;
}

function seriesKey(series: Value): string {
  if (series === null || series === undefined) return "__none";
  if (typeof series === "object") return JSON.stringify(series);
  return String(series);
}

export function resetPaletteSeries(meta: StyleMeta): void {
  seriesMaps.delete(meta);
}

export function strokeForSeries(
  meta: StyleMeta,
  fill: string,
): string {
  const policies = meta.preset.policies;
  if (meta.preset.id.includes("print-nature") || meta.preset.policies?.allowGlow === false) {
    return darkenHex(fill, 0.35);
  }
  return meta.preset.palette?.foreground ?? "#0f172a";
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function lerpHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  const u = Math.min(1, Math.max(0, t));
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * u);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * u);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * u);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, "0")}`;
}

function darkenHex(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#1f2937";
  const n = parseInt(m[1]!, 16);
  const r = Math.max(0, ((n >> 16) & 0xff) * (1 - amount)) | 0;
  const g = Math.max(0, ((n >> 8) & 0xff) * (1 - amount)) | 0;
  const b = Math.max(0, (n & 0xff) * (1 - amount)) | 0;
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
