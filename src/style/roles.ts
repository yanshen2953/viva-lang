import type { Expr } from "../ast.js";
import type { StyleRole, StylePreset } from "./types.js";

export function literalString(expr: Expr | undefined): string | null {
  if (expr?.kind === "string") return expr.value;
  if (expr?.kind === "ident") return expr.path[expr.path.length - 1] ?? null;
  return null;
}

function roleExprValue(props: Record<string, Expr>): string | null {
  return literalString(props.role);
}

export function literalNumber(expr: Expr | undefined): number | null {
  if (expr?.kind === "number") return expr.value;
  return null;
}

export function hasProp(props: Record<string, Expr>, key: string): boolean {
  return props[key] !== undefined;
}

export function matchLayerRule(layerName: string, match: string): boolean {
  if (match.endsWith("*") && match.length > 1) {
    return layerName.startsWith(match.slice(0, -1));
  }
  if (match.startsWith("*") && match.length > 1) {
    return layerName.endsWith(match.slice(1));
  }
  if (match.startsWith("*") && match.endsWith("*") && match.length > 2) {
    return layerName.includes(match.slice(1, -1));
  }
  return layerName === match;
}

export function inferRole(
  nodeName: string,
  props: Record<string, Expr>,
  layerName: string,
  preset: StylePreset,
): StyleRole | null {
  const explicit = roleExprValue(props) as StyleRole | null;
  if (explicit) return explicit;

  for (const rule of preset.layers ?? []) {
    if (!matchLayerRule(layerName, rule.match)) continue;
    if (rule.role) return rule.role;
  }

  for (const rule of preset.inference?.patterns ?? []) {
    try {
      const re = new RegExp(rule.pattern);
      if (re.test(nodeName)) return rule.role;
    } catch {
      if (nodeName.includes(rule.pattern)) return rule.role;
    }
  }

  if (hasProp(props, "text")) {
    const font = literalNumber(props.font) ?? literalNumber(props.fontSize);
    if (font !== null && font >= 20) return "title";
    if (font !== null && font <= 10) return "caption";
    return "label";
  }

  if (hasProp(props, "x1") && hasProp(props, "x2")) {
    if (hasProp(props, "dash") || literalString(props.strokeDasharray)) return "grid";
    return "axis";
  }

  if (hasProp(props, "w") && hasProp(props, "h") && !hasProp(props, "text")) {
    const w = literalNumber(props.w);
    const h = literalNumber(props.h);
    if (w !== null && h !== null && w <= 16 && h <= 16) return "legend";
    if (w !== null && h !== null && w > 40 && h > 40) return "plot";
    return "panel";
  }

  if (hasProp(props, "r") && !hasProp(props, "text")) return "mark";
  if (hasProp(props, "gradient") && (hasProp(props, "blur") || layerName.includes("atmosphere"))) {
    return "atmosphere";
  }

  return null;
}

export function roleTypographyKey(role: StyleRole): string | null {
  switch (role) {
    case "title":
      return "title";
    case "subtitle":
    case "caption":
      return role;
    case "legend-label":
    case "panel-label":
      return "legend";
    case "axis":
      return "axis";
    case "label":
    case "annotation":
      return "label";
    default:
      return null;
  }
}
