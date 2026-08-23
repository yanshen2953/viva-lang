/** Recompute box / violin summaries from __sel rows. Not a query engine. */

import { gaussianKDE, violinPathD } from "./violin-density.js";

export type BoxStats = {
  q1: number;
  med: number;
  q3: number;
  whiskLo: number;
  whiskHi: number;
};

export type SummaryCtx = {
  data?: Record<string, unknown>;
  state?: Record<string, unknown>;
};

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + ((sorted[hi] ?? sorted[lo]!) - sorted[lo]!) * (i - lo);
}

export function boxStats(values: number[]): BoxStats | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const med = quantile(sorted, 0.5);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  const inside = sorted.filter((v) => v >= loFence && v <= hiFence);
  return {
    q1,
    med,
    q3,
    whiskLo: inside[0] ?? q1,
    whiskHi: inside[inside.length - 1] ?? q3,
  };
}

function asKeys(value: unknown): unknown[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [];
}

function sameKey(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function rowHasKey(row: Record<string, unknown>, key: unknown): boolean {
  return Object.values(row).some((v) => sameKey(v, key));
}

export function filterSummaryValues(
  rows: unknown,
  groupKey: unknown,
  xField: string,
  yField: string,
  cats: unknown[],
  selKeys: unknown[],
): number[] {
  if (!Array.isArray(rows)) return [];
  const groupKeys = cats.length ? cats : [groupKey];
  const selectedGroups = selKeys.filter((k) => groupKeys.some((g) => sameKey(g, k)));
  const selectedXs = selKeys.filter((k) => !groupKeys.some((g) => sameKey(g, k)));
  const out: number[] = [];
  for (const raw of rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (!sameKey(row[xField], groupKey)) continue;
    if (selectedGroups.length && !selectedGroups.some((k) => sameKey(k, groupKey))) continue;
    if (selectedXs.length && !selectedXs.some((k) => rowHasKey(row, k))) continue;
    const y = Number(row[yField]);
    if (Number.isFinite(y)) out.push(y);
  }
  return out;
}

export function applySelSummary(
  props: Record<string, unknown>,
  ctx: SummaryCtx,
): Record<string, unknown> {
  const isViolin = typeof props.__violinData === "string" && props.__violinData;
  const dataName = isViolin ? props.__violinData : props.__boxData;
  if (typeof dataName !== "string" || !dataName) return props;
  const sel = (ctx.state?.__sel ?? {}) as { n?: unknown; keys?: unknown };
  const n = Number(sel.n ?? 0);
  if (!(n > 0)) return props;
  const brush = (ctx.state?.__brush ?? {}) as { frame?: unknown };
  const ownFrame = props.frame ?? props.__violinFrame ?? props.__boxFrame;
  if (brush.frame != null && String(brush.frame) === String(ownFrame ?? "")) return props;
  const key = isViolin ? props.__violinKey : props.__boxKey;
  const xField = String((isViolin ? props.__violinXField : props.__boxXField) ?? "");
  const yField = String((isViolin ? props.__violinYField : props.__boxYField) ?? "");
  const cats = asKeys(isViolin ? props.__violinCats : props.__boxCats);
  const rows = ctx.data?.[dataName];
  const values = filterSummaryValues(rows, key, xField, yField, cats, asKeys(sel.keys));
  if (!values.length) return { ...props, visible: false };
  if (isViolin) return applyViolinSummary(props, values);
  const stats = boxStats(values);
  if (!stats) return { ...props, visible: false };
  const part = String(props.__boxPart ?? (props.__chartBox ? "body" : ""));
  const next: Record<string, unknown> = { ...props, visible: true };
  if (part === "body" || props.__chartBox) {
    next.q1 = stats.q1;
    next.y = stats.q3;
  } else if (part === "whisk") {
    next.y1 = stats.whiskLo;
    next.y2 = stats.whiskHi;
  } else if (part === "med") {
    next.y1 = stats.med;
    next.y2 = stats.med;
  } else if (part === "out") {
    const y = Number(props.y);
    const lo = stats.q1 - 1.5 * (stats.q3 - stats.q1);
    const hi = stats.q3 + 1.5 * (stats.q3 - stats.q1);
    next.visible = Number.isFinite(y) && (y < lo || y > hi) && values.includes(y);
  }
  return next;
}

function applyViolinSummary(
  props: Record<string, unknown>,
  values: number[],
): Record<string, unknown> {
  const part = String(props.__violinPart ?? (props.d != null ? "shape" : "med"));
  const next: Record<string, unknown> = { ...props, visible: true };
  if (part === "med") {
    const sorted = [...values].sort((a, b) => a - b);
    const med = quantile(sorted, 0.5);
    next.y1 = med;
    next.y2 = med;
    return next;
  }
  if (part !== "shape") return next;
  const cx = Number(props.__violinCx);
  const ymin = Number(props.__violinYmin);
  const ymax = Number(props.__violinYmax);
  const py0 = Number(props.__violinPy0);
  const py1 = Number(props.__violinPy1);
  const half = Number(props.__violinHalf);
  const yScale = String(props.__violinYScale ?? "linear");
  if (![cx, ymin, ymax, py0, py1, half].every(Number.isFinite)) return next;
  const dens = gaussianKDE(values, ymin, ymax, 48);
  next.d = violinPathD(cx, dens, ymin, ymax, py0, py1, yScale, half);
  return next;
}
