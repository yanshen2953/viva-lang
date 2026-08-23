export { parse } from "./parser.js";
export { tokenize } from "./lexer.js";
export { compile, type CompileOptions } from "./compiler.js";
export { compileSource } from "./pipeline.js";
export type { CompileOptions as PipelineCompileOptions, PipelineCheckOptions } from "./pipeline.js";
export { Runtime } from "./runtime.js";
export { evaluate, execute } from "./eval.js";
export { simulate, createSimWorld } from "./simulate.js";
export { SYSTEM_PROMPT } from "./llm/system-prompt.js";
export { SYSTEM_PROMPT_SLIM } from "./llm/system-prompt-slim.js";
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
export { exportArtifact, renderSvgFromIr, renderVectorPdfFromIr } from "./export/index.js";
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
