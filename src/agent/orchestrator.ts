import { compileSource, type PipelineCompileOptions } from "../pipeline.js";
import { repairSource } from "../repair/index.js";
import { formatCapabilities, vivaCapabilities } from "./capabilities.js";
export { vivaCapabilities, formatCapabilities } from "./capabilities.js";
import { SYSTEM_PROMPT_SLIM } from "../llm/system-prompt-slim.js";
import type { VisualIR } from "../ir.js";

export type AgentGenerateFn = (input: {
  intent: string;
  system: string;
  prior?: { source: string; diagnostics: string };
}) => Promise<string>;

export type AgentLoopResult = {
  ok: boolean;
  source: string;
  ir: VisualIR | null;
  error: string | null;
  rounds: { source: string; error: string | null; repaired: boolean }[];
};

export function productSystemPrompt(): string {
  return `${SYSTEM_PROMPT_SLIM}\n\nCapabilities:\n${formatCapabilities()}`;
}

/**
 * Short intent → generate → compile → deterministic repair → re-prompt.
 * Parser failures (no IR) also re-enter generate. No LANGUAGE.md injection.
 */
export async function runAgentLoop(opts: {
  intent: string;
  generate: AgentGenerateFn;
  maxRounds?: number;
  compile?: PipelineCompileOptions;
}): Promise<AgentLoopResult> {
  const maxRounds = Math.max(1, opts.maxRounds ?? 3);
  const system = productSystemPrompt();
  const rounds: AgentLoopResult["rounds"] = [];
  let prior: { source: string; diagnostics: string } | undefined;
  let source = "";
  let lastError: string | null = "no generation";
  let ir: VisualIR | null = null;

  for (let i = 0; i < maxRounds; i++) {
    source = await opts.generate({ intent: opts.intent, system, prior });
    let compiled = compileSource(source, `agent-round-${i}.viva`, opts.compile);
    let repaired = false;
    const notes = [
      ...(compiled.diagnostics ?? []),
      ...(compiled.error ? [{ message: compiled.error }] : []),
    ];
    if (notes.length || !compiled.ir) {
      const next = repairSource(source, notes);
      if (next.changed) {
        source = next.source;
        compiled = compileSource(source, `agent-round-${i}-repair.viva`, opts.compile);
        repaired = true;
      }
    }
    lastError = compiled.error;
    ir = compiled.ir;
    rounds.push({ source, error: compiled.error, repaired });
    if (compiled.ir && !compiled.error) {
      return { ok: true, source, ir: compiled.ir, error: null, rounds };
    }
    prior = {
      source,
      diagnostics: compiled.error ?? compiled.diagnostics?.map((d) => d.message).join("\n") ?? "compile failed",
    };
  }
  return { ok: false, source, ir, error: lastError, rounds };
}
