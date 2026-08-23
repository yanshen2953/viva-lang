import { createVivaAgentHost, type VivaAgentHost } from "./host.js";
import { createInlinePipeline } from "./pipeline/port.js";

const INLINE_SET_ID = "inline.set";

let singleton: VivaAgentHost | undefined;

/** Built-in pipelines for HTTP / MCP remote surfaces (not auto-attached to SDK hosts). */
export function attachBuiltinPipelines(host: VivaAgentHost): void {
  const existing = new Set(host.pipeline.list().map((d) => d.id));
  if (existing.has(INLINE_SET_ID)) return;
  host.pipeline.register(
    createInlinePipeline(
      INLINE_SET_ID,
      "Write values into session data/state",
      async (input) => input,
      [],
    ),
  );
}

export function getRemoteAgentHost(): VivaAgentHost {
  if (!singleton) {
    singleton = createVivaAgentHost();
    attachBuiltinPipelines(singleton);
  }
  return singleton;
}

export function resetRemoteAgentHost(): void {
  singleton?.dispose();
  singleton = undefined;
}

export { INLINE_SET_ID };
