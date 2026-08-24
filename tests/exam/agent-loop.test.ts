import { describe, expect, it } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { runAgentLoop, productSystemPrompt } from "../../src/agent/orchestrator.js";
import { COLUMN_MM } from "../../src/space/scene-box.js";
import { evaluate } from "../../src/eval.js";

const PRINT = { handbookIds: ["print-nature"] } as const;
const ARRIVAL = readFileSync("examples/arrival.viva", "utf8");

function extractViva(text: string): string {
  let src = text.trim();
  const fence = /```(?:viva)?\s*([\s\S]*?)```/im.exec(src);
  if (fence) src = fence[1]!.trim();
  const idx = src.search(/^artifact\b/m);
  if (idx >= 0) src = src.slice(idx);
  return src.trim();
}

function cellWidth(ir: NonNullable<ReturnType<typeof compileSource>["ir"]>, name: string): number {
  const frame = ir.frames.find((f) => f.name === name);
  if (!frame?.props.cellX) return 0;
  const cellX = evaluate(frame.props.cellX, [ir.state, ir.data]) as number[];
  return cellX[1]! - cellX[0]!;
}

describe("agent loop", () => {
  it("re-enters generate when the first source has no IR, then compiles arrival", async () => {
    let n = 0;
    const result = await runAgentLoop({
      intent: "到站件",
      compile: PRINT,
      generate: async ({ system, prior }) => {
        expect(system).toBe(productSystemPrompt());
        expect(system).not.toMatch(/# 语言参考|# Language/);
        n += 1;
        if (!prior) return "artifact {\n  state:\n    n: 0\n";
        return ARRIVAL;
      },
    });
    expect(n).toBe(2);
    expect(result.ok).toBe(true);
    expect(result.rounds[0]!.error).toBeTruthy();
    expect(result.ir?.timeline?.beats).toBe(4);
  });

  it("repairs a top-level unit: into scene without a second generate", async () => {
    const orphan = ARRIVAL.replace(/\nscene\n/, "\nunit: mm\nscene\n");
    expect(orphan).toMatch(/^unit: mm$/m);
    let n = 0;
    const result = await runAgentLoop({
      intent: "到站件",
      compile: PRINT,
      generate: async () => {
        n += 1;
        return orphan;
      },
    });
    expect(n).toBe(1);
    expect(result.ok, result.error ?? "").toBe(true);
    expect(result.rounds[0]!.repaired).toBe(true);
    expect(result.source).toMatch(/^  unit: mm$/m);
    expect(result.source).not.toMatch(/^unit: mm$/m);
  });

  it.skipIf(!process.env.DEEPSEEK_API_KEY)(
    "generates an arrival-class piece from a short intent without LANGUAGE.md",
    async () => {
      const key = process.env.DEEPSEEK_API_KEY!;
      const result = await runAgentLoop({
        intent:
          "写一份 A4 双栏到站件：print-nature，89mm span:1 与 183mm span:2，CJK 标题，可拖 World tokens，brush，四拍 play，跨页。不要手写 inset/areaX。",
        compile: PRINT,
        maxRounds: 3,
        generate: async ({ intent, system, prior }) => {
          expect(system).not.toMatch(/docs\/LANGUAGE|# 语言参考/);
          const user = prior
            ? `Intent:\n${intent}\n\nPrevious source failed:\n${prior.source}\n\nDiagnostics:\n${prior.diagnostics}\n\nOutput repaired Viva only.`
            : intent;
          const res = await fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "deepseek-chat",
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
              temperature: 0.2,
            }),
          });
          const json = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
            error?: { message?: string };
          };
          if (!res.ok) throw new Error(json.error?.message ?? `deepseek ${res.status}`);
          return extractViva(json.choices?.[0]?.message?.content ?? "");
        },
      });
      mkdirSync("/opt/cursor/artifacts", { recursive: true });
      writeFileSync("/opt/cursor/artifacts/agent-loop-live.viva", result.source);
      writeFileSync(
        "/opt/cursor/artifacts/agent-loop-live.json",
        JSON.stringify(
          {
            ok: result.ok,
            error: result.error,
            rounds: result.rounds.map((r) => ({ error: r.error, repaired: r.repaired, chars: r.source.length })),
          },
          null,
          2,
        ),
      );
      expect(result.ok, result.error ?? "").toBe(true);
      expect(result.source).not.toMatch(/(^|\n)\s*(areaX|areaY|insetL)\s*:/);
      const compiled = compileSource(result.source, "agent-arrival.viva", PRINT);
      expect(compiled.error, compiled.error ?? "").toBeNull();
      const ir = compiled.ir!;
      expect(ir.timeline?.beats).toBeGreaterThanOrEqual(4);
      expect(ir.events.some((e) => e.type === "drag")).toBe(true);
      expect(result.source).toMatch(/[\u4e00-\u9fff]/);
      const widths = ["a", "b", "c"]
        .map((name) => cellWidth(ir, name))
        .filter((w) => w > 0)
        .sort((x, y) => x - y);
      expect(widths[0]).toBeGreaterThan(COLUMN_MM.single * 0.7);
      expect(widths[widths.length - 1]).toBeGreaterThan(COLUMN_MM.double * 0.7);
    },
    180_000,
  );
});
