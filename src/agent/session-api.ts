/**
 * Shared Session / Pipeline / Provenance facade for HTTP and MCP.
 */
import type { VivaAgentHost } from "./host.js";
import type { VivaSession } from "./session.js";
import type {
  CompileMeta,
  PipelineBinding,
  PipelineHandle,
  StatePolicy,
} from "./types.js";
import { createHttpWebhookPipeline } from "./pipeline/adapters/http-webhook.js";
import { createInlinePipeline } from "./pipeline/port.js";
import { attachHotPathVisual } from "../check/index.js";

export type SessionSummary = {
  id: string;
  artifact: string | null;
  sourceHash?: string;
};

export type CompileSummary = {
  ok: boolean;
  sessionId: string;
  artifact: string | null;
  diagnostics: unknown[];
  sourceHash: string;
  irHash?: string;
  error?: string | null;
  ir?: unknown;
  visualOk?: boolean;
};

export type PipelineInfo = {
  id: string;
  title: string;
  description?: string;
  outputs: PipelineBinding[];
  inputs?: PipelineBinding[];
};

function requireSession(host: VivaAgentHost, id: string): VivaSession {
  const session = host.getSession(id);
  if (!session) throw new Error(`session not found: ${id}`);
  return session;
}

export function pipelineInfo(def: {
  id: string;
  title: string;
  description?: string;
  outputs: PipelineBinding[];
  inputs?: PipelineBinding[];
}): PipelineInfo {
  return {
    id: def.id,
    title: def.title,
    description: def.description,
    outputs: def.outputs,
    inputs: def.inputs,
  };
}

export function summarizeCompile(
  session: VivaSession,
  result: ReturnType<VivaSession["compile"]>,
  includeIr = false,
): CompileSummary {
  return {
    ok: result.ok,
    sessionId: session.id,
    artifact: result.ir?.name ?? null,
    diagnostics: result.diagnostics,
    sourceHash: result.sourceHash,
    irHash: result.irHash,
    error: result.error ?? null,
    ...(includeIr ? { ir: result.ir } : {}),
  };
}

export function createSessionFacade(host: VivaAgentHost) {
  return {
    create(opts: {
      handbooks?: string[];
      statePolicy?: StatePolicy;
      title?: string;
    }) {
      const session = host.createSession({
        mount: null,
        handbooks: opts.handbooks,
        statePolicy: opts.statePolicy,
        title: opts.title,
      });
      return {
        id: session.id,
        hostId: host.id,
        handbooks: opts.handbooks ?? [],
        statePolicy: opts.statePolicy ?? "preserve-data",
      };
    },

    list(): SessionSummary[] {
      return host.listSessions().map((s) => ({
        id: s.id,
        artifact: s.getIR()?.name ?? null,
      }));
    },

    get(sessionId: string) {
      const session = requireSession(host, sessionId);
      return {
        id: session.id,
        artifact: session.getIR()?.name ?? null,
        source: session.getSource(),
        world: session.getWorld(),
      };
    },

    async compile(
      sessionId: string,
      source: string,
      meta?: CompileMeta,
      includeIr = false,
    ): Promise<CompileSummary> {
      const session = requireSession(host, sessionId);
      const compiled = session.compile(source, meta);
      const attached = await attachHotPathVisual(compiled, { source });
      const summary = summarizeCompile(session, attached, includeIr);
      summary.visualOk = attached.visualOk;
      return summary;
    },

    async patch(
      sessionId: string,
      source: string,
      meta?: CompileMeta,
      includeIr = false,
    ): Promise<CompileSummary> {
      const session = requireSession(host, sessionId);
      const patched = session.patch(source, meta);
      const attached = await attachHotPathVisual(patched, { source });
      const summary = summarizeCompile(session, attached, includeIr);
      summary.visualOk = attached.visualOk;
      return summary;
    },

    world(sessionId: string) {
      const session = requireSession(host, sessionId);
      return { sessionId: session.id, ...session.getWorld() };
    },

    set(sessionId: string, target: "data" | "state", path: string, value: unknown) {
      const session = requireSession(host, sessionId);
      if (target === "state") session.setState(path, value);
      else session.setData(path, value);
      return { sessionId: session.id, ...session.getWorld() };
    },

    simulate(
      sessionId: string,
      opts: {
        ticks?: number;
        events?: { type: string; target: string; event?: Record<string, unknown> }[];
      } = {},
    ) {
      const session = requireSession(host, sessionId);
      const world = session.simulate(opts);
      return { sessionId: session.id, ...world };
    },

    provenance(sessionId: string) {
      return host.provenance.list(sessionId);
    },

    bundle(sessionId: string) {
      return requireSession(host, sessionId).exportProvenanceBundle();
    },

    dispose(sessionId: string) {
      requireSession(host, sessionId).dispose();
      return { ok: true, id: sessionId };
    },

    listPipelines(): PipelineInfo[] {
      return host.pipeline.list().map((d) => pipelineInfo(d));
    },

    async runPipeline(
      pipelineId: string,
      input: {
        sessionId: string;
        values?: Record<string, unknown>;
        overrides?: Record<string, unknown>;
      },
    ): Promise<PipelineHandle> {
      requireSession(host, input.sessionId);
      return host.pipeline.run(pipelineId, {
        sessionId: input.sessionId,
        values: { ...input.values, __sessionId: input.sessionId },
        overrides: input.overrides,
      });
    },

    registerPipeline(def: {
      id: string;
      title: string;
      kind?: "inline" | "http-webhook";
      url?: string;
      description?: string;
      outputs?: PipelineBinding[];
    }) {
      const kind = def.kind ?? (def.url ? "http-webhook" : "inline");
      if (kind === "http-webhook") {
        if (!def.url) throw new Error("http-webhook pipeline requires url");
        host.pipeline.register(
          createHttpWebhookPipeline({
            id: def.id,
            title: def.title,
            description: def.description,
            url: def.url,
            outputs: def.outputs ?? [],
          }),
        );
      } else {
        host.pipeline.register(
          createInlinePipeline(
            def.id,
            def.title,
            async (input) => input,
            def.outputs ?? [],
          ),
        );
      }
      return pipelineInfo(host.pipeline.list().find((d) => d.id === def.id)!);
    },

    async cancelPipeline(runId: string) {
      await host.pipeline.cancel(runId);
      return host.pipeline.get(runId) ?? { runId, status: "cancelled" };
    },

    getPipelineRun(runId: string) {
      const handle = host.pipeline.get(runId);
      if (!handle) throw new Error(`pipeline run not found: ${runId}`);
      return handle;
    },
  };
}

export type SessionFacade = ReturnType<typeof createSessionFacade>;
