export type * from "./types.js";
export { applyHandbookHook, handbooksToPresetIds } from "./hook.js";
export type { StyleHookArtifactResult } from "./hook.js";
export { applyStyleToArtifact } from "./apply.js";
export { enforceStylePolicies } from "./enforce.js";
export { lintStyle } from "./lint.js";
export { DEFAULT_HANDBOOK_ID } from "./presets/print-nature.js";
export { DEFAULT_SCENE_BACKGROUND } from "./defaults.js";
export {
  registerStylePreset,
  registerStylePresetJson,
  getStylePreset,
  listStylePresets,
  resolveStylePresets,
  builtinStylePresets,
} from "./registry.js";
export { inferRole, literalString, literalNumber } from "./roles.js";
export {
  paletteColor,
  resetPaletteSeries,
  strokeForSeries,
} from "./palette.js";
export {
  setStyleContext,
  getStyleContext,
  type StyleEvalContext,
} from "./context.js";
