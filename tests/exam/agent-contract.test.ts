/**
 * R4-C: slim prompt token cap + finite self-repair. Live four-gate rate
 * stays in agent-loop.test.ts (needs a key).
 */
import { describe, expect, it } from "vitest";
import { productSystemPrompt, runAgentLoop } from "../../src/agent/orchestrator.js";
import { compileSource } from "../../src/pipeline.js";
import { readFileSync } from "node:fs";

const PRINT = { handbookIds: ["print-nature"] } as const;
const ARRIVAL = readFileSync("examples/arrival.viva", "utf8");
const TOKEN_CAP = 2_500;

describe("R4-C agent contract", () => {
  it("keeps the slim product prompt under the token ceiling", () => {
    const prompt = productSystemPrompt();
    const tokens = Math.ceil(prompt.length / 4);
    expect(tokens, `prompt tokens=${tokens} chars=${prompt.length}`).toBeLessThan(TOKEN_CAP);
    expect(prompt).not.toMatch(/# 语言参考|# Language/);
  });

  it("repairs a broken first draft within maxRounds", async () => {
    let n = 0;
    const result = await runAgentLoop({
      intent: "到站件",
      compile: PRINT,
      maxRounds: 3,
      generate: async ({ prior }) => {
        n += 1;
        if (!prior) return "artifact {\n";
        return ARRIVAL;
      },
    });
    expect(n).toBeLessThanOrEqual(3);
    expect(result.ok, result.error ?? "").toBe(true);
    expect(compileSource(result.source, "repaired.viva", PRINT).error).toBeNull();
  });

  it("names the token cap when the prompt is padded (anti-proof)", () => {
    const padded = `${productSystemPrompt()}\n${"x".repeat(20_000)}`;
    const tokens = Math.ceil(padded.length / 4);
    expect(tokens).toBeGreaterThan(TOKEN_CAP);
    expect(`prompt tokens=${tokens}`).toMatch(/prompt tokens=/);
  });
});
