import type { Expr, SceneItem, Artifact, LayerDecl } from "../ast.js";
import type { Span } from "../diagnostics.js";
import type { RoleStyle, StylePreset, StyleRole } from "./types.js";
import { inferRole, literalString, hasProp, roleTypographyKey } from "./roles.js";
import { contrastPreset } from "./contrast.js";

const PAINT_KEYS = [
  "fill",
  "color",
  "stroke",
  "strokeWidth",
  "opacity",
  "font",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "letterSpacing",
  "lineHeight",
  "dash",
  "radius",
  "glow",
  "blur",
  "shadow",
  "shadowColor",
  "shadowOpacity",
  "blend",
] as const;

function span(): Span {
  return { line: 1, column: 1 };
}

function lit(value: string | number): Expr {
  if (typeof value === "number") return { kind: "number", value, span: span() };
  return { kind: "string", value, span: span() };
}

function roleStyle(preset: StylePreset, role: StyleRole): RoleStyle {
  return preset.roles?.[role] ?? {};
}

function applyRoleToProps(
  props: Record<string, Expr>,
  role: StyleRole,
  preset: StylePreset,
): void {
  if (literalString(props.styleSkip) === "true") return;
  const style = roleStyle(preset, role);
  const typoKey = roleTypographyKey(role);
  const typo = typoKey ? preset.typography?.[typoKey] : undefined;

  const defaults: Record<string, string | number> = {};
  for (const key of PAINT_KEYS) {
    const v = style[key as keyof RoleStyle];
    if (v !== undefined) defaults[key] = v as string | number;
  }
  if (typo?.size !== undefined) defaults.font = typo.size;
  if (typo?.weight !== undefined) defaults.fontWeight = typo.weight;
  if (typo?.family !== undefined) defaults.fontFamily = typo.family;
  if (typo?.letterSpacing !== undefined) defaults.letterSpacing = typo.letterSpacing;
  if (typo?.lineHeight !== undefined) defaults.lineHeight = typo.lineHeight;
  if (preset.scene?.fontFamily && !defaults.fontFamily && hasProp(props, "text")) {
    defaults.fontFamily = preset.scene.fontFamily;
  }

  const typoKeys = new Set(["font", "fontWeight", "fontFamily", "letterSpacing", "lineHeight"]);
  for (const [key, value] of Object.entries(defaults)) {
    const handbookTypeWins = Boolean(typo) && typoKeys.has(key);
    if (props[key] !== undefined && !handbookTypeWins) continue;
    props[key] = lit(value);
  }
}

function injectPaletteFill(
  props: Record<string, Expr>,
  itemName: string,
  colorBy: string,
  paletteKind: string,
): void {
  if (props.fill !== undefined || props.color !== undefined) return;
  props.fill = {
    kind: "call",
    callee: "palette",
    args: [
      { kind: "ident", path: [itemName, colorBy], span: span() },
      { kind: "string", value: paletteKind, span: span() },
    ],
    span: span(),
  };
  if (props.stroke === undefined) {
    props.stroke = {
      kind: "call",
      callee: "paletteStroke",
      args: [
        { kind: "ident", path: [itemName, colorBy], span: span() },
        { kind: "string", value: paletteKind, span: span() },
      ],
      span: span(),
    };
  }
}

function walkItems(
  items: SceneItem[],
  layerName: string,
  preset: StylePreset,
  forItem?: string,
): void {
  for (const item of items) {
    if (item.kind === "node") {
      const role = inferRole(item.name, item.props, layerName, preset);
      if (role) applyRoleToProps(item.props, role, preset);

      const colorBy = literalString(item.props.colorBy);
      const paletteKind = literalString(item.props.palette) ?? "categorical";
      if (colorBy && forItem && !hasProp(item.props, "styleSkip")) {
        injectPaletteFill(item.props, forItem, colorBy, paletteKind);
      }
      continue;
    }
    if (item.kind === "for") {
      walkItems(item.body, layerName, preset, item.item);
      continue;
    }
    walkItems(item.body, layerName, preset, forItem);
  }
}

function applyScene(artifact: Artifact, preset: StylePreset): void {
  const scene = artifact.scene;
  if (!scene) return;
  if (preset.scene?.background && scene.props.background === undefined) {
    scene.props.background = lit(preset.scene.background);
  }
  if (preset.scene?.width && scene.props.size === undefined) {
    const h = preset.scene.height ?? 480;
    scene.props.size = {
      kind: "array",
      items: [lit(preset.scene.width), lit(h)],
      span: span(),
    };
  }
}

function layerMatches(layerName: string, match: string): boolean {
  if (match.endsWith("*") && match.length > 1) {
    return layerName.startsWith(match.slice(0, -1));
  }
  if (match.startsWith("*") && match.endsWith("*") && match.length > 2) {
    return layerName.includes(match.slice(1, -1));
  }
  return layerName === match;
}

function applyLayers(layers: LayerDecl[], preset: StylePreset): void {
  for (const layer of layers) {
    for (const rule of preset.layers ?? []) {
      if (!layerMatches(layer.name, rule.match)) continue;
      if (rule.opacity !== undefined && layer.props.opacity === undefined) {
        layer.props.opacity = lit(rule.opacity);
      }
      if (rule.blend !== undefined && layer.props.blend === undefined) {
        layer.props.blend = lit(rule.blend);
      }
      if (rule.role === "atmosphere" && preset.policies?.allowAtmosphereBlend === false) {
        layer.props.opacity = lit(0);
        layer.props.visible = { kind: "boolean", value: false, span: span() };
      }
    }
    walkItems(layer.items, layer.name, preset);
  }
}

function sceneBackgroundHex(artifact: Artifact, preset: StylePreset): string | undefined {
  const expr = artifact.scene?.props.background;
  if (expr?.kind === "string") return expr.value;
  return preset.scene?.background ?? preset.palette?.background;
}

/** Apply handbook preset defaults to an artifact (post widget-expand). */
export function applyStyleToArtifact(artifact: Artifact, preset: StylePreset): Artifact {
  const effective = contrastPreset(preset, sceneBackgroundHex(artifact, preset));
  applyScene(artifact, effective);
  if (artifact.scene) applyLayers(artifact.scene.layers, effective);
  return artifact;
}
