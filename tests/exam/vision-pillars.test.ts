import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { renderSvgFromIr } from "../../src/export/static-svg.js";
import { exportArtifact } from "../../src/export/index.js";
import { domainMap, scalesFromFrameProps } from "../../src/space.js";
import { mmToPx, resolveSceneBox, COLUMN_MM } from "../../src/space/scene-box.js";
import { handleMcpTool } from "../../src/mcp/tools.js";
import { SYSTEM_PROMPT_SLIM } from "../../src/llm/system-prompt-slim.js";

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
});
