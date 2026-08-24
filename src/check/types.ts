import type { Diagnostic } from "../diagnostics.js";
import type { VisionModelClient } from "./models/types.js";

export type CheckSeverity = "warn" | "error";

export type CheckDiagnostic = Diagnostic & {
  severity: CheckSeverity;
  layer: "structural" | "visual" | "vision";
};

export type CheckOptions = {
  /** Headless geometry / layout rules (no rasterization). Default true when checks run. */
  structural?: boolean;
  /** Raster ink / color diversity via resvg + sharp. */
  visual?: boolean;
  /** Multimodal model screenshot QA (configured vision / http entry). */
  vision?: boolean;
  /** Path to viva.models.json (overrides search paths). */
  modelsConfigPath?: string;
  /** Inject custom multimodal client (bypasses config file). */
  visionClient?: VisionModelClient;
  /** Optional source snippet sent to vision model for context. */
  source?: string;
  /** Min fraction of non-background pixels. Default 0.004. */
  minInkRatio?: number;
  /** Min distinct ink colors (quantized). Default 6 for scenes > 200k px. */
  minColorCount?: number;
  /** Raster width in CSS pixels. Default 960. */
  rasterWidth?: number;
  /** Out-of-scene tolerance in px. Default 4. */
  boundsMargin?: number;
};

export type CheckResult = {
  ok: boolean;
  diagnostics: CheckDiagnostic[];
  structural: CheckDiagnostic[];
  visual: CheckDiagnostic[];
  vision: CheckDiagnostic[];
  stats?: {
    nodeCount: number;
    sceneWidth: number;
    sceneHeight: number;
    inkRatio?: number;
    colorCount?: number;
  };
};
