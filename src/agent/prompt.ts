import { SYSTEM_PROMPT_SLIM } from "../llm/system-prompt-slim.js";
import type { Diagnostic } from "../diagnostics.js";
import type { HandbookId } from "./types.js";

export type PromptBundle = {
  coreSystemPrompt: string;
  handbooks: { id: HandbookId; body: string }[];
  repairContext?: string;
  asSystemParts(): string[];
};

export type PromptService = {
  buildPromptBundle(ids?: HandbookId[], repair?: Diagnostic[]): PromptBundle;
  assertVivaSource(text: string): string;
  listHandbooks(): { id: HandbookId; title: string; path: string }[];
  loadHandbook(id: HandbookId): string;
};

export type PromptServiceOptions = {
  loadHandbook?: (id: HandbookId) => string;
  listHandbooks?: () => { id: HandbookId; title: string; path: string }[];
  corePrompt?: string;
};

export function createPromptService(opts: PromptServiceOptions = {}): PromptService {
  const core = opts.corePrompt ?? SYSTEM_PROMPT_SLIM;
  const handbookBodies = new Map<string, string>();

  const listHandbooks =
    opts.listHandbooks ??
    (() =>
      [...handbookBodies.keys()].map((id) => ({
        id,
        title: id,
        path: `handbook:${id}`,
      })));

  const loadHandbook =
    opts.loadHandbook ??
    ((id: HandbookId) => {
      const body = handbookBodies.get(id);
      if (body === undefined) throw new Error(`handbook not found: ${id}`);
      return body;
    });

  return {
    listHandbooks,
    loadHandbook,
    buildPromptBundle(ids = [], repair) {
      const handbooks = ids.map((id) => ({ id, body: loadHandbook(id) }));
      const repairContext =
        repair && repair.length
          ? repair.map((d) => ("message" in d ? String((d as { message?: string }).message) : JSON.stringify(d))).join("\n")
          : undefined;
      return {
        coreSystemPrompt: core,
        handbooks,
        repairContext,
        asSystemParts() {
          const parts = [core, ...handbooks.map((h) => h.body)];
          if (repairContext) {
            parts.push(`Previous compile diagnostics:\n${repairContext}`);
          }
          return parts;
        },
      };
    },
    assertVivaSource(text) {
      let src = text.trim();
      const fence = /^```(?:viva)?\s*([\s\S]*?)```$/i.exec(src);
      if (fence) src = fence[1]!.trim();
      if (!/^artifact\b/m.test(src)) {
        throw new Error("expected Viva source starting with artifact");
      }
      return src;
    },
  };
}

/** Register inline handbook bodies (playground / tests without fs). */
export function promptServiceWithHandbooks(
  handbooks: Record<string, string>,
  opts: PromptServiceOptions = {},
): PromptService {
  return createPromptService({
    ...opts,
    listHandbooks:
      opts.listHandbooks ??
      (() =>
        Object.keys(handbooks).map((id) => ({
          id,
          title: id,
          path: `inline:${id}`,
        }))),
    loadHandbook: opts.loadHandbook ?? ((id) => {
      if (!(id in handbooks)) throw new Error(`handbook not found: ${id}`);
      return handbooks[id]!;
    }),
  });
}
