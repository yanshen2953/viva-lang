import { withIrStyleContext } from "../check/style-context.js";
import { evaluate, truthy, type Scope } from "../eval.js";
import type { Expr } from "../ast.js";
import type { SceneNodeIR, VisualIR } from "../ir.js";
import { applyFrameToProps, layoutChartGeom, prepareChartGeom, scalesFromFrameProps } from "../space.js";
import type { SelectedNode } from "./types.js";
import type { BBox } from "./geometry.js";

/** Headless catalog of selectable nodes from IR (matches runtime flatten ids). */
export function listSelectableNodes(ir: VisualIR): SelectedNode[] {
  return withIrStyleContext(ir, () => listSelectableNodesInner(ir));
}

function listSelectableNodesInner(ir: VisualIR): SelectedNode[] {
  const state = { ...(ir.state as Record<string, unknown>) };
  const data = { ...(ir.data as Record<string, unknown>) };
  const scopes = (): Scope[] => [state, data];
  const scales = (ir.frames ?? []).map((f) =>
    scalesFromFrameProps(f.name, evalProps(f.props, scopes())),
  );
  const out: SelectedNode[] = [];
  for (const layer of ir.scene.layers) {
    walk(layer.items, scopes(), out, layer.name, layer.id, layer.name, scales);
  }
  return out;
}

function walk(
  items: SceneNodeIR[],
  scopes: Scope[],
  out: SelectedNode[],
  prefix: string,
  layerId: string,
  layerName: string,
  scales: ReturnType<typeof scalesFromFrameProps>[],
): void {
  for (const item of items) {
    if (item.kind === "node") {
      const raw = prepareChartGeom(evalProps(item.props, scopes), {
        data: scopes[1] as Record<string, unknown>,
        state: scopes[0] as Record<string, unknown>,
      });
      const framed = applyFrameToProps(raw, scales);
      const props = layoutChartGeom(framed, scales);
      const id = `${prefix}:${item.id}`;
      out.push({
        id,
        name: item.name,
        group: item.group,
        layerId,
        layerName,
        bbox: propsToBBox(props),
      });
      continue;
    }
    if (item.kind === "if") {
      if (truthy(evaluate(item.cond, scopes))) {
        walk(item.body, scopes, out, `${prefix}:${item.id}`, layerId, layerName, scales);
      }
      continue;
    }
    const source = evaluate(item.source, scopes);
    const list = Array.isArray(source) ? source : [];
    list.forEach((entry, index) => {
      walk(
        item.body,
        [{ [item.item]: entry }, ...scopes],
        out,
        `${prefix}:${item.id}:${index}`,
        layerId,
        layerName,
        scales,
      );
    });
  }
}

function propsToBBox(p: Record<string, unknown>): BBox {
  const x = num(p.x);
  const y = num(p.y);
  if (p.r !== undefined || (p.size !== undefined && p.w === undefined && p.width === undefined && p.text === undefined && p.label === undefined)) {
    const r = num(p.r ?? p.size, 16);
    return { x: x - r, y: y - r, w: r * 2, h: r * 2 };
  }
  if (p.w !== undefined || p.width !== undefined || p.h !== undefined || p.height !== undefined) {
    return { x, y, w: num(p.w ?? p.width, 80), h: num(p.h ?? p.height, 24) };
  }
  if (p.x1 !== undefined) {
    const x1 = num(p.x1);
    const y1 = num(p.y1);
    const x2 = num(p.x2, x1 + 40);
    const y2 = num(p.y2, y1);
    return {
      x: Math.min(x1, x2),
      y: Math.min(y1, y2),
      w: Math.abs(x2 - x1) || 1,
      h: Math.abs(y2 - y1) || 1,
    };
  }
  if (p.text !== undefined || p.label !== undefined || p.font !== undefined || p.fontSize !== undefined) {
    const text = String(p.text ?? p.label ?? "");
    const font = num(p.font ?? p.fontSize, 14);
    const w = Math.max(font * Math.max(text.length, 1) * 0.6, font * 2);
    const h = font * 1.4;
    const align = String(p.align ?? "start");
    const left =
      align === "center" || align === "middle"
        ? x - w / 2
        : align === "right" || align === "end"
          ? x - w
          : x;
    return { x: left, y: y - font * 0.85, w, h };
  }
  return { x: x - 4, y: y - 4, w: 8, h: 8 };
}

function evalProps(exprs: Record<string, Expr>, scopes: Scope[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(exprs)) out[k] = evaluate(v, scopes);
  return out;
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
