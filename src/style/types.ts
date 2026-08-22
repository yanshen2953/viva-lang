import type { Diagnostic } from "../diagnostics.js";

/** Semantic paint roles — chart-agnostic; any LLM-authored scene can tag nodes. */
export type StyleRole =
  | "scene"
  | "panel"
  | "plot"
  | "plot-border"
  | "axis"
  | "grid"
  | "title"
  | "subtitle"
  | "caption"
  | "legend"
  | "legend-label"
  | "panel-label"
  | "subpanel"
  | "colorbar"
  | "mark"
  | "mark-line"
  | "mark-area"
  | "annotation"
  | "chrome"
  | "label"
  | "hud"
  | "atmosphere";

export type PaletteKind = "categorical" | "sequential" | "accent" | "muted" | "background";

export type TypographyToken = {
  size?: number;
  weight?: number | string;
  family?: string;
  letterSpacing?: number;
  lineHeight?: number;
};

/** Default paint props for a role (subset of node props). */
export type RoleStyle = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  font?: number;
  fontWeight?: number | string;
  fontFamily?: string;
  letterSpacing?: number;
  lineHeight?: number;
  dash?: string;
  radius?: number;
  glow?: number;
  blur?: number;
  shadow?: string;
  blend?: string;
};

export type LayerStyleRule = {
  /** Layer name glob: exact, prefix*, *suffix, *contains* */
  match: string;
  role?: StyleRole;
  props?: RoleStyle;
  opacity?: number;
  blend?: string;
};

export type NamePatternRule = {
  pattern: string;
  role: StyleRole;
};

export type StylePolicies = {
  allowGlow?: boolean;
  allowBlur?: boolean;
  allowShadow?: boolean;
  allowAtmosphereBlend?: boolean;
  maxGlow?: number;
  maxBlur?: number;
  maxShadowOpacity?: number;
  forbidBlendModes?: string[];
};

export type StylePalette = {
  categorical?: string[];
  sequential?: string[];
  accent?: string;
  foreground?: string;
  muted?: string;
  background?: string;
};

export type StylePreset = {
  id: string;
  extends?: string;
  scene?: {
    background?: string;
    width?: number;
    height?: number;
    fontFamily?: string;
  };
  palette?: StylePalette;
  typography?: Partial<Record<string, TypographyToken>>;
  roles?: Partial<Record<StyleRole, RoleStyle>>;
  layers?: LayerStyleRule[];
  inference?: {
    patterns?: NamePatternRule[];
  };
  policies?: StylePolicies;
};

export type StyleMeta = {
  handbookIds: string[];
  preset: StylePreset;
  /** Stable series → palette index map built during compile for categorical coloring. */
  seriesIndex?: Record<string, number>;
};

export type HandbookHookOptions = {
  handbookIds?: string[];
  /** Pre-merged preset (skips registry load). */
  preset?: StylePreset;
  /** When true, emit style diagnostics as warnings (never fail compile). */
  lint?: boolean;
  /** When true, strip or clamp props that violate policies. */
  enforce?: boolean;
};

export type HandbookHookResult = {
  meta: StyleMeta;
  diagnostics: Diagnostic[];
};

/** Node props consumed by the style hook; never rendered. */
export const STYLE_META_PROPS = new Set([
  "role",
  "palette",
  "colorBy",
  "styleSkip",
  "styleHint",
]);
