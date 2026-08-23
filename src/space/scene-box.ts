import type { Expr } from "../ast.js";
import { evaluate, type Scope } from "../eval.js";
import { DEFAULT_SCENE_BACKGROUND } from "../style/defaults.js";

export type SceneUnit = "px" | "mm" | "pt";

export const MM_PER_IN = 25.4;
export const CSS_PX_PER_IN = 96;
export const PDF_PT_PER_IN = 72;
export const COLUMN_MM = { single: 89, double: 183 } as const;
export const PAGE_MM = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
} as const;

export type ScenePage = { name: "a4" | "letter"; w: number; h: number };

export type SceneBox = {
  width: number;
  height: number;
  background: string;
  unit: SceneUnit;
  column?: "single" | "double";
  page?: ScenePage;
};

function num(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function asPair(value: unknown, fallback: [number, number]): [number, number] {
  if (Array.isArray(value) && value.length >= 2) {
    return [num(value[0], fallback[0]), num(value[1], fallback[1])];
  }
  if (typeof value === "string") {
    const parts = value.trim().split(/\s+/).map(Number);
    if (parts.length >= 2 && parts.every((n) => !Number.isNaN(n))) {
      return [parts[0]!, parts[1]!];
    }
  }
  if (typeof value === "number") return [0, value];
  return fallback;
}

export function mmToPx(mm: number): number {
  return (mm / MM_PER_IN) * CSS_PX_PER_IN;
}

export function sceneScaleOf(sceneProps: Record<string, unknown>): number {
  const unit = parseUnit(sceneProps.unit);
  if (unit === "mm") return mmToPx(1);
  if (unit === "pt") return CSS_PX_PER_IN / PDF_PT_PER_IN;
  return 1;
}

const SCENE_GEOM_KEYS = ["x", "y", "w", "h", "width", "height", "x1", "y1", "x2", "y2", "r", "size"] as const;

/** Scale simple path `d` numbers (M/L/C/Z). Used when `unit: mm` expands to px. */
export function scalePathD(d: string, scale: number): string {
  if (scale === 1 || !d) return d;
  return d.replace(/[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?/g, (raw) => {
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    const scaled = n * scale;
    if (Number.isInteger(scaled)) return String(scaled);
    return String(Math.round(scaled * 1000) / 1000);
  });
}

/** Scale scene-space numbers. Skip when `frame` is set (data domain). */
export function scaleSceneGeom(
  props: Record<string, unknown>,
  scale: number,
): Record<string, unknown> {
  if (scale === 1) return props;
  if (props.frame !== undefined && props.frame !== null) return props;
  const next = { ...props };
  for (const key of SCENE_GEOM_KEYS) {
    const value = next[key];
    if (typeof value === "number") next[key] = value * scale;
  }
  if (typeof next.d === "string") next.d = scalePathD(next.d, scale);
  if (typeof next.path === "string") next.path = scalePathD(next.path, scale);
  return next;
}

export function pxToPdfPt(px: number): number {
  return px * (PDF_PT_PER_IN / CSS_PX_PER_IN);
}

function parseUnit(value: unknown): SceneUnit {
  const raw = str(value, "px").toLowerCase();
  if (raw === "mm" || raw === "millimeter" || raw === "millimetre") return "mm";
  if (raw === "pt" || raw === "point") return "pt";
  return "px";
}

function toPx(value: number, unit: SceneUnit): number {
  if (unit === "mm") return mmToPx(value);
  if (unit === "pt") return value * (CSS_PX_PER_IN / PDF_PT_PER_IN);
  return value;
}

/** Resolve scene size. `unit: mm` and `column: single|double` convert into CSS px. */
const SCENE_META_KEYS = ["unit", "column", "page"] as const;

/**
 * On a paged sheet, `column` is the figure measure, not the page width.
 * A4/letter side margins match a 183 mm double-column text block.
 */
export function pageColumnMeasure(
  page: ScenePage | undefined,
  column: "single" | "double" | undefined,
): { x: number; w: number } | null {
  if (!page || (column !== "single" && column !== "double")) return null;
  const margin = Math.max(0, (page.w - COLUMN_MM.double) / 2);
  return { x: margin, w: COLUMN_MM[column] };
}

export function parsePage(value: unknown): ScenePage | undefined {
  const raw = str(value, "").toLowerCase().replace(/\s+/g, "");
  if (raw === "a4") return { name: "a4", ...PAGE_MM.a4 };
  if (raw === "letter" || raw === "usletter") return { name: "letter", ...PAGE_MM.letter };
  return undefined;
}

/** How many PDF pages a scene needs. SVG/PNG stay one tall canvas. Not a reflow. */
export function scenePageCount(box: SceneBox): number {
  if (!box.page) return 1;
  const pageH = toPx(box.page.h, "mm");
  if (!(pageH > 0)) return 1;
  return Math.max(1, Math.ceil(box.height / pageH - 1e-6));
}

export function evalSceneProps(
  exprs: Record<string, Expr>,
  scopes: Scope[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(exprs)) out[key] = evaluate(expr, scopes);
  for (const key of SCENE_META_KEYS) {
    const expr = exprs[key];
    if (expr?.kind === "ident") out[key] = expr.path.join(".");
    if (expr?.kind === "string") out[key] = expr.value;
  }
  return out;
}

export function resolveSceneBox(
  sceneProps: Record<string, unknown>,
  defaults?: { size?: [number, number]; background?: string },
): SceneBox {
  const unit = parseUnit(sceneProps.unit);
  const fallback = defaults?.size ?? [880, 480];
  let [width, height] = asPair(sceneProps.size, fallback);
  if (sceneProps.width !== undefined) width = num(sceneProps.width, width);
  if (sceneProps.height !== undefined) height = num(sceneProps.height, height);

  const columnRaw = str(sceneProps.column, "");
  const column =
    columnRaw === "single" || columnRaw === "double" ? columnRaw : undefined;
  const page = parsePage(sceneProps.page);
  const sizeExplicit = Array.isArray(sceneProps.size);
  if (page && unit === "mm") {
    if (sceneProps.width === undefined && !sizeExplicit) width = page.w;
    if (sceneProps.height === undefined && !sizeExplicit) height = page.h;
  } else if (column && sceneProps.width === undefined && !sizeExplicit) {
    width = COLUMN_MM[column];
  }

  return {
    width: toPx(width, unit),
    height: toPx(height, unit),
    background: str(sceneProps.background, defaults?.background ?? DEFAULT_SCENE_BACKGROUND),
    unit,
    column,
    page,
  };
}
