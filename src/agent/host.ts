import { createEventBus, type HostEventBus } from "./events.js";
import { createPipelinePort, type PipelinePort } from "./pipeline/port.js";
import { createDomainViewRegistry, type DomainViewRegistry } from "./domain/registry.js";
import { createMemoryProvenance } from "./provenance/memory.js";
import { createPromptService, type PromptService, type PromptServiceOptions } from "./prompt.js";
import {
  createSession,
  type CreateSessionOptions,
  type VivaSession,
} from "./session.js";
import type { ProvenanceWriter } from "./types.js";

export type VivaAgentHost = {
  readonly id: string;
  createSession(opts: CreateSessionOptions): VivaSession;
  getSession(id: string): VivaSession | undefined;
  listSessions(): VivaSession[];
  prompt: PromptService;
  pipeline: PipelinePort;
  domains: DomainViewRegistry;
  provenance: ProvenanceWriter;
  events: HostEventBus;
  dispose(): void;
};

export type CreateHostOptions = {
  provenance?: ProvenanceWriter;
  prompt?: PromptService;
  promptOptions?: PromptServiceOptions;
};

let hostSeq = 0;

export function createVivaAgentHost(opts: CreateHostOptions = {}): VivaAgentHost {
  const id = `host_${++hostSeq}`;
  const events = createEventBus();
  const provenance = opts.provenance ?? createMemoryProvenance();
  const prompt = opts.prompt ?? createPromptService(opts.promptOptions);
  const sessions = new Map<string, VivaSession>();

  const host: VivaAgentHost = {
    id,
    prompt,
    provenance,
    events,
    pipeline: null as unknown as PipelinePort,
    domains: null as unknown as DomainViewRegistry,
    createSession(sessionOpts) {
      const session = createSession(sessionOpts, {
        hostId: id,
        events,
        provenance: sessionOpts.provenance ?? provenance,
      });
      sessions.set(session.id, session);
      session.on("disposed", () => sessions.delete(session.id));
      return session;
    },
    getSession(sessionId) {
      return sessions.get(sessionId);
    },
    listSessions() {
      return [...sessions.values()];
    },
    dispose() {
      for (const s of sessions.values()) s.dispose();
      sessions.clear();
    },
  };

  host.pipeline = createPipelinePort({
    getSession: (sid) => sessions.get(sid),
    provenance,
    events,
    hostId: id,
  });
  host.domains = createDomainViewRegistry(() => host);

  // Mirror provenance appends onto bus
  const originalAppend = provenance.append.bind(provenance);
  provenance.append = (r) => {
    const rec = originalAppend(r);
    events.emit({ type: "provenance-append", sessionId: r.sessionId, detail: rec });
    return rec;
  };

  return host;
}
