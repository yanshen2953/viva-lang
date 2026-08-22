import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  createInlinePipeline,
  createMemoryProvenance,
  createVivaAgentHost,
  promptServiceWithHandbooks,
  fingerprint,
} from "../../src/agent";
import { createNodePromptService } from "../../src/agent/prompt.node";

const examDir = path.resolve("examples/exam");

describe("agent host: session compile/patch/provenance on exam fixtures", () => {
  it("compiles an exam layer fixture through a VivaSession", () => {
    const host = createVivaAgentHost();
    const session = host.createSession({ mount: null });
    const src = readFileSync(path.join(examDir, "L5_blur_glow.viva"), "utf8");
    const result = session.compile(src);
    expect(result.ok).toBe(true);
    const ir = session.getIR()!;
    expect(ir.scene.layers.map((l) => l.name)).toEqual(["soft"]);
    expect(session.getSource()).toContain("artifact");
  });

  it("patches preserving a shared data key (preserve-data policy)", () => {
    const host = createVivaAgentHost();
    const session = host.createSession({ mount: null, statePolicy: "preserve-data" });
    // Both sources declare `series`, so patch must keep the runtime-set value.
    session.compile(`artifact A
data series = [1, 2]
state n = 0
scene
  layer a
    node t
      x: 1
      y: 1
      text: n
`);
    session.setData("series", [9, 9, 9]);
    const result = session.patch(`artifact A
data series = [0]
state n = 5
scene
  layer a
    node t
      x: 1
      y: 1
      text: n
`);
    expect(result.ok).toBe(true);
    const world = session.getWorld() as { data: { series: number[] }; state: { n: number } };
    expect(world.data.series).toEqual([9, 9, 9]);
    expect(world.state.n).toBe(5);
  });

  it("runs an inline pipeline and records provenance", async () => {
    const provenance = createMemoryProvenance();
    const host = createVivaAgentHost({ provenance });
    const session = host.createSession({ mount: null });
    session.compile(`artifact P
data series = []
scene
  layer a
    node t
      x: 0
      y: 0
      text: "p"
`);
    host.pipeline.register(
      createInlinePipeline("gen", "Generate", async () => ({
        series: [{ x: 1, y: 2 }],
      })),
    );
    const handle = await host.pipeline.run("gen", {
      values: { __sessionId: session.id },
    });
    expect(handle.status).toBe("ok");
    const world = session.getWorld() as { data: { series: unknown[] } };
    expect(world.data.series).toEqual([{ x: 1, y: 2 }]);
    expect(host.provenance.list(session.id).some((r) => r.kind === "pipeline")).toBe(true);
  });

  it("exports a provenance bundle with source and svg snapshot", () => {
    const host = createVivaAgentHost();
    const session = host.createSession({ mount: null });
    const src = readFileSync(path.join(examDir, "L4_blend.viva"), "utf8");
    session.compile(src);
    const bundle = session.exportProvenanceBundle();
    expect(bundle.latestSource).toContain("artifact");
    expect(bundle.records.some((r) => r.kind === "compile" || r.kind === "export")).toBe(true);
    expect(fingerprint("a")).toMatch(/^[0-9a-f]+$/);
  });

  it("loads a handbook via the node prompt service (bundle has system parts)", () => {
    const prompt = createNodePromptService();
    const list = prompt.listHandbooks();
    expect(list.length).toBeGreaterThan(0);
    const body = prompt.loadHandbook(list[0]!.id);
    expect(body.length).toBeGreaterThan(10);
    const bundle = prompt.buildPromptBundle([list[0]!.id]);
    expect(bundle.asSystemParts().length).toBeGreaterThanOrEqual(1);
  });

  it("compiles with a handbook-loaded prompt service", () => {
    const host = createVivaAgentHost({
      prompt: promptServiceWithHandbooks({ demo: "# handbook\n" }),
    });
    const session = host.createSession({ mount: null, handbooks: ["demo"] });
    const result = session.compile(`artifact "S"
state n = 1
scene
  layer a
    node t
      x: 10
      y: 10
      text: n
`);
    expect(result.ok).toBe(true);
  });
});
