import type { StylePreset, StyleRole } from "./types.js";

const DARK_TEXT: Partial<Record<StyleRole, string>> = {
  title: "#f8fafc",
  subtitle: "#cbd5e1",
  caption: "#94a3b8",
  annotation: "#f8fafc",
  label: "#e2e8f0",
  "legend-label": "#e2e8f0",
  "panel-label": "#7dd3fc",
  hud: "#f8fafc",
  axis: "#cbd5e1",
};

export function parseHexColor(value: string): [number, number, number] | null {
  const raw = value.trim();
  const m = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const hex = m[1]!;
  if (hex.length === 3) {
    return [
      parseInt(hex[0]! + hex[0], 16),
      parseInt(hex[1]! + hex[1], 16),
      parseInt(hex[2]! + hex[2], 16),
    ];
  }
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

export function relativeLuminance(rgb: [number, number, number]): number {
  const lin = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

export function isDarkColor(value: string | undefined): boolean {
  if (!value) return false;
  const rgb = parseHexColor(value);
  if (!rgb) return false;
  return relativeLuminance(rgb) < 0.32;
}

/** Invert handbook text chrome when the scene is dark. Does not mutate the preset. */
export function contrastPreset(preset: StylePreset, sceneBackground?: string): StylePreset {
  if (!isDarkColor(sceneBackground)) return preset;
  const roles = { ...(preset.roles ?? {}) };
  for (const [role, fill] of Object.entries(DARK_TEXT)) {
    const key = role as StyleRole;
    roles[key] = { ...(roles[key] ?? {}), fill };
  }
  return { ...preset, roles };
}
