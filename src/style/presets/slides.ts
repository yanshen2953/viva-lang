import type { StylePreset } from "../types.js";

export const slidesPreset: StylePreset = {
  id: "slides",
  extends: "print-nature",
  scene: {
    background: "#0f172a",
    fontFamily: "IBM Plex Sans, system-ui, sans-serif",
  },
  palette: {
    categorical: ["#38bdf8", "#fbbf24", "#34d399", "#f472b6", "#a78bfa"],
    accent: "#38bdf8",
    foreground: "#f8fafc",
    muted: "#94a3b8",
    background: "#0f172a",
  },
  typography: {
    title: { size: 28, weight: 700 },
    subtitle: { size: 18, weight: 500 },
    caption: { size: 14, weight: 400 },
    label: { size: 16, weight: 500 },
  },
  roles: {
    panel: { fill: "#1e293b", stroke: "#475569", strokeWidth: 2, radius: 16 },
    plot: { fill: "#0f172a", stroke: "#64748b", strokeWidth: 2 },
    title: { fill: "#f8fafc", font: 28, fontWeight: 700 },
    subtitle: { fill: "#cbd5e1", font: 18 },
    mark: { stroke: "#0f172a", strokeWidth: 2 },
    atmosphere: { opacity: 0.2 },
  },
  policies: {
    allowGlow: true,
    allowBlur: true,
    allowShadow: true,
    allowAtmosphereBlend: true,
    maxGlow: 24,
    maxBlur: 32,
    forbidBlendModes: [],
  },
};
