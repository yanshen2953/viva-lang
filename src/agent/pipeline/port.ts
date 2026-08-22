import type { VivaSession } from "../session.js";
import type {
  PipelineBinding,
  PipelineDef,
  PipelineHandle,
  PipelineInput,
  PipelinePort,
  PipelineResult,
  ProvenanceWriter,
} from "../types.js";
import type { HostEventBus } from "../events.js";

export type { PipelineDef, PipelinePort, PipelineHandle, PipelineResult };

export type PipelineContext = {
  session: VivaSession;
  input: PipelineInput;
  signal: AbortSignal;
  log: (line: string) => void;
};

export type PipelineDefFull = {
  id: string;
  title: string;
  description?: string;
  outputs: PipelineBinding[];
  inputs?: PipelineBinding[];
  launch: (ctx: PipelineContext) => Promise<PipelineResult>;
};

export function createPipelinePort(deps: {
  getSession: (id: string) => VivaSession | undefined;
  provenance: ProvenanceWriter;
  events: HostEventBus;
  hostId: string;
}): PipelinePort {
  const defs = new Map<string, PipelineDefFull>();
  const runs = new Map<string, PipelineHandle>();
  let runSeq = 0;

  return {
    register(def: PipelineDef) {
      defs.set(def.id, def as unknown as PipelineDefFull);
    },
    unregister(id: string) {
      defs.delete(id);
    },
    list() {
      return [...defs.values()] as unknown as PipelineDef[];
    },
    get(runId: string) {
      return runs.get(runId);
    },
    async cancel(runId: string) {
      const handle = runs.get(runId);
      if (handle && handle.status === "running") {
        handle.status = "cancelled";
      }
    },
    async run(id: string, input: PipelineInput = {}) {
      const def = defs.get(id);
      if (!def) throw new Error(`pipeline not registered: ${id}`);

      // Prefer explicit sessionId in values; else require caller to bind via input.values.__sessionId
      const sessionId = String(
        input.values?.__sessionId ??
          input.overrides?.__sessionId ??
          "",
      );
      const session = sessionId ? deps.getSession(sessionId) : undefined;
      if (!session) {
        throw new Error(
          "pipeline.run requires input.values.__sessionId with an active session",
        );
      }

      const runId = `run_${++runSeq}`;
      const handle: PipelineHandle = {
        runId,
        pipelineId: id,
        sessionId: session.id,
        status: "running",
      };
      runs.set(runId, handle);

      deps.events.emit({
        type: "pipeline-start",
        sessionId: session.id,
        detail: { runId, pipelineId: id },
      });

      const ac = new AbortController();
      const sampled = sampleInputs(def, session, input);
      const logs: string[] = [];

      try {
        const result = await def.launch({
          session,
          input: { ...input, values: { ...sampled, ...input.values, ...input.overrides } },
          signal: ac.signal,
          log: (line) => logs.push(line),
        });
        result.runId = result.runId || runId;
        handle.result = result;
        handle.status = result.status === "ok" ? "ok" : result.status;

        if (result.status === "ok" && result.values) {
          applyOutputs(def, session, result.values);
        }

        deps.provenance.append({
          kind: "pipeline",
          sessionId: session.id,
          hostId: deps.hostId,
          pipelineRunId: runId,
          note: result.status === "ok" ? def.title : result.error,
          dataFingerprints: result.values
            ? Object.fromEntries(
                Object.entries(result.values).map(([k, v]) => [
                  k,
                  typeof v === "string" ? v.slice(0, 32) : JSON.stringify(v).slice(0, 32),
                ]),
              )
            : undefined,
        });

        deps.events.emit({
          type: "pipeline-end",
          sessionId: session.id,
          detail: { runId, result },
        });

        return handle;
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        handle.status = "error";
        handle.result = { runId, status: "error", error };
        deps.events.emit({
          type: "pipeline-end",
          sessionId: session.id,
          detail: { runId, error },
        });
        return handle;
      }
    },
  };
}

function sampleInputs(
  def: PipelineDefFull,
  session: VivaSession,
  input: PipelineInput,
): Record<string, unknown> {
  const world = session.getWorld();
  const out: Record<string, unknown> = { ...(input.values ?? {}) };
  for (const binding of def.inputs ?? []) {
    if (input.overrides?.[binding.name] !== undefined) {
      out[binding.name] = input.overrides[binding.name];
      continue;
    }
    const root =
      binding.from === "data"
        ? world.data
        : binding.from === "state"
          ? world.state
          : world.state;
    out[binding.name] = getPathValue(root, binding.path);
  }
  return out;
}

function applyOutputs(
  def: PipelineDefFull,
  session: VivaSession,
  values: Record<string, unknown>,
): void {
  for (const binding of def.outputs) {
    const value = values[binding.name];
    if (value === undefined) continue;
    const target = binding.target ?? "data";
    if (target === "state") session.setState(binding.path, value);
    else session.setData(binding.path, value);
  }
  // Also allow direct path keys in values: "data.foo" / "state.bar"
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith("data.")) session.setData(key.slice(5), value);
    if (key.startsWith("state.")) session.setState(key.slice(6), value);
  }
}

function getPathValue(root: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** In-process pipeline: map input → values (for tests / demos). */
export function createInlinePipeline(
  id: string,
  title: string,
  fn: (input: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>,
  outputs: PipelineBinding[] = [{ name: "series", target: "data", path: "series" }],
): PipelineDefFull {
  return {
    id,
    title,
    outputs,
    async launch(ctx) {
      const values = await fn(ctx.input.values ?? {});
      return { runId: "", status: "ok", values };
    },
  };
}
