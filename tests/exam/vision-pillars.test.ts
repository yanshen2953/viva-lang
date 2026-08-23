import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { renderSvgFromIr } from "../../src/export/static-svg.js";
import { exportArtifact } from "../../src/export/index.js";
import { domainMap, domainUnmap, scalesFromFrameProps } from "../../src/space.js";
import { resolveCjkFontPath } from "../../src/export/pdf-font.js";
import { flattenNodesFromIr } from "../../src/export/static-svg.js";
import { evaluate } from "../../src/eval.js";
import { mmToPx, resolveSceneBox, COLUMN_MM } from "../../src/space/scene-box.js";
import { handleMcpTool } from "../../src/mcp/tools.js";
import { SYSTEM_PROMPT_SLIM } from "../../src/llm/system-prompt-slim.js";
import { simulate } from "../../src/simulate.js";

describe("vision pillars: board, mm, log, hover object, CJK pdf", () => {
  it("layout.board creates safe/title/body/lower frames", () => {
    const src = readFileSync("examples/board.viva", "utf8");
    const result = compileSource(src, "board.viva");
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["safe", "title", "body", "lower"]),
    );
    expect(result.ir!.scene.layers.some((l) => l.name === "__board_guides")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__body_marks")).toBe(true);
  });

  it("resolves unit: mm and single-column 89 mm to CSS px", () => {
    const box = resolveSceneBox({ unit: "mm", column: "single", height: 68 });
    expect(box.column).toBe("single");
    expect(box.width).toBeCloseTo(mmToPx(COLUMN_MM.single));
    expect(box.height).toBeCloseTo(mmToPx(68));
    const paper = compileSource(readFileSync("examples/paper-column.viva", "utf8"), "paper.viva");
    expect(paper.error).toBeNull();
    const svg = renderSvgFromIr(paper.ir!);
    expect(svg).toMatch(/viewBox="0 0 336/);
  });

  it("maps log scales through domainMap", () => {
    const y = domainMap(10, [1, 100], [400, 40], true, "log");
    const mid = domainMap(10, [1, 100], [40, 400], false, "log");
    expect(mid).toBeCloseTo(220);
    expect(y).toBeCloseTo(220);
    const scales = scalesFromFrameProps("p", {
      x: [0, 100],
      y: [0, 100],
      xlim: [1, 100],
      ylim: [1, 100],
      xScale: "log",
      yScale: "log",
    });
    expect(scales.xScale).toBe("log");
  });

  it("emits structured __hover, brush, and cross-panel highlight state", () => {
    const result = compileSource(
      `artifact H
data series = [{ x: 1, y: 2, grp: "A" }, { x: 2, y: 4, grp: "B" }]
scene
  size: 400 240
widget chart.scatter
  data: series
  xField: x
  yField: y
  group: grp
  xlim: 0 3
  ylim: 0 5
  areaX: 40 360
  areaY: 30 200
`,
      "h.viva",
    );
    expect(result.error).toBeNull();
    expect(Object.keys(result.ir!.state).sort()).toEqual(
      expect.arrayContaining(["__brush", "__highlightGrp", "__hover", "__tip"]),
    );
    expect(result.ir!.events.some((e) => e.type === "hover" && e.target === "mark")).toBe(true);
    expect(result.ir!.events.some((e) => e.type === "dragstart")).toBe(true);
    const hover = result.ir!.events.find((e) => e.type === "hover")!;
    expect(hover.body.some((s) => s.kind === "assign" && s.target[0] === "__hover")).toBe(true);
    expect(hover.body.some((s) => s.kind === "assign" && s.target[0] === "__highlightGrp")).toBe(true);
  });

  it("embeds CJK in vector PDF instead of replacing with ?", async () => {
    expect(resolveCjkFontPath()).toMatch(/VivaSansFallback\.ttf$/);
    const src = readFileSync("examples/hello.viva", "utf8");
    const pdf = await exportArtifact(src, "pdf", {}, "hello.viva");
    const text = Buffer.from(pdf.bytes).toString("latin1");
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).not.toMatch(/\?{8,}/);
    expect(pdf.bytes.byteLength).toBeGreaterThan(2000);
  }, 30_000);

  it("defaults MCP prompt to slim", async () => {
    const out = await handleMcpTool("viva_prompt", { handbookIds: [] });
    expect(out.content[0]!.text.startsWith(SYSTEM_PROMPT_SLIM.slice(0, 40))).toBe(true);
    const full = await handleMcpTool("viva_prompt", { variant: "full", handbookIds: [] });
    expect(full.content[0]!.text).toContain("Minimal template");
  });

  it("maps categorical / band values and inverts brush into the data domain", () => {
    const mid = domainMap(1, [-0.5, 2.5], [40, 340], false, "band");
    expect(mid).toBeCloseTo(190);
    expect(domainUnmap(190, [-0.5, 2.5], [40, 340], false, "band")).toBeCloseTo(1);
    const logScene = domainMap(10, [1, 100], [40, 400], false, "log");
    expect(domainUnmap(logScene, [1, 100], [40, 400], false, "log")).toBeCloseTo(10);
    const scales = scalesFromFrameProps("p", {
      x: [0, 300],
      y: [0, 200],
      xlim: [-0.5, 2.5],
      ylim: [0, 80],
      xScale: "band",
      xCats: ["placebo", "drug-A", "drug-B"],
    });
    expect(scales.xScale).toBe("band");
    expect(scales.xCats).toEqual(["placebo", "drug-A", "drug-B"]);
  });

  it("places grouped legends outside the plot and encodes string categories", () => {
    const src = readFileSync("examples/category-legend.viva", "utf8");
    const result = compileSource(src, "category-legend.viva", {
      handbookIds: ["print-nature"],
    });
    expect(result.error).toBeNull();
    const ir = result.ir!;
    const frame = ir.frames[0]!;
    expect(evaluate(frame.props.xScale!, [ir.state, ir.data])).toBe("band");
    const cats = evaluate(frame.props.xCats!, [ir.state, ir.data]);
    expect(cats).toEqual(["placebo", "drug-A", "drug-B"]);
    const rows = ir.data.arms as { __bandX?: number }[];
    expect(rows.map((r) => r.__bandX)).toEqual([0, 1, 2, 0, 1, 2]);
    const flat = flattenNodesFromIr(ir);
    const plot = flat.nodes.find((n) => n.name.endsWith("_plotBg"));
    const legend = flat.nodes.find((n) => /_leg_0$/.test(n.name));
    expect(plot).toBeTruthy();
    expect(legend).toBeTruthy();
    const plotRight = Number(plot!.props.x) + Number(plot!.props.w);
    expect(Number(legend!.props.x)).toBeGreaterThan(plotRight);
    const drag = ir.events.find((e) => e.type === "dragstart");
    expect(drag?.body.some((s) => s.kind === "assign" && s.target[1] === "dx0")).toBe(true);

    const brushed = compileSource(
      `artifact B
data series = [{ x: 1, y: 2 }, { x: 5, y: 8 }]
scene
  size: 400 240
widget chart.scatter
  data: series
  xField: x
  yField: y
  xlim: 0 10
  ylim: 0 10
  areaX: 0 200
  areaY: 0 200
`,
      "brush.viva",
    );
    expect(brushed.error).toBeNull();
    const world = simulate(brushed.ir!, {
      events: [
        {
          type: "dragstart",
          target: "__chart_1_plotBg",
          event: { x: 40, y: 160 },
        },
        {
          type: "drag",
          target: "__chart_1_plotBg",
          event: { x: 160, y: 40 },
        },
      ],
    });
    const brush = world.state.__brush as {
      on: number;
      dx0: number;
      dy0: number;
      dx1: number;
      dy1: number;
    };
    expect(brush.on).toBe(1);
    expect(brush.dx0).toBeCloseTo(2);
    expect(brush.dy0).toBeCloseTo(2);
    expect(brush.dx1).toBeCloseTo(8);
    expect(brush.dy1).toBeCloseTo(8);
  });

  it("expands Atlas (e)(f) through chart.vector / chart.funnel plugins", () => {
    const src = readFileSync("examples/figure-atlas.viva", "utf8");
    const result = compileSource(src, "figure-atlas.viva", {
      handbookIds: ["print-nature"],
    });
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["a", "b", "c", "d", "e", "f"]),
    );
    expect(result.ir!.scene.layers.some((l) => l.name === "__e_marks")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__f_marks")).toBe(true);
    const fFrame = result.ir!.frames.find((f) => f.name === "f")!;
    expect(evaluate(fFrame.props.yScale!, [result.ir!.state, result.ir!.data])).toBe("band");
  });

  it("layout.board splits body into left/right frames", () => {
    const result = compileSource(
      `artifact Split
scene
  size: 1280 720
widget layout.board
  w: 1280
  h: 720
  splits: 2
  guides: false
`,
      "split.viva",
    );
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["safe", "title", "body", "lower", "left", "right"]),
    );
  });
});
