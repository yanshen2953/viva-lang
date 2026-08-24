import { compileSource } from "../pipeline.js";
import { repairSource } from "../repair/index.js";
import { Runtime } from "../runtime.js";
import { simulate } from "../simulate.js";
import type { VisualIR } from "../ir.js";
import type { Diagnostic } from "../diagnostics.js";
import { fingerprint } from "./provenance/hash.js";
import { attachBundleExtras, dataFingerprints } from "./provenance/memory.js";
import type { HostEventBus } from "./events.js";
import {
  createReviewController,
  listSelectableNodes,
  runtimeReviewView,
  type ReviewController,
  type ReviewSnapshot,
} from "../review/index.js";
import { renderSvgFromIr } from "../export/static-svg.js";
import { renderVectorPdfFromIr } from "../export/vector-pdf.js";
import {
  resolveSessionHandbooks,
} from "./handbook.js";
import type {
  ArtifactSnapshot,
  CompileMeta,
  HandbookId,
  ProvenanceWriter,
  SessionCompileResult,
  SessionEvent,
  SessionEventType,
  StatePolicy,
} from "./types.js";

export type CreateSessionOptions = {
  mount?: HTMLElement | null;
  handbooks?: HandbookId[];
  statePolicy?: StatePolicy;
  title?: string;
  provenance?: ProvenanceWriter;
};

export type VivaSession = {
  readonly id: string;
  readonly hostId: string;
  compile(source: string, meta?: CompileMeta): SessionCompileResult;
  patch(source: string, meta?: CompileMeta): SessionCompileResult;
  getSource(): string;
  getIR(): VisualIR | null;
  getWorld(): { state: unknown; data: unknown };
  setData(path: string, value: unknown): void;
  setState(path: string, value: unknown): void;
  watch(path: string, cb: (v: unknown) => void): () => void;
  on(event: SessionEventType, cb: (e: SessionEvent) => void): () => void;
  exportSvg(): string;
  /** SVG + source + provenance bundle for takeaway (H6). */
  exportPackage(): {
    source: string;
    svg: string;
    provenance: ReturnType<ProvenanceWriter["exportBundle"]>;
    snapshot: ArtifactSnapshot;
  };
  /**
   * Vector takeaway: precise SVG (with data-viva-id) + optional vector PDF bytes
   * + review snapshot/agentBrief when review is active.
   */
  exportVectorPackage(opts?: { pdf?: boolean }): Promise<{
    source: string;
    svg: string;
    pdf?: Uint8Array;
    review?: ReviewSnapshot;
    provenance: ReturnType<ProvenanceWriter["exportBundle"]>;
  }>;
  /** Photoshop-like selection + rich feedback for agent repair. */
  createReview(opts?: { attach?: boolean }): ReviewController | null;
  getReview(): ReviewController | null;
  /** Headless tick/event stepping when mount is null (or alongside runtime world). */
  simulate(opts?: { ticks?: number; events?: { type: string; target: string; event?: Record<string, unknown> }[] }): {
    state: unknown;
    data: unknown;
  };
  snapshot(): ArtifactSnapshot;
  exportProvenanceBundle(): ReturnType<ProvenanceWriter["exportBundle"]>;
  dispose(): void;
};

type SessionDeps = {
  hostId: string;
  events: HostEventBus;
  provenance: ProvenanceWriter;
};

let sessionSeq = 0;

export function createSession(
  opts: CreateSessionOptions,
  deps: SessionDeps,
): VivaSession {
  const id = `sess_${++sessionSeq}`;
  const statePolicy = opts.statePolicy ?? "preserve-data";
  const handbooks = opts.handbooks ?? [];
  const provenance = opts.provenance ?? deps.provenance;
  const mount = opts.mount ?? null;

  let source = "";
  let sourceHash = fingerprint("");
  let ir: VisualIR | null = null;
  let irHash: string | undefined;
  let runtime: Runtime | null = null;
  let review: ReviewController | null = null;
  const watchers = new Map<string, Set<(v: unknown) => void>>();
  const listeners = new Map<SessionEventType, Set<(e: SessionEvent) => void>>();

  const emit = (type: SessionEventType, detail?: unknown) => {
    const event: SessionEvent = { sessionId: id, type, ts: Date.now(), detail };
    for (const cb of listeners.get(type) ?? []) cb(event);
    deps.events.emit({ type, sessionId: id, detail });
  };

  const notifyWatchers = () => {
    const world = runtime?.getWorld() ?? (ir ? { state: ir.state, data: ir.data } : null);
    if (!world) return;
    for (const [path, cbs] of watchers) {
      const value = readPath(world, path);
      for (const cb of cbs) cb(value);
    }
    emit("world-change");
  };

  const mountRuntime = (nextIr: VisualIR, prevWorld?: { state: unknown; data: unknown }) => {
    const merged = applyStatePolicy(nextIr, statePolicy, prevWorld);
    ir = merged;
    if (!mount) return;
    const hadReview = Boolean(review);
    review?.destroy();
    review = null;
    runtime?.stop();
    runtime = new Runtime({ mount, ir: merged });
    runtime.start();
    if (hadReview) {
      ensureReview(true);
    }
    provenance.append({
      kind: "run",
      sessionId: id,
      hostId: deps.hostId,
      sourceHash,
      irHash,
    });
  };

  const ensureReview = (attach: boolean): ReviewController | null => {
    if (!runtime || !ir) return null;
    if (review) {
      if (attach) review.attach();
      return review;
    }
    review = createReviewController({
      runtime: runtimeReviewView(runtime, () => (ir ? listSelectableNodes(ir) : [])),
      getSource: () => source,
      onChange: (snap) => emit("user-interact", { kind: "review", snapshot: snap }),
    });
    if (attach) review.attach();
    return review;
  };

  const doCompile = (
    nextSource: string,
    meta: CompileMeta | undefined,
    kind: "compile" | "patch",
  ): SessionCompileResult => {
    const prevHash = sourceHash;
    const prevWorld =
      runtime?.getWorld() ??
      (ir ? { state: ir.state, data: ir.data } : undefined);
    const activeHandbooks = resolveSessionHandbooks(meta, handbooks);
    let usedSource = nextSource;
    let result = compileSource(usedSource, `${id}.viva`, {
      handbookIds: activeHandbooks.length ? activeHandbooks : undefined,
      check: { structural: true },
    });
    if (result.ir) {
      const repaired = repairSource(usedSource, [
        ...result.diagnostics,
        ...(result.checkDiagnostics ?? []),
      ]);
      if (repaired.changed) {
        const again = compileSource(repaired.source, `${id}.viva`, {
          handbookIds: activeHandbooks.length ? activeHandbooks : undefined,
          check: { structural: true },
        });
        if (again.ir) {
          usedSource = repaired.source;
          result = again;
          result.diagnostics = [
            ...result.diagnostics,
            {
              message: `applied ${repaired.plan.patches.length} deterministic repair(s)`,
              code: "repair.applied",
              span: { line: 1, column: 1 },
              hint: repaired.plan.notes.join("; "),
            },
          ];
        }
      }
    }
    const nextHash = fingerprint(usedSource);
    const diagnostics: Diagnostic[] = result.diagnostics.length
      ? result.diagnostics
      : result.error
        ? [{ message: result.error, span: { line: 1, column: 1 } }]
        : [];

    if (!result.ir) {
      provenance.append({
        kind,
        sessionId: id,
        hostId: deps.hostId,
        sourceHash: nextHash,
        prevSourceHash: kind === "patch" ? prevHash : undefined,
        diagnostics,
        promptDigest: meta?.promptDigest,
        modelId: meta?.modelId,
        handbooks: resolveSessionHandbooks(meta, handbooks),
        note: result.error ?? "compile failed",
      });
      emit("compile-error", { error: result.error });
      return {
        ok: false,
        diagnostics,
        sourceHash: nextHash,
        ir,
        error: result.error,
      };
    }

    source = usedSource;
    sourceHash = nextHash;
    irHash = fingerprint(result.ir);
    mountRuntime(result.ir, kind === "patch" ? prevWorld : undefined);

    provenance.append({
      kind: meta?.reason === "generate" ? "generate" : kind,
      sessionId: id,
      hostId: deps.hostId,
      sourceHash,
      prevSourceHash: kind === "patch" ? prevHash : undefined,
      irHash,
      handbooks: meta?.handbooks ?? handbooks,
      promptDigest: meta?.promptDigest,
      modelId: meta?.modelId,
      dataFingerprints: dataFingerprints(result.ir.data),
    });

    emit(kind === "patch" ? "patched" : "compiled", { sourceHash, irHash });
    notifyWatchers();
    const checkWarnings = result.checkDiagnostics ?? [];
    return {
      ok: true,
      diagnostics: checkWarnings,
      sourceHash,
      irHash,
      ir: result.ir,
      error: null,
    };
  };

  const session: VivaSession = {
    id,
    hostId: deps.hostId,
    compile(src, meta) {
      return doCompile(src, meta, "compile");
    },
    patch(src, meta) {
      return doCompile(src, meta, "patch");
    },
    getSource: () => source,
    getIR: () => ir,
    getWorld: () => runtime?.getWorld() ?? { state: ir?.state ?? {}, data: ir?.data ?? {} },
    setData(path, value) {
      if (runtime) runtime.setData(path, value);
      else if (ir) setDeepObj(ir.data, path, value);
      notifyWatchers();
    },
    setState(path, value) {
      if (runtime) runtime.setState(path, value);
      else if (ir) setDeepObj(ir.state, path, value);
      notifyWatchers();
    },
    watch(path, cb) {
      if (!watchers.has(path)) watchers.set(path, new Set());
      watchers.get(path)!.add(cb);
      return () => watchers.get(path)?.delete(cb);
    },
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
      return () => listeners.get(event)?.delete(cb);
    },
    exportSvg() {
      const svg = runtime?.exportSvg() ?? "";
      provenance.append({
        kind: "export",
        sessionId: id,
        hostId: deps.hostId,
        sourceHash,
        irHash,
        note: "svg",
      });
      return svg;
    },
    exportPackage() {
      const snap = session.snapshot();
      const provenanceBundle = provenance.exportBundle(id);
      const pack = attachBundleExtras(provenanceBundle, {
        latestSource: source,
        latestSvg: snap.svg,
        snapshot: snap,
      });
      provenance.append({
        kind: "export",
        sessionId: id,
        hostId: deps.hostId,
        sourceHash,
        irHash,
        note: "package",
      });
      return {
        source,
        svg: snap.svg ?? "",
        provenance: pack,
        snapshot: snap,
      };
    },
    async exportVectorPackage(opts = {}) {
      const svg =
        runtime?.exportSvg() ||
        (ir ? renderSvgFromIr(ir) : "");
      let pdf: Uint8Array | undefined;
      if (opts.pdf !== false && ir) {
        pdf = await renderVectorPdfFromIr(ir);
      }
      const reviewSnap = review?.snapshot();
      provenance.append({
        kind: "export",
        sessionId: id,
        hostId: deps.hostId,
        sourceHash,
        irHash,
        note: "vector-package",
      });
      return {
        source,
        svg,
        pdf,
        review: reviewSnap,
        provenance: provenance.exportBundle(id),
      };
    },
    createReview(opts = {}) {
      return ensureReview(opts.attach !== false);
    },
    getReview: () => review,
    simulate(opts = {}) {
      if (!ir) return { state: {}, data: {} };
      const world = simulate(ir, opts);
      if (runtime) {
        runtime.replaceWorld(world);
      } else {
        Object.assign(ir.state, world.state);
        Object.assign(ir.data, world.data);
      }
      notifyWatchers();
      return world;
    },
    snapshot() {
      const world = session.getWorld();
      const snap: ArtifactSnapshot = {
        sessionId: id,
        ts: Date.now(),
        source,
        sourceHash,
        irHash,
        state: world.state,
        data: world.data,
        handbooks,
        svg: runtime?.exportSvg(),
      };
      provenance.append({
        kind: "snapshot",
        sessionId: id,
        hostId: deps.hostId,
        sourceHash,
        irHash,
      });
      return snap;
    },
    exportProvenanceBundle() {
      const snap = session.snapshot();
      const bundle = provenance.exportBundle(id);
      return attachBundleExtras(bundle, {
        latestSource: source,
        latestSvg: snap.svg,
        snapshot: snap,
      });
    },
    dispose() {
      review?.destroy();
      review = null;
      runtime?.stop();
      runtime = null;
      emit("disposed");
    },
  };

  return session;
}

function applyStatePolicy(
  nextIr: VisualIR,
  policy: StatePolicy,
  prev?: { state: unknown; data: unknown },
): VisualIR {
  if (!prev || policy === "reset") return nextIr;
  const ir = {
    ...nextIr,
    state: { ...nextIr.state },
    data: { ...nextIr.data },
  };
  if (policy === "preserve" || policy === "preserve-data") {
    ir.data = deepMerge(
      ir.data as Record<string, unknown>,
      (prev.data ?? {}) as Record<string, unknown>,
    );
  }
  if (policy === "preserve") {
    ir.state = deepMerge(
      ir.state as Record<string, unknown>,
      (prev.state ?? {}) as Record<string, unknown>,
    );
  }
  return ir;
}

function deepMerge(
  base: Record<string, unknown>,
  overlay: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (k in out) out[k] = v;
  }
  return out;
}

function readPath(world: { state: unknown; data: unknown }, path: string): unknown {
  if (path.startsWith("data.")) return getDeep(world.data, path.slice(5));
  if (path.startsWith("state.")) return getDeep(world.state, path.slice(6));
  return getDeep(world.state, path) ?? getDeep(world.data, path);
}

function getDeep(root: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let cur: unknown = root;
  for (const p of parts) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setDeepObj(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".").filter(Boolean);
  let cur: Record<string, unknown> = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    if (!cur[key] || typeof cur[key] !== "object") cur[key] = {};
    cur = cur[key] as Record<string, unknown>;
  }
  if (parts.length) cur[parts[parts.length - 1]!] = value;
}
