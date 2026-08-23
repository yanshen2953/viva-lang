/** Recompute box summaries from __sel rows. Not a query engine. */

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
  const dataName = props.__boxData;
  if (typeof dataName !== "string" || !dataName) return props;
  const sel = (ctx.state?.__sel ?? {}) as { n?: unknown; keys?: unknown };
  const n = Number(sel.n ?? 0);
  if (!(n > 0)) return props;
  const brush = (ctx.state?.__brush ?? {}) as { frame?: unknown };
  if (brush.frame != null && String(brush.frame) === String(props.frame ?? "")) return props;
  const rows = ctx.data?.[dataName];
  const values = filterSummaryValues(
    rows,
    props.__boxKey,
    String(props.__boxXField ?? ""),
    String(props.__boxYField ?? ""),
    asKeys(props.__boxCats),
    asKeys(sel.keys),
  );
  if (!values.length) return { ...props, visible: false };
  const stats = boxStats(values);
  if (!stats) return { ...props, visible: false };
  const part = String(props.__boxPart ?? (props.__chartBox ? "body" : ""));
  const next = { ...props, visible: true };
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
