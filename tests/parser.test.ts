import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compile } from "../src/compiler";
import { parse } from "../src/parser";
import { compileSource } from "../src/pipeline";
import { applyFrameToProps, linearMap, scalesFromFrameProps } from "../src/space";
import {
  createVivaAgentHost,
  createInlinePipeline,
  promptServiceWithHandbooks,
  fingerprint,
} from "../src/agent";
import { createNodePromptService } from "../src/agent/prompt.node";

const examplesDir = path.resolve("examples");

describe("parser and compiler", () => {
  it("parses a hello artifact", () => {
    const artifact = parse(
      `artifact "Hello"

state count = 0

scene
  size: 880 480
  layer main
    node counter
      x: 40
      y: 40
      text: count

event click on counter
  count = count + 1
`,
      "hello.viva",
    );

    expect(artifact.name).toBe("Hello");
    expect(artifact.states[0]?.name).toBe("count");
    expect(artifact.events).toHaveLength(1);
    expect(artifact.scene?.layers[0]?.items[0]?.kind).toBe("node");
  });

  it("evaluates arithmetic and logic", () => {
    const artifact = parse(`artifact Demo
state x = 2 + 3 * 4
state ok = x > 10 and true
`);
    const ir = compile(artifact);
    expect(ir.state.x).toBe(14);
    expect(ir.state.ok).toBe(true);
  });

  it("compiles every bundled example", () => {
    const files = [
      "hello.viva",
      "cities.viva",
      "cells.viva",
      "paper.viva",
      "twin.viva",
      "dashboard.viva",
      "arena.viva",
      "atelier.viva",
      "scatter.viva",
      "charts.viva",
    ];
    for (const file of files) {
      const source = readFileSync(path.join(examplesDir, file), "utf8");
      const result = compileSource(source, file);
      expect(result.error, result.error ?? file).toBeNull();
      expect(result.ir?.name).toBeTruthy();
    }
  });

  it("parses frame declarations into IR", () => {
    const artifact = parse(`artifact F
frame plot
  x: 80 720
  y: 70 400
  xlim: 0 10
  ylim: 0 100
scene
  layer m
    node p
      frame: plot
      x: 5
      y: 50
      r: 3
`);
    expect(artifact.frames[0]?.name).toBe("plot");
    const ir = compile(artifact);
    expect(ir.frames[0]?.name).toBe("plot");
  });

  it("expands chart.scatter widget", () => {
    const result = compileSource(
      `artifact C
data series = [{ x: 1, y: 2 }, { x: 3, y: 4 }]
scene
  size: 880 480
widget chart.scatter
  data: series
  xField: x
  yField: y
  xlim: 0 5
  ylim: 0 10
  areaX: 40 400
  areaY: 40 300
`,
      "c.viva",
    );
    expect(result.error).toBeNull();
    expect(result.ir!.frames.length).toBeGreaterThan(0);
    expect(result.ir!.scene.layers.some((l) => l.name.includes("marks"))).toBe(true);
  });
});

describe("space scales", () => {
  it("maps linear domains with inverted y", () => {
    expect(linearMap(5, [0, 10], [0, 100], false)).toBe(50);
    expect(linearMap(0, [0, 10], [0, 100], true)).toBe(100);
    expect(linearMap(10, [0, 10], [0, 100], true)).toBe(0);
  });

  it("applies frame props to node coordinates", () => {
    const frame = scalesFromFrameProps("plot", {
      x: [0, 100],
      y: [0, 100],
      xlim: [0, 10],
      ylim: [0, 100],
    });
    const mapped = applyFrameToProps({ frame: "plot", x: 5, y: 50, r: 3 }, [frame]);
    expect(mapped.x).toBe(50);
    expect(mapped.y).toBe(50);
  });
});

describe("agent host", () => {
  it("compiles via VivaSession without mount", () => {
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
    expect(session.getSource()).toContain("artifact");
    const bundle = session.exportProvenanceBundle();
    expect(bundle.records.some((r) => r.kind === "compile" || r.kind === "generate")).toBe(true);
    expect(fingerprint("a")).toMatch(/^[0-9a-f]+$/);
  });

  it("patches with preserve-data policy", () => {
    const host = createVivaAgentHost();
    const session = host.createSession({ mount: null, statePolicy: "preserve-data" });
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
    session.patch(`artifact A
data series = [0]
state n = 5
scene
  layer a
    node t
      x: 1
      y: 1
      text: n
`);
    const world = session.getWorld() as { data: { series: number[] }; state: { n: number } };
    expect(world.data.series).toEqual([9, 9, 9]);
    expect(world.state.n).toBe(5);
  });

  it("runs inline pipeline into session data", async () => {
    const host = createVivaAgentHost();
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

  it("loads handbooks from disk via node prompt service", () => {
    const prompt = createNodePromptService();
    const list = prompt.listHandbooks();
    expect(list.length).toBeGreaterThan(0);
    const body = prompt.loadHandbook(list[0]!.id);
    expect(body.length).toBeGreaterThan(10);
    const bundle = prompt.buildPromptBundle([list[0]!.id]);
    expect(bundle.asSystemParts().length).toBeGreaterThanOrEqual(2);
  });
});
