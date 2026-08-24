import type { Artifact, SceneItem } from "./ast.js";
import { evaluate } from "./eval.js";
import type { LayerIR, SceneNodeIR, VisualIR } from "./ir.js";
import { applyHandbookHook } from "./style/hook.js";
import { resolveStylePresets } from "./style/registry.js";
import type { HandbookHookOptions } from "./style/types.js";
import { grammarFromTypography } from "./layout/chrome-collide.js";
import { timelineFromState } from "./timeline/clock.js";
import { expandWidgets } from "./widgets.js";

export type CompileOptions = HandbookHookOptions;

let nextId = 1;

function id(prefix: string): string {
  nextId += 1;
  return `${prefix}_${nextId}`;
}

export function compile(artifact: Artifact, options?: CompileOptions): VisualIR {
  nextId = 1;
  const handbookIds = options?.handbookIds ?? [];
  const preset =
    options?.preset ?? (handbookIds.length ? resolveStylePresets(handbookIds) : null);
  const expanded = expandWidgets(artifact, {
    policies: preset?.policies,
    grammar: grammarFromTypography(preset?.typography, preset?.roles),
  });
  const hooked = applyHandbookHook(expanded, options ?? {});
  const expandedStyled = hooked.artifact;
  const state: Record<string, unknown> = {};
  const data: Record<string, unknown> = {};

  for (const decl of expandedStyled.states) {
    state[decl.name] = evaluate(decl.value, [state, data]);
  }
  for (const decl of expandedStyled.data) {
    data[decl.name] = evaluate(decl.value, [state, data]);
  }

  const scene = expandedStyled.scene ?? {
    props: {},
    layers: [],
    span: artifact.span,
  };

  return {
    name: expandedStyled.name,
    scene: {
      props: scene.props,
      layers: scene.layers.map(compileLayer),
    },
    frames: expandedStyled.frames.map((frame) => ({
      name: frame.name,
      props: frame.props,
    })),
    state,
    data,
    events: expandedStyled.events.map((event) => ({
      type: event.type,
      target: event.target,
      body: event.body,
    })),
    rules: expandedStyled.rules.map((rule) => ({ cond: rule.cond, body: rule.body })),
    binds: expandedStyled.binds.map((bind) => ({
      target: bind.target,
      source: bind.source,
    })),
    ticks: expandedStyled.ticks.map((tick) => ({ fps: tick.fps, body: tick.body })),
    animates: expandedStyled.animates.map((anim) => ({
      name: anim.name,
      props: Object.fromEntries(
        Object.entries(anim.props).map(([key, expr]) => [
          key,
          evaluate(expr, [state, data]),
        ]),
      ),
    })),
    meta: hooked.meta.handbookIds.length ? hooked.meta : undefined,
    timeline: timelineFromState(state) ?? undefined,
  };
}

function compileLayer(layer: {
  name: string;
  props?: Record<string, import("./ast.js").Expr>;
  items: SceneItem[];
}): LayerIR {
  return {
    id: id("layer"),
    name: layer.name,
    props: layer.props ?? {},
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
