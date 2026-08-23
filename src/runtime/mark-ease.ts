/** Default fade/scale for selection and highlight. No new language keywords — Runtime only. */
export const MARK_EASE_MS = 220;
export const MARK_EASE_CURVE = "cubic-bezier(0.22, 1, 0.36, 1)";
export const MARK_HIGHLIGHT_SCALE = 1.18;

export type MarkPaint = {
  display: string;
  opacity: number;
  pointerEvents: string;
  hideAfterMs: number | null;
  transform: string;
  transition: string;
};

/** Map IR visible+opacity+scale onto a paintable state that can ease instead of popping. */
export function markPaintState(visible: boolean, opacity: number, scale = 1): MarkPaint {
  const alpha = visible ? opacity : 0;
  const s = visible && Number.isFinite(scale) && scale > 0 ? scale : 1;
  return {
    display: "",
    opacity: alpha,
    pointerEvents: visible ? "" : "none",
    hideAfterMs: visible ? null : MARK_EASE_MS,
    transform: s === 1 ? "none" : `scale(${s})`,
    transition: `opacity ${MARK_EASE_MS}ms ${MARK_EASE_CURVE}, transform ${MARK_EASE_MS}ms ${MARK_EASE_CURVE}`,
  };
}

export type MarkPaintEl = {
  style: {
    transition: string;
    transformBox: string;
    transformOrigin: string;
    transform: string;
    pointerEvents: string;
    display: string;
    opacity: string;
  };
  setAttribute(name: string, value: string): void;
};

export const MARK_GEOM_KEYS = ["x", "y", "w", "h", "width", "height", "x1", "y1", "x2", "y2", "r", "q1"] as const;

export type GeomTween = {
  t0: number;
  from: Record<string, number>;
  to: Record<string, number>;
};

export type PathTween = {
  t0: number;
  from: string;
  to: string;
};

function pathNumRe(): RegExp {
  return /[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g;
}

function pathCommands(d: string): string {
  return d.replace(pathNumRe(), "#");
}

function pathNumbers(d: string): number[] {
  return [...d.matchAll(pathNumRe())].map((m) => Number(m[0]));
}

/** Lerp matching SVG path numbers. Different command skeletons snap. Not a morpher. */
export function lerpPathD(from: string, to: string, t: number): string | null {
  if (from === to) return to;
  if (pathCommands(from) !== pathCommands(to)) return null;
  const a = pathNumbers(from);
  const b = pathNumbers(to);
  if (a.length !== b.length || !a.length) return null;
  let i = 0;
  return from.replace(pathNumRe(), () => {
    const av = a[i] ?? 0;
    const bv = b[i] ?? av;
    i += 1;
    const v = av + (bv - av) * t;
    if (Number.isInteger(v)) return String(v);
    return String(Math.round(v * 100) / 100);
  });
}

/** Lerp a violin (or same-skeleton) path `d` over the 220ms window. Not a timeline. */
export function samplePathEase(
  shown: string | undefined,
  target: string,
  now: number,
  running: PathTween | undefined,
  duration = MARK_EASE_MS,
): { value: string; running?: PathTween } {
  if (!target) return { value: target };
  if (!shown) return { value: target };
  const retarget = !running || running.to !== target;
  const from = retarget ? shown : running.from;
  const to = retarget ? target : running.to;
  const t0 = retarget ? now : running.t0;
  if (from === to) return { value: to };
  const u = duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - t0) / duration));
  const e = easeOutCubic(u);
  const mixed = lerpPathD(from, to, e);
  if (mixed == null) return { value: to };
  if (u >= 1) return { value: to };
  return { value: mixed, running: { t0, from, to } };
}

export function isSummaryMark(props: Record<string, unknown>): boolean {
  return Boolean(props.__boxData || props.__violinData || props.__lineData);
}

export function pickGeom(props: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of MARK_GEOM_KEYS) {
    const value = props[key];
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
  }
  return out;
}

export function geomChanged(a: Record<string, number>, b: Record<string, number>, eps = 0.05): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (Math.abs((a[key] ?? 0) - (b[key] ?? 0)) > eps) return true;
  }
  return false;
}

export function easeOutCubic(t: number): number {
  const u = 1 - Math.min(1, Math.max(0, t));
  return 1 - u * u * u;
}

/** Lerp summary mark geom toward the latest __sel layout. Not a timeline. */
export function sampleGeomEase(
  shown: Record<string, number> | undefined,
  target: Record<string, number>,
  now: number,
  running: GeomTween | undefined,
  duration = MARK_EASE_MS,
): { values: Record<string, number>; running?: GeomTween } {
  if (!shown || !Object.keys(target).length) return { values: { ...target } };
  const retarget = !running || geomChanged(running.to, target);
  const from = retarget ? shown : running.from;
  const to = retarget ? target : running.to;
  const t0 = retarget ? now : running.t0;
  if (!geomChanged(from, to)) return { values: { ...to } };
  const u = duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - t0) / duration));
  const e = easeOutCubic(u);
  const values: Record<string, number> = { ...to };
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const key of keys) {
    const a = from[key] ?? to[key] ?? 0;
    const b = to[key] ?? from[key] ?? 0;
    values[key] = a + (b - a) * e;
  }
  if (u >= 1) return { values: { ...to } };
  return { values, running: { t0, from, to } };
}

/** Write CSS opacity/transform so the 220ms ease actually runs. SVG attr alone does not. */
export function applyMarkPaintCss(el: MarkPaintEl, paint: MarkPaint): void {
  el.style.transition = paint.transition;
  el.style.transformBox = "fill-box";
  el.style.transformOrigin = "center";
  el.style.transform = paint.transform;
  el.style.pointerEvents = paint.pointerEvents || "auto";
  el.style.display = paint.display;
  el.style.opacity = String(paint.opacity);
  el.setAttribute("opacity", String(paint.opacity));
}
