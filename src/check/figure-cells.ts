import type { VisualIR } from "../ir.js";
import { evaluate } from "../eval.js";
import { evalSceneProps, resolveSceneBox, sceneScaleOf } from "../space/scene-box.js";

export type FigureCellPx = {
  name: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

function asPair(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const a = Number(value[0]);
  const b = Number(value[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return [a, b];
}

/**
 * Figure panel boxes from IR `cellX`/`cellY`, in scene CSS px.
 * Skips full-scene fallback cells. Not a typesetter.
 */
export function figureCellsFromIr(ir: VisualIR): FigureCellPx[] {
  const scopes = [ir.state, ir.data];
  const sceneProps = evalSceneProps(ir.scene.props, scopes);
  const scale = sceneScaleOf(sceneProps);
  const box = resolveSceneBox(sceneProps);
  const sceneArea = Math.max(1, box.width * box.height);
  const out: FigureCellPx[] = [];
  for (const frame of ir.frames ?? []) {
    if (frame.name.startsWith("__")) continue;
    if (!frame.props.cellX || !frame.props.cellY) continue;
    const xs = asPair(evaluate(frame.props.cellX, scopes));
    const ys = asPair(evaluate(frame.props.cellY, scopes));
    if (!xs || !ys) continue;
    const x0 = Math.min(xs[0], xs[1]) * scale;
    const x1 = Math.max(xs[0], xs[1]) * scale;
    const y0 = Math.min(ys[0], ys[1]) * scale;
    const y1 = Math.max(ys[0], ys[1]) * scale;
    if (!(x1 - x0 > 1) || !(y1 - y0 > 1)) continue;
    if ((x1 - x0) * (y1 - y0) > sceneArea * 0.85) continue;
    out.push({ name: frame.name, x0, y0, x1, y1 });
  }
  return out;
}
