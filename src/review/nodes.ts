import { withIrStyleContext } from "../check/style-context.js";
import { evaluate, truthy, type Scope } from "../eval.js";
import type { Expr } from "../ast.js";
import type { SceneNodeIR, VisualIR } from "../ir.js";
import { propsToBBox } from "../layout/node-bbox.js";
import { applyFrameToProps, layoutChartGeom, prepareChartGeom, scalesFromFrameProps } from "../space.js";
import { evalSceneProps, scaleSceneGeom, sceneScaleOf } from "../space/scene-box.js";
import type { SelectedNode } from "./types.js";

/** Headless catalog of selectable nodes from IR (matches runtime flatten ids). */
export function listSelectableNodes(ir: VisualIR): SelectedNode[] {
  return withIrStyleContext(ir, () => listSelectableNodesInner(ir));
}

function listSelectableNodesInner(ir: VisualIR): SelectedNode[] {
  const state = { ...(ir.state as Record<string, unknown>) };
  const data = { ...(ir.data as Record<string, unknown>) };
  const scopes = (): Scope[] => [state, data];
  const sceneScale = sceneScaleOf(evalSceneProps(ir.scene.props, scopes()));
  const scales = (ir.frames ?? []).map((f) =>
    scalesFromFrameProps(f.name, evalProps(f.props, scopes()), sceneScale),
  );
  const out: SelectedNode[] = [];
  for (const layer of ir.scene.layers) {
    walk(layer.items, scopes(), out, layer.name, layer.id, layer.name, scales, sceneScale);
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
  sceneScale: number,
): void {
  for (const item of items) {
    if (item.kind === "node") {
      const raw = scaleSceneGeom(
        prepareChartGeom(evalProps(item.props, scopes), {
          data: scopes[1] as Record<string, unknown>,
          state: scopes[0] as Record<string, unknown>,
        }),
        sceneScale,
      );
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
        walk(item.body, scopes, out, `${prefix}:${item.id}`, layerId, layerName, scales, sceneScale);
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
        sceneScale,
      );
    });
  }
}

function evalProps(exprs: Record<string, Expr>, scopes: Scope[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(exprs)) out[k] = evaluate(v, scopes);
  return out;
}
