import type { Expr } from "../ast.js";
import { evaluate, truthy, type Scope } from "../eval.js";
import type { SceneNodeIR, VisualIR } from "../ir.js";
import {
  applyFrameToProps,
  layoutChartBar,
  scalesFromFrameProps,
  type FrameScales,
} from "../space.js";

export type FlatNode = {
  id: string;
  name: string;
  layerId: string;
  layerName: string;
  props: Record<string, unknown>;
};

export type SceneBox = { width: number; height: number; background: string };

/**
 * Deterministic SVG export from VisualIR (no browser Runtime required).
 * Node ids match Runtime `data-viva-id` for precise review correspondence.
 */
export function renderSvgFromIr(ir: VisualIR): string {
  const { width, height, background, layersXml } = buildSvgParts(ir);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:${esc(background)}">
${layersXml.join("\n")}
</svg>
`;
}

/** Flatten IR → painted nodes (same id / geometry as Runtime + review). */
export function flattenNodesFromIr(ir: VisualIR): { scene: SceneBox; nodes: FlatNode[] } {
  const state = { ...(ir.state as Record<string, unknown>) };
  const data = { ...(ir.data as Record<string, unknown>) };
  const scopes = (): Scope[] => [state, data];
  const scales = (ir.frames ?? []).map((f) =>
    scalesFromFrameProps(f.name, evalProps(f.props, scopes())),
  );
  const sceneProps = evalProps(ir.scene.props, scopes());
  const size = asPair(sceneProps.size, [880, 480]);
  const width = num(sceneProps.width, size[0]);
  const height = num(sceneProps.height, size[1]);
  const background = str(sceneProps.background, "#0b1220");

  const nodes: FlatNode[] = [];
  for (const layer of ir.scene.layers) {
    const lp = evalProps(layer.props ?? {}, scopes());
    const visible = lp.visible === undefined ? true : Boolean(lp.visible);
    if (!visible) continue;
    flattenItems(layer.items, scopes(), nodes, layer.name, layer.id, layer.name, scales);
  }
  return { scene: { width, height, background }, nodes };
}

function buildSvgParts(ir: VisualIR): {
  width: number;
  height: number;
  background: string;
  layersXml: string[];
} {
  const state = { ...(ir.state as Record<string, unknown>) };
  const data = { ...(ir.data as Record<string, unknown>) };
  const scopes = (): Scope[] => [state, data];
  const scales = (ir.frames ?? []).map((f) =>
    scalesFromFrameProps(f.name, evalProps(f.props, scopes())),
  );

  const sceneProps = evalProps(ir.scene.props, scopes());
  const size = asPair(sceneProps.size, [880, 480]);
  const width = num(sceneProps.width, size[0]);
  const height = num(sceneProps.height, size[1]);
  const background = str(sceneProps.background, "#0b1220");

  const layersXml: string[] = [];
  for (const layer of ir.scene.layers) {
    const nodes: FlatNode[] = [];
    flattenItems(layer.items, scopes(), nodes, layer.name, layer.id, layer.name, scales);
    const lp = evalProps(layer.props ?? {}, scopes());
    const opacity = lp.opacity === undefined ? 1 : num(lp.opacity, 1);
    const visible = lp.visible === undefined ? true : Boolean(lp.visible);
    if (!visible) continue;
    const children = nodes.map((n) => nodeToSvg(n)).join("\n");
    layersXml.push(
      `<g data-viva-layer="${esc(layer.name)}" data-viva-layer-id="${esc(layer.id)}" opacity="${opacity}">\n${children}\n</g>`,
    );
  }
  return { width, height, background, layersXml };
}

function flattenItems(
  items: SceneNodeIR[],
  scopes: Scope[],
  out: FlatNode[],
  prefix: string,
  layerId: string,
  layerName: string,
  scales: FrameScales[],
): void {
  for (const item of items) {
    if (item.kind === "node") {
      const raw = evalProps(item.props, scopes);
      const framed = applyFrameToProps(raw, scales);
      const props = layoutChartBar(framed, scales);
      out.push({
        id: `${prefix}:${item.id}`,
        name: item.name,
        layerId,
        layerName,
        props,
      });
      continue;
    }
    if (item.kind === "if") {
      if (truthy(evaluate(item.cond, scopes))) {
        flattenItems(item.body, scopes, out, `${prefix}:${item.id}`, layerId, layerName, scales);
      }
      continue;
    }
    const source = evaluate(item.source, scopes);
    const list = Array.isArray(source) ? source : [];
    list.forEach((entry, index) => {
      flattenItems(
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

function nodeToSvg(node: FlatNode): string {
  const p = node.props;
  const tag = inferTag(p);
  const opacity = p.opacity === undefined ? 1 : num(p.opacity, 1);
  const common = `data-viva-id="${esc(node.id)}" data-viva-name="${esc(node.name)}" opacity="${opacity}"`;
  if (tag === "circle") {
    return `<circle ${common} cx="${num(p.x)}" cy="${num(p.y)}" r="${num(p.r ?? p.size, 16)}" fill="${esc(str(p.fill ?? p.color, "#38bdf8"))}"${strokeAttrs(p)} />`;
  }
  if (tag === "rect") {
    return `<rect ${common} x="${num(p.x)}" y="${num(p.y)}" width="${num(p.w ?? p.width, 80)}" height="${num(p.h ?? p.height, 24)}" rx="${num(p.radius)}" fill="${esc(str(p.fill ?? p.color, "#1e293b"))}"${strokeAttrs(p)} />`;
  }
  if (tag === "text") {
    const text = esc(str(p.text ?? p.label ?? node.name, ""));
    const fill = esc(str(p.fill ?? p.color, "#e2e8f0"));
    const size = num(p.font ?? p.fontSize, 14);
    const anchor =
      str(p.align, "start") === "center"
        ? "middle"
        : str(p.align, "start") === "right"
          ? "end"
          : "start";
    return `<text ${common} x="${num(p.x)}" y="${num(p.y)}" fill="${fill}" font-size="${size}" text-anchor="${anchor}">${text}</text>`;
  }
  if (tag === "line") {
    return `<line ${common} x1="${num(p.x1, num(p.x))}" y1="${num(p.y1, num(p.y))}" x2="${num(p.x2, num(p.x) + 40)}" y2="${num(p.y2, num(p.y))}" stroke="${esc(str(p.stroke ?? p.fill, "#64748b"))}" stroke-width="${num(p.strokeWidth, 2)}" />`;
  }
  return `<path ${common} d="${esc(str(p.d ?? p.path, ""))}" fill="${esc(str(p.fill, "none"))}" stroke="${esc(str(p.stroke, "#94a3b8"))}" stroke-width="${num(p.strokeWidth, 1)}" />`;
}

function strokeAttrs(p: Record<string, unknown>): string {
  let s = "";
  if (p.stroke) s += ` stroke="${esc(String(p.stroke))}"`;
  if (p.strokeWidth) s += ` stroke-width="${num(p.strokeWidth)}"`;
  return s;
}

function inferTag(props: Record<string, unknown>): string {
  if (props.d !== undefined || props.path !== undefined) return "path";
  if (props.x1 !== undefined || props.x2 !== undefined) return "line";
  if (props.text !== undefined || props.label !== undefined || props.font !== undefined) return "text";
  if (props.w !== undefined || props.width !== undefined || props.h !== undefined || props.height !== undefined)
    return "rect";
  return "circle";
}

function evalProps(exprs: Record<string, Expr>, scopes: Scope[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(exprs)) out[k] = evaluate(v, scopes);
  return out;
}

function asPair(value: unknown, fallback: [number, number]): [number, number] {
  if (Array.isArray(value) && value.length >= 2) return [num(value[0]), num(value[1])];
  if (typeof value === "string") {
    const parts = value.trim().split(/\s+/).map(Number);
    if (parts.length >= 2 && parts.every((n) => !Number.isNaN(n))) return [parts[0]!, parts[1]!];
  }
  return fallback;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
