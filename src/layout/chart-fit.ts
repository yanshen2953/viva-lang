/** Park a lone chart in leftover scene space. Not a general packer. */

import type { Artifact, Expr, SceneItem } from "../ast.js";
import { evaluate, type Scope } from "../eval.js";
import { estimateTextWidthPx } from "./chrome-collide.js";

export type FitRect = { x: number; y: number; w: number; h: number };

export function inflateRect(rect: FitRect, pad: number): FitRect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    w: rect.w + pad * 2,
    h: rect.h + pad * 2,
  };
}

export function rectsIntersect(a: FitRect, b: FitRect, eps = 1e-6): boolean {
  return (
    a.x < b.x + b.w - eps &&
    a.x + a.w > b.x + eps &&
    a.y < b.y + b.h - eps &&
    a.y + a.h > b.y + eps
  );
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values.map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b);
}

/**
 * Largest axis-aligned empty rectangle inside `scene` after subtracting obstacles.
 * Falls back to the full scene when leftover is too small.
 */
export function largestEmptyRect(
  scene: FitRect,
  obstacles: FitRect[],
  opts?: { pad?: number; minW?: number; minH?: number },
): FitRect {
  const pad = opts?.pad ?? 0;
  const minW = opts?.minW ?? 8;
  const minH = opts?.minH ?? 8;
  const blocked = obstacles
    .map((rect) => inflateRect(rect, pad))
    .filter((rect) => rect.w > 0 && rect.h > 0 && rectsIntersect(scene, rect));
  if (!blocked.length) return { ...scene };

  const xs = uniqueSorted([
    scene.x,
    scene.x + scene.w,
    ...blocked.flatMap((rect) => [rect.x, rect.x + rect.w]),
  ]).filter((x) => x >= scene.x - 1e-6 && x <= scene.x + scene.w + 1e-6);
  const ys = uniqueSorted([
    scene.y,
    scene.y + scene.h,
    ...blocked.flatMap((rect) => [rect.y, rect.y + rect.h]),
  ]).filter((y) => y >= scene.y - 1e-6 && y <= scene.y + scene.h + 1e-6);

  let best: FitRect | null = null;
  let bestArea = 0;
  for (let i = 0; i < xs.length; i++) {
    for (let j = i + 1; j < xs.length; j++) {
      for (let k = 0; k < ys.length; k++) {
        for (let l = k + 1; l < ys.length; l++) {
          const cand: FitRect = {
            x: xs[i]!,
            y: ys[k]!,
            w: xs[j]! - xs[i]!,
            h: ys[l]! - ys[k]!,
          };
          if (cand.w < minW || cand.h < minH) continue;
          if (blocked.some((rect) => rectsIntersect(cand, rect))) continue;
          const area = cand.w * cand.h;
          if (area > bestArea) {
            best = cand;
            bestArea = area;
          }
        }
      }
    }
  }
  if (!best || bestArea < minW * minH) return { ...scene };
  return best;
}

function numOf(expr: Expr | undefined, scopes: Scope[]): number | null {
  if (!expr) return null;
  const value = evaluate(expr, scopes);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function textOf(expr: Expr | undefined, scopes: Scope[]): string {
  if (!expr) return "";
  const value = evaluate(expr, scopes);
  return value === null || value === undefined ? "" : String(value);
}

function pairOf(expr: Expr | undefined): [number, number] | null {
  if (expr?.kind !== "array" || expr.items.length < 2) return null;
  const a = expr.items[0]?.kind === "number" ? expr.items[0].value : null;
  const b = expr.items[1]?.kind === "number" ? expr.items[1].value : null;
  if (a === null || b === null) return null;
  return [a, b];
}

function authorScopes(artifact: Artifact): Scope[] {
  const state: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};
  const scopes: Scope[] = [state, data];
  for (const decl of artifact.states) state[decl.name] = evaluate(decl.value, scopes);
  for (const decl of artifact.data) data[decl.name] = evaluate(decl.value, scopes);
  return scopes;
}

function walkAuthorNodes(items: SceneItem[], out: Extract<SceneItem, { kind: "node" }>[]): void {
  for (const item of items) {
    if (item.kind === "node") out.push(item);
    else if (item.kind === "if") walkAuthorNodes(item.body, out);
  }
}

const SKIP_ROLES = new Set(["atmosphere", "backdrop", "grid"]);

function roleOf(node: Extract<SceneItem, { kind: "node" }>): string {
  const expr = node.props.role;
  if (expr?.kind === "string") return expr.value;
  if (expr?.kind === "ident") return expr.path.join(".");
  return "";
}

function nodeObstacle(
  node: Extract<SceneItem, { kind: "node" }>,
  scopes: Scope[],
  toScene: (px: number) => number,
): FitRect | null {
  if (node.props.frame) return null;
  if (SKIP_ROLES.has(roleOf(node))) return null;
  const x = numOf(node.props.x, scopes);
  const y = numOf(node.props.y, scopes);
  const r = numOf(node.props.r ?? node.props.size, scopes);
  const w = numOf(node.props.w ?? node.props.width, scopes);
  const h = numOf(node.props.h ?? node.props.height, scopes);
  if (r !== null && r > 0 && x !== null && y !== null) {
    return { x: x - r, y: y - r, w: r * 2, h: r * 2 };
  }
  if (x !== null && y !== null && w !== null && h !== null) {
    return { x, y, w, h };
  }
  const x1 = numOf(node.props.x1, scopes);
  const y1 = numOf(node.props.y1, scopes);
  const x2 = numOf(node.props.x2, scopes);
  const y2 = numOf(node.props.y2, scopes);
  if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.max(1, Math.abs(x2 - x1)),
      h: Math.max(1, Math.abs(y2 - y1)),
    };
  }
  if (x !== null && y !== null && (node.props.text || node.props.label)) {
    const font = numOf(node.props.font, scopes) ?? 12;
    const label = textOf(node.props.text ?? node.props.label, scopes);
    const tw = toScene(estimateTextWidthPx(label, font, 0.08));
    return { x, y: y - font, w: Math.max(toScene(8), tw), h: font + toScene(4) };
  }
  return null;
}

/** Author frames and scene-space nodes. Skips widget `__` chrome. */
export function collectAuthorObstacles(
  artifact: Artifact,
  opts?: { toScene?: (px: number) => number },
): FitRect[] {
  const scopes = authorScopes(artifact);
  const toScene = opts?.toScene ?? ((px: number) => px);
  const out: FitRect[] = [];
  for (const frame of artifact.frames) {
    if (frame.name.startsWith("__")) continue;
    const xs = pairOf(frame.props.x ?? frame.props.areaX);
    const ys = pairOf(frame.props.y ?? frame.props.areaY);
    if (!xs || !ys) continue;
    out.push({
      x: Math.min(xs[0], xs[1]),
      y: Math.min(ys[0], ys[1]),
      w: Math.abs(xs[1] - xs[0]),
      h: Math.abs(ys[1] - ys[0]),
    });
  }
  for (const layer of artifact.scene?.layers ?? []) {
    if (layer.name.startsWith("__")) continue;
    const nodes: Extract<SceneItem, { kind: "node" }>[] = [];
    walkAuthorNodes(layer.items, nodes);
    for (const node of nodes) {
      const box = nodeObstacle(node, scopes, toScene);
      if (box) out.push(box);
    }
  }
  return out;
}

export function chartHostBox(
  artifact: Artifact,
  scene: { w: number; h: number },
  unit: string,
): FitRect {
  const compact = unit === "mm" || unit === "pt";
  const pad = compact ? 2.4 : 10;
  const minW = compact ? 24 : 64;
  const minH = compact ? 20 : 64;
  const toScene = compact ? (px: number) => px / (96 / 25.4) : (px: number) => px;
  const sceneBox = { x: 0, y: 0, w: scene.w, h: scene.h };
  const area = Math.max(1, scene.w * scene.h);
  const obstacles = collectAuthorObstacles(artifact, { toScene }).filter(
    (rect) => rect.w * rect.h < area * 0.7,
  );
  return largestEmptyRect(sceneBox, obstacles, {
    pad,
    minW,
    minH,
  });
}
