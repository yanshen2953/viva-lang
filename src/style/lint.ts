import type { Artifact, LayerDecl, SceneItem } from "../ast.js";
import type { Diagnostic } from "../diagnostics.js";
import type { StylePreset } from "./types.js";
import { inferRole, literalNumber, literalString } from "./roles.js";

function lintNode(
  name: string,
  props: Record<string, import("../ast.js").Expr>,
  layerName: string,
  preset: StylePreset,
  diagnostics: Diagnostic[],
): void {
  const policies = preset.policies;
  if (!policies) return;
  const role = inferRole(name, props, layerName, preset);

  if (policies.allowGlow === false && props.glow !== undefined) {
    diagnostics.push({
      message: `style: glow not allowed by preset '${preset.id}' on node '${name}'`,
      span: { line: 1, column: 1 },
      code: "style.policy.glow",
    });
  }
  if (policies.allowBlur === false && props.blur !== undefined) {
    diagnostics.push({
      message: `style: blur not allowed by preset '${preset.id}' on node '${name}'`,
      span: { line: 1, column: 1 },
      code: "style.policy.blur",
    });
  }
  if (policies.allowShadow === false && props.shadow !== undefined) {
    diagnostics.push({
      message: `style: shadow not allowed by preset '${preset.id}' on node '${name}'`,
      span: { line: 1, column: 1 },
      code: "style.policy.shadow",
    });
  }
  const blend = literalString(props.blend);
  if (blend && policies.forbidBlendModes?.includes(blend)) {
    diagnostics.push({
      message: `style: blend '${blend}' forbidden by preset '${preset.id}' on '${name}'`,
      span: { line: 1, column: 1 },
      code: "style.policy.blend",
    });
  }
  if (role === "atmosphere" && policies.allowAtmosphereBlend === false) {
    const op = literalNumber(props.opacity);
    if (op !== null && op > 0.05) {
      diagnostics.push({
        message: `style: atmosphere layer/node '${name}' should be disabled for '${preset.id}'`,
        span: { line: 1, column: 1 },
        code: "style.policy.atmosphere",
      });
    }
  }
}

function walkItems(
  items: SceneItem[],
  layerName: string,
  preset: StylePreset,
  diagnostics: Diagnostic[],
): void {
  for (const item of items) {
    if (item.kind === "node") {
      lintNode(item.name, item.props, layerName, preset, diagnostics);
      continue;
    }
    if (item.kind === "for") walkItems(item.body, layerName, preset, diagnostics);
    else walkItems(item.body, layerName, preset, diagnostics);
  }
}

function walkLayers(layers: LayerDecl[], preset: StylePreset, diagnostics: Diagnostic[]): void {
  for (const layer of layers) {
    walkItems(layer.items, layer.name, preset, diagnostics);
  }
}

export function lintStyle(artifact: Artifact, preset: StylePreset): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (artifact.scene) walkLayers(artifact.scene.layers, preset, diagnostics);
  return diagnostics;
}
