/** Node-only agent surface. Do not import from the playground / embed graph. */
export * from "./index.js";
export { startAgentHttpServer, createAgentHttpServer } from "./http-server.js";
export type { AgentHttpHandle, AgentHttpOptions } from "./http-server.js";
export { createSessionFacade } from "./session-api.js";
export type { SessionFacade, PipelineInfo, CompileSummary } from "./session-api.js";
