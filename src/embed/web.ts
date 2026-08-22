import { createVivaAgentHost, type VivaAgentHost, type VivaSession } from "../agent/index.js";
import { SYSTEM_PROMPT } from "../llm/system-prompt.js";
import type {
  FeedbackKind,
  FeedbackSeverity,
  SelectionCombine,
  SelectionRegion,
  SelectionTool,
} from "../review/types.js";

export type WebEmbedMessage =
  | { type: "viva:ready"; sessionId: string }
  | { type: "viva:compiled"; ok: boolean; error?: string | null; sourceHash?: string }
  | { type: "viva:patched"; ok: boolean; error?: string | null; sourceHash?: string }
  | { type: "viva:event"; event: string; detail?: unknown }
  | { type: "viva:svg"; svg: string }
  | { type: "viva:review"; snapshot: unknown }
  | { type: "viva:prompt"; parts: string[] }
  | { type: "viva:error"; error: string };

export type WebEmbedCommand =
  | { type: "viva:compile"; source: string; handbooks?: string[] }
  | { type: "viva:patch"; source: string; handbooks?: string[] }
  | { type: "viva:setData"; path: string; value: unknown }
  | { type: "viva:setState"; path: string; value: unknown }
  | { type: "viva:getSource" }
  | { type: "viva:exportSvg" }
  | { type: "viva:exportVector" }
  | { type: "viva:promptBundle"; handbooks?: string[] }
  | { type: "viva:reviewStart" }
  | { type: "viva:reviewStop" }
  | { type: "viva:reviewTool"; tool: SelectionTool }
  | { type: "viva:reviewCombine"; mode: SelectionCombine }
  | { type: "viva:reviewSelect"; region: SelectionRegion; combine?: SelectionCombine }
  | { type: "viva:reviewInvert" }
  | { type: "viva:reviewClear" }
  | {
      type: "viva:reviewFeedback";
      kind: FeedbackKind;
      text: string;
      severity?: FeedbackSeverity;
      tags?: string[];
    }
  | { type: "viva:reviewSnapshot" };

export type WebEmbedOptions = {
  mount: HTMLElement;
  handbooks?: string[];
  statePolicy?: "reset" | "preserve" | "preserve-data";
  /** Optional handbook bodies for browser (id → markdown). */
  handbookBodies?: Record<string, string>;
  messageTarget?: Window | null;
  targetOrigin?: string;
};

/**
 * Browser embed surface for chat/IDE agents:
 * mount a session, compile/patch Viva, communicate via postMessage.
 */
export function createVivaWebEmbed(opts: WebEmbedOptions): {
  host: VivaAgentHost;
  session: VivaSession;
  post(cmd: WebEmbedCommand): unknown;
  destroy(): void;
} {
  const host = createVivaAgentHost();
  const session = host.createSession({
    mount: opts.mount,
    handbooks: opts.handbooks ?? [],
    statePolicy: opts.statePolicy ?? "preserve-data",
  });

  const origin = opts.targetOrigin ?? "*";
  const target = opts.messageTarget ?? (typeof window !== "undefined" ? window.parent : null);

  const emit = (msg: WebEmbedMessage) => {
    target?.postMessage(msg, origin);
  };

  const unsub = session.on("compiled", () => emit({ type: "viva:event", event: "compiled" }));
  const unsub2 = session.on("patched", () => emit({ type: "viva:event", event: "patched" }));
  const unsub3 = session.on("compile-error", (e) =>
    emit({ type: "viva:event", event: "compile-error", detail: e.detail }),
  );
  const unsub4 = session.on("user-interact", (e) => {
    const detail = e.detail as { kind?: string; snapshot?: unknown } | undefined;
    if (detail?.kind === "review" && detail.snapshot) {
      emit({ type: "viva:review", snapshot: detail.snapshot });
    }
    emit({ type: "viva:event", event: "user-interact", detail: e.detail });
  });

  emit({ type: "viva:ready", sessionId: session.id });

  const post = (cmd: WebEmbedCommand): unknown => {
    switch (cmd.type) {
      case "viva:compile": {
        const result = session.compile(cmd.source, {
          reason: "generate",
          handbooks: cmd.handbooks ?? opts.handbooks,
        });
        emit({
          type: "viva:compiled",
          ok: result.ok,
          error: result.error,
          sourceHash: result.sourceHash,
        });
        return result;
      }
      case "viva:patch": {
        const result = session.patch(cmd.source, {
          reason: "user-edit",
          handbooks: cmd.handbooks ?? opts.handbooks,
        });
        emit({
          type: "viva:patched",
          ok: result.ok,
          error: result.error,
          sourceHash: result.sourceHash,
        });
        return result;
      }
      case "viva:setData":
        session.setData(cmd.path, cmd.value);
        return true;
      case "viva:setState":
        session.setState(cmd.path, cmd.value);
        return true;
      case "viva:getSource":
        return session.getSource();
      case "viva:exportSvg": {
        const svg = session.exportSvg();
        emit({ type: "viva:svg", svg });
        return svg;
      }
      case "viva:exportVector": {
        // Sync path: SVG + review brief; PDF via host CLI when needed
        const review = session.getReview()?.snapshot();
        const svg = session.exportSvg() || review?.sceneSvg || "";
        const pack = {
          svg,
          agentBrief: review?.agentBrief ?? "",
          selectionSvg: review?.selectionSvg ?? "",
          payload: review?.payload,
        };
        emit({ type: "viva:svg", svg: pack.svg });
        if (review) emit({ type: "viva:review", snapshot: review });
        return pack;
      }
      case "viva:promptBundle": {
        const ids = cmd.handbooks ?? opts.handbooks ?? [];
        const parts = [SYSTEM_PROMPT];
        for (const id of ids) {
          const body = opts.handbookBodies?.[id];
          if (body) parts.push(body);
        }
        emit({ type: "viva:prompt", parts });
        return parts;
      }
      case "viva:reviewStart": {
        const ctrl = session.createReview({ attach: true });
        return Boolean(ctrl);
      }
      case "viva:reviewStop": {
        session.getReview()?.detach();
        return true;
      }
      case "viva:reviewTool": {
        session.getReview()?.setTool(cmd.tool);
        return cmd.tool;
      }
      case "viva:reviewCombine": {
        session.getReview()?.setCombine(cmd.mode);
        return cmd.mode;
      }
      case "viva:reviewSelect": {
        const ctrl = session.createReview({ attach: false });
        return ctrl?.selectByRegion(cmd.region, cmd.combine) ?? [];
      }
      case "viva:reviewInvert": {
        session.getReview()?.invertSelection();
        return session.getReview()?.getSelection() ?? [];
      }
      case "viva:reviewClear": {
        session.getReview()?.clearSelection();
        session.getReview()?.clearFeedback();
        return true;
      }
      case "viva:reviewFeedback": {
        const ctrl = session.getReview();
        if (!ctrl) return null;
        return ctrl.addFeedback({
          kind: cmd.kind,
          text: cmd.text,
          severity: cmd.severity,
          tags: cmd.tags,
        });
      }
      case "viva:reviewSnapshot": {
        const snap = session.getReview()?.snapshot();
        if (snap) emit({ type: "viva:review", snapshot: snap });
        return snap ?? null;
      }
      default:
        emit({ type: "viva:error", error: "unknown command" });
        return null;
    }
  };

  const onMessage = (ev: MessageEvent) => {
    const data = ev.data as { type?: string } | null;
    if (!data || typeof data !== "object" || typeof data.type !== "string") return;
    if (!data.type.startsWith("viva:")) return;
    // Ignore outbound event names if echoed
    if (
      [
        "viva:ready",
        "viva:compiled",
        "viva:patched",
        "viva:event",
        "viva:svg",
        "viva:review",
        "viva:prompt",
        "viva:error",
      ].includes(data.type)
    ) {
      return;
    }
    try {
      post(data as WebEmbedCommand);
    } catch (err) {
      emit({ type: "viva:error", error: err instanceof Error ? err.message : String(err) });
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("message", onMessage);
  }

  return {
    host,
    session,
    post,
    destroy() {
      unsub();
      unsub2();
      unsub3();
      unsub4();
      if (typeof window !== "undefined") window.removeEventListener("message", onMessage);
      session.dispose();
    },
  };
}
