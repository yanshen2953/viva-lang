import type { Artifact, LayerDecl, SceneItem } from "../ast.js";
import type { StylePreset } from "./types.js";
import { literalNumber, literalString } from "./roles.js";

function clampNode(props: Record<string, import("../ast.js").Expr>, preset: StylePreset): void {
  const policies = preset.policies;
  if (!policies) return;

  if (policies.allowGlow === false && props.glow !== undefined) {
    delete props.glow;
    delete props.glowColor;
  } else if (policies.maxGlow !== undefined && props.glow !== undefined) {
    const g = literalNumber(props.glow);
    if (g !== null && g > policies.maxGlow) props.glow = { kind: "number", value: policies.maxGlow, span: { line: 1, column: 1 } };
  }

  if (policies.allowBlur === false && props.blur !== undefined) {
    delete props.blur;
  } else if (policies.maxBlur !== undefined && props.blur !== undefined) {
    const b = literalNumber(props.blur);
    if (b !== null && b > policies.maxBlur) props.blur = { kind: "number", value: policies.maxBlur, span: { line: 1, column: 1 } };
  }

  if (policies.allowShadow === false) {
    delete props.shadow;
    delete props.shadowColor;
    delete props.shadowOpacity;
  }

  if (policies.forbidBlendModes?.length && props.blend !== undefined) {
    const blend = literalString(props.blend);
    if (blend && policies.forbidBlendModes.includes(blend)) {
      delete props.blend;
    }
  }
}

function walkItems(items: SceneItem[], preset: StylePreset): void {
  for (const item of items) {
    if (item.kind === "node") {
      clampNode(item.props, preset);
      continue;
    }
    if (item.kind === "for") walkItems(item.body, preset);
    else walkItems(item.body, preset);
  }
}

function walkLayers(layers: LayerDecl[], preset: StylePreset): void {
  const policies = preset.policies;
  for (const layer of layers) {
    if (policies?.forbidBlendModes?.length && layer.props.blend !== undefined) {
      const blend = literalString(layer.props.blend);
      if (blend && policies.forbidBlendModes.includes(blend)) {
        delete layer.props.blend;
      }
    }
    if (policies?.allowAtmosphereBlend === false) {
      const name = layer.name.toLowerCase();
      if (name.includes("glow") || name.includes("wash") || name.includes("atmosphere")) {
        layer.props.opacity = { kind: "number", value: 0, span: { line: 1, column: 1 } };
      }
    }
    walkItems(layer.items, preset);
  }
}

export function enforceStylePolicies(artifact: Artifact, preset: StylePreset): Artifact {
  if (artifact.scene) walkLayers(artifact.scene.layers, preset);
  return artifact;
}
