import type { VisualIR } from "../ir.js";
import type { Diagnostic } from "../diagnostics.js";

export type HandbookId = string;
export type StatePolicy = "reset" | "preserve" | "preserve-data";

export type CompileMeta = {
  reason?: "generate" | "repair" | "user-edit" | "pipeline" | "restore";
  promptDigest?: string;
  modelId?: string;
  handbooks?: HandbookId[];
};

export type SessionCompileResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
  sourceHash: string;
  irHash?: string;
  ir: VisualIR | null;
  error?: string | null;
};

export type ArtifactSnapshot = {
  sessionId: string;
  ts: number;
  source: string;
  sourceHash: string;
  irHash?: string;
  state: unknown;
  data: unknown;
  handbooks: HandbookId[];
  svg?: string;
};

export type SessionEventType =
  | "compiled"
  | "patched"
  | "compile-error"
  | "world-change"
  | "user-interact"
  | "disposed";

export type HostEventType =
  | SessionEventType
  | "pipeline-start"
  | "pipeline-end"
  | "domain-selection"
  | "provenance-append";

export type SessionEvent = {
  sessionId: string;
  type: SessionEventType;
  ts: number;
  detail?: unknown;
};

export type HostEvent = {
  type: HostEventType;
  ts: number;
  sessionId?: string;
  detail?: unknown;
};

export type JsonSchema = Record<string, unknown>;

export type PipelineBinding = {
  name: string;
  target?: "data" | "state";
  from?: "data" | "state" | "event";
  path: string;
  schema?: JsonSchema;
};

export type PipelineArtifact = {
  name: string;
  uri: string;
  mediaType: string;
  suggestDomainView?: string;
};

export type PipelineResult = {
  runId: string;
  status: "ok" | "error" | "cancelled";
  values?: Record<string, unknown>;
  artifacts?: PipelineArtifact[];
  logUri?: string;
  error?: string;
};

export type PipelineInput = {
  /** Preferred over values.__sessionId */
  sessionId?: string;
  values?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
};

export type ProvenanceKind =
  | "generate"
  | "compile"
  | "patch"
  | "run"
  | "interact"
  | "pipeline"
  | "domain"
  | "export"
  | "handbook"
  | "snapshot";

export type ProvenanceRecord = {
  id: string;
  ts: number;
  kind: ProvenanceKind;
  sessionId: string;
  hostId?: string;
  sourceHash?: string;
  prevSourceHash?: string;
  irHash?: string;
  handbooks?: HandbookId[];
  promptDigest?: string;
  modelId?: string;
  dataFingerprints?: Record<string, string>;
  pipelineRunId?: string;
  domainViewId?: string;
  diagnostics?: Diagnostic[];
  note?: string;
};

export type ProvenanceBundle = {
  version: 1;
  exportedAt: number;
  sessionId: string;
  records: ProvenanceRecord[];
  latestSource?: string;
  latestSvg?: string;
  snapshot?: ArtifactSnapshot;
};

export type DomainSelection = {
  kind: string;
  ids: string[];
  payload?: unknown;
};

export type ProvenanceWriter = {
  append(
    r: Omit<ProvenanceRecord, "id" | "ts"> & { ts?: number },
  ): ProvenanceRecord;
  list(sessionId: string): ProvenanceRecord[];
  listAll(): ProvenanceRecord[];
  exportBundle(sessionId: string): ProvenanceBundle;
  clear?(sessionId?: string): void;
};

export type PipelineHandle = {
  runId: string;
  pipelineId: string;
  sessionId: string;
  status: "running" | "ok" | "error" | "cancelled";
  result?: PipelineResult;
};

export type PipelineDef = {
  id: string;
  title: string;
  description?: string;
  outputs: PipelineBinding[];
  inputs?: PipelineBinding[];
  launch: (ctx: {
    session: { id: string; setData(path: string, value: unknown): void; setState(path: string, value: unknown): void; getWorld(): { state: unknown; data: unknown } };
    input: PipelineInput;
    signal: AbortSignal;
    log: (line: string) => void;
  }) => Promise<PipelineResult>;
};

export type PipelinePort = {
  register(def: {
    id: string;
    title: string;
    description?: string;
    outputs: PipelineBinding[];
    inputs?: PipelineBinding[];
    launch: (ctx: never) => Promise<PipelineResult>;
  }): void;
  unregister(id: string): void;
  list(): PipelineDef[];
  run(id: string, input?: PipelineInput): Promise<PipelineHandle>;
  cancel(runId: string): Promise<void>;
  get(runId: string): PipelineHandle | undefined;
};


