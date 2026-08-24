export { createVivaAgentHost, type VivaAgentHost, type CreateHostOptions } from "./host.js";
export {
  createSession,
  type VivaSession,
  type CreateSessionOptions,
} from "./session.js";
export {
  createPromptService,
  promptServiceWithHandbooks,
  type PromptService,
  type PromptBundle,
} from "./prompt.js";
export { createMemoryProvenance, attachBundleExtras } from "./provenance/memory.js";
export { fingerprint } from "./provenance/hash.js";
export {
  createPipelinePort,
  createInlinePipeline,
  type PipelineDefFull,
} from "./pipeline/port.js";
export { createHttpWebhookPipeline } from "./pipeline/adapters/http-webhook.js";
export {
  getRemoteAgentHost,
  resetRemoteAgentHost,
  attachBuiltinPipelines,
} from "./remote-host.js";
export { createSessionFacade } from "./session-api.js";
export type { SessionFacade, PipelineInfo, CompileSummary } from "./session-api.js";
// Node-only adapter: import from `./pipeline/adapters/local-command.js` (not bundled into playground).
export {
  createDomainViewRegistry,
  suggestViewForArtifact,
  VIVA_INLINE_PLUGIN_ID,
  type DomainView,
  type DomainViewRegistry,
} from "./domain/registry.js";
export { createEventBus } from "./events.js";
export { resolveSessionHandbooks, shouldApplyHandbookHook } from "./handbook.js";
export type * from "./types.js";
export {
  createReviewController,
  listSelectableNodes,
  buildAgentBrief,
} from "../review/index.js";
export type {
  ReviewController,
  ReviewSnapshot,
  FeedbackKind,
  SelectionTool,
  SelectionCombine,
} from "../review/index.js";
