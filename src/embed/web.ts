import { createVivaAgentHost, type VivaAgentHost, type VivaSession } from "../agent/index.js";
import { SYSTEM_PROMPT } from "../llm/system-prompt.js";

export type WebEmbedMessage =
  | { type: "viva:ready"; sessionId: string }
  | { type: "viva:compiled"; ok: boolean; error?: string | null; sourceHash?: string }
  | { type: "viva:patched"; ok: boolean; error?: string | null; sourceHash?: string }
  | { type: "viva:event"; event: string; detail?: unknown }
  | { type: "viva:svg"; svg: string }
  | { type: "viva:prompt"; parts: string[] }
  | { type: "viva:error"; error: string };

export type WebEmbedCommand =
  | { type: "viva:compile"; source: string; handbooks?: string[] }
  | { type: "viva:patch"; source: string; handbooks?: string[] }
  | { type: "viva:setData"; path: string; value: unknown }
  | { type: "viva:setState"; path: string; value: unknown }
  | { type: "viva:getSource" }
  | { type: "viva:exportSvg" }
  | { type: "viva:promptBundle"; handbooks?: string[] };

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
      if (typeof window !== "undefined") window.removeEventListener("message", onMessage);
      session.dispose();
    },
  };
}
