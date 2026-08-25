export { parse } from "./parser.js";
export { tokenize } from "./lexer.js";
export { compile, type CompileOptions } from "./compiler.js";
export { resolveSceneBox, mmToPx, COLUMN_MM, pageColumnMeasure } from "./space/scene-box.js";
export { domainMap } from "./space.js";
export {
  expandWidgets,
  registerWidget,
  listWidgets,
  getWidget,
  registerCompileHook,
  listCompileHooks,
  unregisterCompileHook,
  ensureBuiltinPlugins,
} from "./widgets.js";
export type { WidgetPlugin, WidgetExpandContext, CompileHook } from "./widgets.js";
export { compileSource } from "./pipeline.js";
export type { CompileOptions as PipelineCompileOptions, PipelineCheckOptions } from "./pipeline.js";
export { Runtime, nodeIgnoresPointer } from "./runtime.js";
export { evaluate, execute } from "./eval.js";
export { simulate, createSimWorld, stepSimWorld } from "./simulate.js";
export { SYSTEM_PROMPT } from "./llm/system-prompt.js";
export { SYSTEM_PROMPT_SLIM } from "./llm/system-prompt-slim.js";
export { vivaCapabilities, formatCapabilities } from "./agent/capabilities.js";
export { runAgentLoop, productSystemPrompt } from "./agent/orchestrator.js";
export type { AgentGenerateFn, AgentLoopResult } from "./agent/orchestrator.js";
export { VivaError, formatDiagnostic, withSyntaxHint } from "./diagnostics.js";
export type { Artifact } from "./ast.js";
export type { VisualIR } from "./ir.js";
export {
  createVivaAgentHost,
  createPromptService,
  promptServiceWithHandbooks,
  createMemoryProvenance,
  createInlinePipeline,
  fingerprint,
} from "./agent/index.js";
export type { VivaAgentHost, VivaSession } from "./agent/index.js";
export type { ProvenanceBundle } from "./agent/types.js";
export { createVivaWebEmbed } from "./embed/web.js";
export type { WebEmbedCommand, WebEmbedMessage, WebEmbedOptions } from "./embed/web.js";
export {
  createReviewController,
  listSelectableNodes,
  buildAgentBrief,
} from "./review/index.js";
export type {
  ReviewController,
  ReviewSnapshot,
  FeedbackKind,
  SelectionTool,
  SelectionCombine,
} from "./review/index.js";
export {
  exportArtifact,
  renderSvgFromIr,
  renderVectorPdfFromIr,
  renderVectorPdfPackageFromIr,
} from "./export/index.js";
export type { PdfSidecarNode } from "./export/index.js";
export {
  applyTimelineState,
  sampleBeatAt,
  startOfBeat,
  holdOf,
  editTrackOf,
  type TimelineSpec,
  type EditClip,
} from "./timeline/index.js";
export { repairSource, planRepairs } from "./repair/index.js";
export { registerDragParamPipeline, attachDragParamLoop, DRAG_PARAM_PIPELINE_ID } from "./agent/pipeline/drag-param.js";
export { runBrowserVisual } from "./check/browser-visual.js";
export {
  applyViewState,
  sampleView,
  guardView,
  readPage,
  writePage,
} from "./runtime/view-machine.js";
export type { InteractionSnapshot } from "./runtime/view-machine.js";
export { compareSvgPdfPages, sidecarOverlap, pdftoppmAvailable } from "./check/visual-parity.js";
export { setChromeGrammar, getChromeGrammar, grammarFromTypography } from "./layout/chrome-collide.js";
export {
  hopFiguresPastCopy,
  composeNewspaper,
  newspaperMeasure,
  snapFigureToMeasure,
} from "./layout/newspaper.js";
export { pdfMissingGlyphs, pdfUnmappedGlyphs, bundledCjkFontPath, resolveCjkFontPath } from "./export/pdf-font.js";
export { measureText, LATIN_FONT_STACK } from "./metrics/text.js";
export { propsToSceneShape } from "./runtime/units.js";
export {
  runArtifactChecks,
  runStructuralChecks,
  runVisualChecks,
  runVisionChecks,
  rasterizeIr,
  withIrStyleContext,
  createTextModelClient,
  createVisionModelClient,
  describeModelSlots,
  resolveModelsConfig,
} from "./check/index.js";
export type {
  CheckDiagnostic,
  CheckOptions,
  CheckResult,
  ModelEndpointConfig,
  TextModelClient,
  VisionModelClient,
  VivaModelsFile,
} from "./check/index.js";
export {
  applyHandbookHook,
  resolveStylePresets,
  registerStylePreset,
  listStylePresets,
  getStylePreset,
} from "./style/index.js";
export type { StylePreset, StyleMeta, HandbookHookOptions, StyleRole } from "./style/index.js";
