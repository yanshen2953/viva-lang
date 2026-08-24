import type { Expr } from "./ast.js";
import { binary, ident, literal } from "./ast.js";
import type { Span } from "./diagnostics.js";
import { applySelSummary, type SummaryCtx } from "./layout/summary-stats.js";

export type { SummaryCtx };

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

export type ScaleKind = "linear" | "log" | "band" | "time";

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
  xCats: string[];
  yCats: string[];
  invertY: boolean;
};

export function scaleKind(value: unknown): ScaleKind {
  const raw = String(value ?? "linear").toLowerCase();
  if (raw === "log" || raw === "logarithmic") return "log";
  if (raw === "band" || raw === "category" || raw === "categorical" || raw === "ordinal") {
    return "band";
  }
  if (raw === "time" || raw === "temporal" || raw === "date") return "time";
  return "linear";
}

/** Parse year / ISO / unix ms into a numeric domain value. */
export function parseTimeValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (/^\d{4}$/.test(raw)) return Number(raw);
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

export function catsFrom(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string" && value.trim()) {
    return value.split(/[,|]/).map((part) => part.trim()).filter(Boolean);
  }
  return [];
}

/** Map a data value (number or category label) onto the numeric domain. */
export function categoryIndex(value: unknown, cats: string[]): number | null {
  if (!cats.length) return null;
  if (typeof value === "string") {
    const i = cats.indexOf(value);
    return i >= 0 ? i : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const labeled = cats.indexOf(String(value));
    if (labeled >= 0) return labeled;
    if (Number.isInteger(value) && value >= 0 && value < cats.length) return value;
  }
  return null;
}

export function domainValue(value: unknown, cats: string[] = []): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const labeled = cats.length ? categoryIndex(value, cats) : null;
    return labeled === null ? value : labeled;
  }
  const idx = categoryIndex(value, cats);
  return idx;
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

/** Inverse of domainMap: scene coordinate → data domain. */
export function domainUnmap(
  scene: number,
  domain: [number, number],
  range: [number, number],
  invert = false,
  kind: ScaleKind = "linear",
): number {
  const mapped = invert ? range[0] + range[1] - scene : scene;
  if (kind === "log") {
    const d0 = Math.log(Math.max(domain[0], 1e-12));
    const d1 = Math.log(Math.max(domain[1], 1e-12));
    const v = linearMap(mapped, range, [d0, d1], false);
    return Math.exp(v);
  }
  return linearMap(mapped, range, domain, false);
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
    xCats: catsFrom(props.xCats ?? props.xcats ?? props.categories),
    yCats: catsFrom(props.yCats ?? props.ycats),
    invertY: yInvertFrom(props),
  };
}

function yInvertFrom(props: Record<string, unknown>): boolean {
  const raw = props.yInvert ?? props.invertY;
  if (raw === false || raw === 0 || raw === "false") return false;
  return true;
}

function mapFrameX(frame: FrameScales, value: unknown): number | null {
  const v = domainValue(value, frame.xCats);
  if (v === null) return null;
  return domainMap(v, [frame.xmin, frame.xmax], [frame.x0, frame.x1], false, frame.xScale);
}

function mapFrameY(frame: FrameScales, value: unknown): number | null {
  const v = domainValue(value, frame.yCats);
  if (v === null) return null;
  return domainMap(v, [frame.ymin, frame.ymax], [frame.y0, frame.y1], frame.invertY, frame.yScale);
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

  const next = { ...props };
  const apply = (key: string, mapper: (value: unknown) => number | null) => {
    if (!(key in next) || next[key] === undefined || next[key] === null) return;
    const mapped = mapper(next[key]);
    if (mapped !== null) next[key] = mapped;
  };
  apply("x", (v) => mapFrameX(frame, v));
  apply("y", (v) => mapFrameY(frame, v));
  apply("x1", (v) => mapFrameX(frame, v));
  apply("y1", (v) => mapFrameY(frame, v));
  apply("x2", (v) => mapFrameX(frame, v));
  apply("y2", (v) => mapFrameY(frame, v));
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
  if (props.__chartBox) return layoutChartBox(props, frames);
  if (props.__chartHeat) return layoutChartHeat(props, frames);
  if (props.__chartVec || props.__chartVecShaft) return layoutChartVector(props);
  return props;
}

/** Apply __sel row filters in data domain, before frame mapping. */
export function prepareChartGeom(
  props: Record<string, unknown>,
  ctx?: SummaryCtx,
): Record<string, unknown> {
  return ctx ? applySelSummary(props, ctx) : props;
}

/** Box body: x/y already scene-mapped (center / q3); h still data (q3-q1). */
export function layoutChartBox(
  props: Record<string, unknown>,
  frames: FrameScales[],
): Record<string, unknown> {
  if (!props.__chartBox) return props;
  const frameName = props.frame !== undefined ? String(props.frame) : "";
  const frame = frames.find((f) => f.name === frameName);
  if (!frame) return props;
  const cx = typeof props.x === "number" ? props.x : 0;
  const top = typeof props.y === "number" ? props.y : 0;
  const q1 = typeof props.q1 === "number" ? props.q1 : 0;
  const bot = domainMap(q1, [frame.ymin, frame.ymax], [frame.y0, frame.y1], true, frame.yScale);
  const boxW = typeof props.w === "number" ? props.w : 0.45;
  const sceneW = Math.abs(
    linearMap(boxW, [0, frame.xmax - frame.xmin], [0, frame.x1 - frame.x0], false),
  );
  return {
    ...props,
    x: cx - sceneW / 2,
    y: Math.min(top, bot),
    w: sceneW,
    h: Math.max(1, Math.abs(bot - top)),
  };
}

export function layoutChartBar(
  props: Record<string, unknown>,
  frames: FrameScales[],
): Record<string, unknown> {
  if (!props.__chartBar) return props;
  const frameName = props.frame !== undefined ? String(props.frame) : "";
  const frame = frames.find((f) => f.name === frameName);
  if (!frame) return props;

  const orient = String(props.__chartBarOrient ?? props.orient ?? "v").toLowerCase();
  if (orient === "h" || orient === "horizontal") {
    const right = typeof props.x === "number" ? props.x : 0;
    const cy = typeof props.y === "number" ? props.y : 0;
    const barHData = typeof props.h === "number" ? props.h : Number(props.w) || 0.6;
    const sceneH = Math.abs(
      linearMap(barHData, [0, frame.ymax - frame.ymin], [0, frame.y1 - frame.y0], false),
    );
    const baseline = domainMap(
      frame.xmin,
      [frame.xmin, frame.xmax],
      [frame.x0, frame.x1],
      false,
      frame.xScale,
    );
    const laid = {
      ...props,
      x: Math.min(baseline, right),
      y: cy - sceneH / 2,
      w: Math.max(0, Math.abs(right - baseline)),
      h: sceneH,
    };
    if (!props.__chartFunnel) return laid;
    const nextData = typeof props.__funnelNext === "number" ? props.__funnelNext : undefined;
    const nextRight =
      nextData === undefined
        ? right
        : domainMap(nextData, [frame.xmin, frame.xmax], [frame.x0, frame.x1], false, frame.xScale);
    const y0 = laid.y;
    const y1 = laid.y + laid.h;
    return {
      ...laid,
      d: `M ${baseline} ${y0} L ${right} ${y0} L ${nextRight} ${y1} L ${baseline} ${y1} Z`,
    };
  }

  const dataX = typeof props.x === "number" ? props.x : 0;
  const dataYTop = typeof props.y === "number" ? props.y : 0;
  const barWData = typeof props.w === "number" ? props.w : Number(props.w) || 0.6;
  const sceneW = Math.abs(
    linearMap(barWData, [0, frame.xmax - frame.xmin], [0, frame.x1 - frame.x0], false),
  );
  const baseline = domainMap(
    frame.ymin,
    [frame.ymin, frame.ymax],
    [frame.y0, frame.y1],
    true,
    frame.yScale,
  );
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

/** White grout as a fraction of the shorter cell side. Not 1 scene unit. */
export const HEAT_CELL_GUTTER = 0.05;

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
  const gap = Math.min(sceneW, sceneH) * HEAT_CELL_GUTTER;
  return {
    ...props,
    x: cx - sceneW / 2 + gap / 2,
    y: cy - sceneH / 2 + gap / 2,
    w: Math.max(sceneW * 0.5, sceneW - gap),
    h: Math.max(sceneH * 0.5, sceneH - gap),
  };
}

/** Scene-space arrow after frame maps the shaft. Not a data-domain chevron. */
export function layoutChartVector(props: Record<string, unknown>): Record<string, unknown> {
  if (!props.__chartVec && !props.__chartVecShaft) return props;
  const x1 = typeof props.x1 === "number" ? props.x1 : 0;
  const y1 = typeof props.y1 === "number" ? props.y1 : 0;
  const x2 = typeof props.x2 === "number" ? props.x2 : typeof props.x === "number" ? props.x : x1;
  const y2 = typeof props.y2 === "number" ? props.y2 : typeof props.y === "number" ? props.y : y1;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) return props;
  const nx = dx / len;
  const ny = dy / len;
  const headLen = Math.min(len * 0.36, Math.max(5, len * 0.22));
  const headW = headLen * 0.42;
  const bx = x2 - nx * headLen;
  const by = y2 - ny * headLen;
  if (props.__chartVecShaft) {
    return { ...props, x2: bx, y2: by };
  }
  const px = -ny * headW;
  const py = nx * headW;
  const d = `M ${x2} ${y2} L ${bx + px} ${by + py} L ${bx - px} ${by - py} Z`;
  const fill = props.fill ?? props.stroke ?? props.color;
  return {
    ...props,
    d,
    x: x2,
    y: y2,
    ...(fill !== undefined ? { fill } : {}),
  };
}

export { literal, ident, binary };
