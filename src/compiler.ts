import type { Artifact, SceneItem } from "./ast.js";
import { evaluate } from "./eval.js";
import type { LayerIR, SceneNodeIR, VisualIR } from "./ir.js";
import { expandWidgets } from "./widgets.js";

let nextId = 1;

function id(prefix: string): string {
  nextId += 1;
  return `${prefix}_${nextId}`;
}

export function compile(artifact: Artifact): VisualIR {
  nextId = 1;
  const expanded = expandWidgets(artifact);
  const state: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};

  for (const decl of expanded.states) {
    state[decl.name] = evaluate(decl.value, [state, data]);
  }
  for (const decl of expanded.data) {
    data[decl.name] = evaluate(decl.value, [state, data]);
  }

  const scene = expanded.scene ?? {
    props: {},
    layers: [],
    span: artifact.span,
  };

  return {
    name: expanded.name,
    scene: {
      props: scene.props,
      layers: scene.layers.map(compileLayer),
    },
    state,
    data,
    events: expanded.events.map((event) => ({
      type: event.type,
      target: event.target,
      body: event.body,
    })),
    rules: expanded.rules.map((rule) => ({ cond: rule.cond, body: rule.body })),
    binds: expanded.binds.map((bind) => ({
      target: bind.target,
      source: bind.source,
    })),
    ticks: expanded.ticks.map((tick) => ({ fps: tick.fps, body: tick.body })),
    animates: expanded.animates.map((anim) => ({
      name: anim.name,
      props: Object.fromEntries(
        Object.entries(anim.props).map(([key, expr]) => [
          key,
          evaluate(expr, [state, data]),
        ]),
      ),
    })),
  };
}

function compileLayer(layer: { name: string; items: SceneItem[] }): LayerIR {
  return {
    id: id("layer"),
    name: layer.name,
    items: layer.items.map(compileItem),
  };
}

function compileItem(item: SceneItem): SceneNodeIR {
  if (item.kind === "node") {
    return {
      kind: "node",
      id: id("node"),
      name: item.name,
      group: item.alias,
      props: item.props,
    };
  }
  if (item.kind === "for") {
    return {
      kind: "for",
      id: id("for"),
      item: item.item,
      source: item.source,
      body: item.body.map(compileItem),
    };
  }
  return {
    kind: "if",
    id: id("if"),
    cond: item.cond,
    body: item.body.map(compileItem),
  };
}
