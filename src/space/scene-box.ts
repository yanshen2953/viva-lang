import type { Expr } from "../ast.js";
import { evaluate, type Scope } from "../eval.js";
import { DEFAULT_SCENE_BACKGROUND } from "../style/defaults.js";

export type SceneUnit = "px" | "mm" | "pt";

export const MM_PER_IN = 25.4;
export const CSS_PX_PER_IN = 96;
export const PDF_PT_PER_IN = 72;
export const COLUMN_MM = { single: 89, double: 183 } as const;

export type SceneBox = {
  width: number;
  height: number;
  background: string;
  unit: SceneUnit;
  column?: "single" | "double";
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
const SCENE_META_KEYS = ["unit", "column"] as const;

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
  if (column && sceneProps.width === undefined && !Array.isArray(sceneProps.size)) {
    width = COLUMN_MM[column];
  }

  return {
    width: toPx(width, unit),
    height: toPx(height, unit),
    background: str(sceneProps.background, defaults?.background ?? DEFAULT_SCENE_BACKGROUND),
    unit,
    column,
  };
}
