import type { StylePreset } from "./types.js";
import { printNaturePreset } from "./presets/print-nature.js";
import { dashboardPreset } from "./presets/dashboard.js";
import { slidesPreset } from "./presets/slides.js";

const BUILTIN: Record<string, StylePreset> = {
  "print-nature": printNaturePreset,
  dashboard: dashboardPreset,
  slides: slidesPreset,
};

function deepMergeRole(
  base: StylePreset["roles"],
  over: StylePreset["roles"],
): StylePreset["roles"] {
  const out = { ...base };
  if (!over) return out;
  for (const [role, style] of Object.entries(over)) {
    out[role as keyof typeof out] = {
      ...(base?.[role as keyof typeof base] ?? {}),
      ...style,
    };
  }
  return out;
}

function mergePreset(base: StylePreset, over: StylePreset): StylePreset {
  return {
    id: over.id || base.id,
    extends: over.extends ?? base.extends,
    scene: { ...base.scene, ...over.scene },
    palette: { ...base.palette, ...over.palette },
    typography: { ...base.typography, ...over.typography },
    roles: deepMergeRole(base.roles, over.roles),
    layers: [...(base.layers ?? []), ...(over.layers ?? [])],
    inference: {
      patterns: [
        ...(base.inference?.patterns ?? []),
        ...(over.inference?.patterns ?? []),
      ],
    },
    policies: { ...base.policies, ...over.policies },
  };
}

export function registerStylePreset(preset: StylePreset): void {
  BUILTIN[preset.id] = preset;
}

export function getStylePreset(id: string): StylePreset | undefined {
  return BUILTIN[id];
}

export function listStylePresets(): { id: string }[] {
  return Object.keys(BUILTIN).map((id) => ({ id }));
}

/** Resolve preset chain (extends) and merge handbook ids left-to-right. */
export function resolveStylePresets(ids: string[]): StylePreset | null {
  if (!ids.length) return null;
  let merged: StylePreset | null = null;
  for (const id of ids) {
    const preset = loadPresetWithExtends(id);
    if (!preset) continue;
    merged = merged ? mergePreset(merged, preset) : { ...preset };
  }
  if (merged) merged.id = ids.join("+");
  return merged;
}

function loadPresetWithExtends(id: string, seen = new Set<string>()): StylePreset | null {
  if (seen.has(id)) return null;
  seen.add(id);
  const raw = BUILTIN[id];
  if (!raw) return null;
  if (!raw.extends) return { ...raw, id };
  const parent = loadPresetWithExtends(raw.extends, seen);
  if (!parent) return { ...raw, id };
  return mergePreset(parent, { ...raw, id });
}

export function registerStylePresetJson(id: string, json: unknown): void {
  registerStylePreset({ ...(json as StylePreset), id: (json as StylePreset).id || id });
}

export { BUILTIN as builtinStylePresets };
