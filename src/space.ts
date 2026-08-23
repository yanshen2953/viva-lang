import type { Expr } from "./ast.js";
import { binary, ident, literal } from "./ast.js";
import type { Span } from "./diagnostics.js";

/** Linear: data domain → scene coordinate. */
export function linearMap(
  value: number,
  domain: [number, number],
  range: [number, number],
  invert = false,
): number {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const t = d1 === d0 ? 0 : (value - d0) / (d1 - d0);
  const mapped = r0 + t * (r1 - r0);
  if (!invert) return mapped;
  return r0 + r1 - mapped;
}

export function asPair(value: unknown, fallback: [number, number]): [number, number] {
  if (Array.isArray(value) && value.length >= 2) {
    return [Number(value[0]) || 0, Number(value[1]) || 0];
  }
  if (typeof value === "number") return [0, value];
  return fallback;
}

export type ScaleKind = "linear" | "log";

export type FrameScales = {
  name: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  xScale: ScaleKind;
  yScale: ScaleKind;
};

function scaleKind(value: unknown): ScaleKind {
  const raw = String(value ?? "linear").toLowerCase();
  return raw === "log" || raw === "logarithmic" ? "log" : "linear";
}

export function domainMap(
  value: number,
  domain: [number, number],
  range: [number, number],
  invert = false,
  kind: ScaleKind = "linear",
): number {
  if (kind === "log") {
    const d0 = Math.log(Math.max(domain[0], 1e-12));
    const d1 = Math.log(Math.max(domain[1], 1e-12));
    const v = Math.log(Math.max(value, 1e-12));
    return linearMap(v, [d0, d1], range, invert);
  }
  return linearMap(value, domain, range, invert);
}

export function scalesFromFrameProps(
  name: string,
  props: Record<string, unknown>,
  sceneScale = 1,
): FrameScales {
  const [x0, x1] = asPair(props.x ?? props.areaX, [72, 520]);
  const [y0, y1] = asPair(props.y ?? props.areaY, [64, 400]);
  const [xmin, xmax] = asPair(props.xlim, [0, 1]);
  const [ymin, ymax] = asPair(props.ylim, [0, 1]);
  return {
    name,
    x0: x0 * sceneScale,
    x1: x1 * sceneScale,
    y0: y0 * sceneScale,
    y1: y1 * sceneScale,
    xmin,
    xmax,
    ymin,
    ymax,
    xScale: scaleKind(props.xScale ?? props.xscale),
    yScale: scaleKind(props.yScale ?? props.yscale),
  };
}

/** Map data-domain props into scene space when `frame` is set. */
export function applyFrameToProps(
  props: Record<string, unknown>,
  frames: FrameScales[],
): Record<string, unknown> {
  const frameRef = props.frame;
  if (frameRef === undefined || frameRef === null) return props;
  const name = String(frameRef);
  const frame = frames.find((f) => f.name === name);
  if (!frame) return props;

  const mapX = (v: number) =>
    domainMap(v, [frame.xmin, frame.xmax], [frame.x0, frame.x1], false, frame.xScale);
  const mapY = (v: number) =>
    domainMap(v, [frame.ymin, frame.ymax], [frame.y0, frame.y1], true, frame.yScale);

  const next = { ...props };
  if (typeof next.x === "number") next.x = mapX(next.x);
  if (typeof next.y === "number") next.y = mapY(next.y);
  if (typeof next.x1 === "number") next.x1 = mapX(next.x1);
  if (typeof next.y1 === "number") next.y1 = mapY(next.y1);
  if (typeof next.x2 === "number") next.x2 = mapX(next.x2);
  if (typeof next.y2 === "number") next.y2 = mapY(next.y2);
  return next;
}

/** Build Expr: range0 + (value - d0) / (d1 - d0) * (range1 - range0) */
export function scaleExpr(
  value: Expr,
  d0: Expr,
  d1: Expr,
  r0: Expr,
  r1: Expr,
  invertY: boolean,
  span: Span,
): Expr {
  const t = binary(
    "/",
    binary("-", value, d0, span),
    binary("-", d1, d0, span),
    span,
  );
  const spanRange = binary("-", r1, r0, span);
  const mapped = binary("+", r0, binary("*", t, spanRange, span), span);
  if (!invertY) return mapped;
  return binary("-", binary("+", r0, r1, span), mapped, span);
}

export function fieldIdent(row: string, field: string, span: Span): Expr {
  return ident(`${row}.${field}`, span);
}

/**
 * Chart bars: after frame maps x/y to scene, convert center/value into a
 * scene-space rect sitting on the frame baseline. Shared by runtime + static SVG.
 */
/** Shared post-frame layout for chart macros (bars + heat cells). */
export function layoutChartGeom(
  props: Record<string, unknown>,
  frames: FrameScales[],
): Record<string, unknown> {
  if (props.__chartBar) return layoutChartBar(props, frames);
  if (props.__chartHeat) return layoutChartHeat(props, frames);
  return props;
}

export function layoutChartBar(
  props: Record<string, unknown>,
  frames: FrameScales[],
): Record<string, unknown> {
  if (!props.__chartBar) return props;
  const frameName = props.frame !== undefined ? String(props.frame) : "";
  const frame = frames.find((f) => f.name === frameName);
  if (!frame) return props;

  const dataX = typeof props.x === "number" ? props.x : 0;
  const dataYTop = typeof props.y === "number" ? props.y : 0;
  const barWData = typeof props.w === "number" ? props.w : Number(props.w) || 0.6;
  const sceneW = Math.abs(
    linearMap(barWData, [0, frame.xmax - frame.xmin], [0, frame.x1 - frame.x0], false),
  );
  const baseline = linearMap(frame.ymin, [frame.ymin, frame.ymax], [frame.y0, frame.y1], true);
  const top = dataYTop;
  const height = Math.max(0, baseline - top);
  return {
    ...props,
    x: dataX - sceneW / 2,
    y: top,
    w: sceneW,
    h: height,
  };
}

/** Heat cell: x/y already scene-mapped (cell center); w/h still data units. */
export function layoutChartHeat(
  props: Record<string, unknown>,
  frames: FrameScales[],
): Record<string, unknown> {
  if (!props.__chartHeat) return props;
  const frameName = props.frame !== undefined ? String(props.frame) : "";
  const frame = frames.find((f) => f.name === frameName);
  if (!frame) return props;
  const cx = typeof props.x === "number" ? props.x : 0;
  const cy = typeof props.y === "number" ? props.y : 0;
  const wData = typeof props.w === "number" ? props.w : 1;
  const hData = typeof props.h === "number" ? props.h : 1;
  const sceneW = Math.abs(
    linearMap(wData, [0, frame.xmax - frame.xmin], [0, frame.x1 - frame.x0], false),
  );
  const sceneH = Math.abs(
    linearMap(hData, [0, frame.ymax - frame.ymin], [0, frame.y1 - frame.y0], false),
  );
  return {
    ...props,
    x: cx - sceneW / 2,
    y: cy - sceneH / 2,
    w: Math.max(1, sceneW - 1),
    h: Math.max(1, sceneH - 1),
  };
}

export { literal, ident, binary };
