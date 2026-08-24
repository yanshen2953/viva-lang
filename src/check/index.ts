import type { VisualIR } from "../ir.js";
import { flattenNodesFromIr } from "../export/static-svg.js";
import { listSelectableNodes } from "../review/nodes.js";
import { runStructuralChecks } from "./structural.js";
import { runVisualChecks } from "./visual.js";
import { runVisionChecks } from "./vision.js";
import { rasterizeIr } from "./raster.js";
import type { CheckOptions, CheckResult } from "./types.js";
import { withIrStyleContext } from "./style-context.js";

export type { CheckDiagnostic, CheckOptions, CheckResult, CheckSeverity } from "./types.js";
export { withIrStyleContext } from "./style-context.js";
export { runStructuralChecks } from "./structural.js";
export { figureCellsFromIr, runVisualChecks } from "./visual.js";
export { runVisionChecks } from "./vision.js";
export { rasterizeIr } from "./raster.js";
export { compareSvgPdfPages, sidecarOverlap, pdftoppmAvailable } from "./visual-parity.js";
export type { VisualParityReport, PageParity } from "./visual-parity.js";
export {
  createTextModelClient,
  createVisionModelClient,
  describeModelSlots,
  resolveModelsConfig,
} from "./models/index.js";
export type {
  ModelEndpointConfig,
  TextModelClient,
  VisionModelClient,
  VivaModelsFile,
} from "./models/index.js";

export function hasCheckErrors(diagnostics: import("./types.js").CheckDiagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === "error");
}

/** Two-layer artifact QA: structural (geometry) then optional visual (raster). */
export async function runArtifactChecks(
  ir: VisualIR,
  opts: CheckOptions = {},
): Promise<CheckResult> {
  const structural =
    opts.structural !== false ? runStructuralChecks(ir, opts) : [];
  let visual: import("./types.js").CheckDiagnostic[] = [];
  let vision: import("./types.js").CheckDiagnostic[] = [];
  let inkRatio: number | undefined;
  let colorCount: number | undefined;

  const needRaster = Boolean(opts.visual || opts.vision);
  const cachedRaster = needRaster ? await rasterizeIr(ir, opts) : undefined;

  if (opts.visual) {
    const v = await runVisualChecks(ir, opts, cachedRaster);
    visual = v.diagnostics;
    inkRatio = v.inkRatio;
    colorCount = v.colorCount;
  }

  if (opts.vision) {
    vision = await runVisionChecks(ir, { ...opts, source: opts.source }, structural, {
      inkRatio,
      colorCount,
    });
  }

  const diagnostics = [...structural, ...visual, ...vision];
  const { scene, nodes } = withIrStyleContext(ir, () => flattenNodesFromIr(ir));
  const selectable = withIrStyleContext(ir, () => listSelectableNodes(ir));

  return {
    ok: !hasCheckErrors(diagnostics),
    diagnostics,
    structural,
    visual,
    vision,
    stats: {
      nodeCount: selectable.length,
      sceneWidth: scene.width,
      sceneHeight: scene.height,
      inkRatio,
      colorCount,
    },
  };
}

export type HotPathVisualFields = {
  visualOk?: boolean;
  visual?: import("./types.js").CheckDiagnostic[];
  success?: boolean;
};

/**
 * Attach raster visual QA after compile. Visual errors fail `success`
 * and `checkOk`; IR is still returned so agents can repair.
 * `visual: false` skips the raster.
 */
export async function attachHotPathVisual<
  T extends {
    ir: VisualIR | null;
    diagnostics: Array<{ message: string; code?: string }>;
    checkDiagnostics?: import("./types.js").CheckDiagnostic[];
    checkOk?: boolean;
    success?: boolean;
  },
>(
  compiled: T,
  opts: { visual?: boolean; rasterWidth?: number; source?: string } = {},
): Promise<T & HotPathVisualFields> {
  if (!compiled.ir || opts.visual === false) {
    return {
      ...compiled,
      success: Boolean(compiled.ir) && compiled.checkOk !== false && compiled.success !== false,
    };
  }
  const checks = await runArtifactChecks(compiled.ir, {
    structural: true,
    visual: true,
    rasterWidth: opts.rasterWidth ?? 640,
    source: opts.source,
  });
  const seen = new Set(
    compiled.diagnostics.map((d) => `${"code" in d ? String(d.code ?? "") : ""}|${d.message}`),
  );
  const extra = [...checks.structural, ...checks.visual].filter((d) => {
    const key = `${d.code}|${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const visualOk = !hasCheckErrors(checks.visual);
  const checkOk = checks.ok && compiled.checkOk !== false;
  return {
    ...compiled,
    diagnostics: [...compiled.diagnostics, ...extra],
    checkDiagnostics: [...(compiled.checkDiagnostics ?? []), ...extra],
    checkOk,
    visualOk,
    visual: checks.visual,
    success: Boolean(compiled.ir) && checkOk && visualOk,
  };
}
