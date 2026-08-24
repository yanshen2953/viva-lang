/**
 * Arrival exam — the four doors, not “interfaces exist”.
 *
 * Same small sources. A door is closed only when the assertion matches the
 * user-visible bar. This file locks the measurable floor and records the
 * holes so a green `npm test` cannot be read as “we arrived”.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { flattenNodesFromIr, nodePainted, renderSvgFromIr } from "../../src/export/static-svg.js";
import { exportArtifact, exportBeatSequence } from "../../src/export/index.js";
import { evaluate } from "../../src/eval.js";
import {
  COLUMN_MM,
  evalSceneProps,
  mmToPx,
  resolveSceneBox,
} from "../../src/space/scene-box.js";
import { PDFDocument } from "pdf-lib";
import { handleMcpTool } from "../../src/mcp/tools.js";
import { SYSTEM_PROMPT_SLIM } from "../../src/llm/system-prompt-slim.js";
import { simulate } from "../../src/simulate.js";
import { nodeIgnoresPointer } from "../../src/runtime/pointer.js";
import { repairSource } from "../../src/repair/index.js";
import { applyTimelineState, holdFrameTimes, playbackFrameTimes } from "../../src/timeline/clock.js";

const PRINT = { handbookIds: ["print-nature"] } as const;
const PX_PER_PT = 72 / 96;

function compile(file: string) {
  const src = readFileSync(`examples/${file}`, "utf8");
  const result = compileSource(src, file, PRINT);
  expect(result.error, file).toBeNull();
  return { src, ir: result.ir! };
}

function sceneBox(ir: ReturnType<typeof compile>["ir"]) {
  return resolveSceneBox(evalSceneProps(ir.scene.props, [ir.state, ir.data]));
}

function svgIds(svg: string): Set<string> {
  return new Set([...svg.matchAll(/data-viva-id="([^"]+)"/g)].map((m) => m[1]!));
}

async function pdfPageSize(src: string, file: string) {
  const pdf = await exportArtifact(src, "pdf", PRINT, file);
  expect(pdf.vector).toBe(true);
  const doc = await PDFDocument.load(pdf.bytes);
  return { pdf, size: doc.getPage(0)!.getSize() };
}

describe("four gates — arrival fixture", () => {
  it("one source carries 89 / 183 mm, CJK, World, brush, four beats, and two pages", async () => {
    const { src, ir } = compile("arrival.viva");
    expect(src).not.toMatch(/(^|\n)\s*(areaX|areaY|insetL|plotPad)\s*:/);
    const box = sceneBox(ir);
    expect(box.page?.name).toBe("a4");
    expect(box.column).toBe("double");
    expect(box.width).toBeCloseTo(mmToPx(210));
    expect(box.height).toBeGreaterThan(mmToPx(297));
    const svg = renderSvgFromIr(ir);
    expect(svg).toMatch(/时间|心率|到站/);
    expect(ir.timeline?.beats).toBe(4);
    expect(ir.events.some((e) => e.type === "drag" && e.target === "tokens")).toBe(true);
    const { pdf, size } = await pdfPageSize(src, "arrival.viva");
    expect(size.width).toBeCloseTo(box.width * PX_PER_PT, 0);
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(pdf.missingGlyphs ?? []).toEqual([]);
  });
});

describe("four gates — eyes", () => {
  it("paper-column is 89 mm on SVG and vector PDF", async () => {
    const { src, ir } = compile("paper-column.viva");
    const box = sceneBox(ir);
    expect(box.column).toBe("single");
    expect(box.width).toBeCloseTo(mmToPx(COLUMN_MM.single));
    const svg = renderSvgFromIr(ir);
    expect(svg).toMatch(new RegExp(`viewBox="0 0 ${Math.round(box.width)}`));
    const { pdf, size } = await pdfPageSize(src, "paper-column.viva");
    expect(size.width).toBeCloseTo(box.width * PX_PER_PT, 0);
    expect(size.height).toBeCloseTo(box.height * PX_PER_PT, 0);
    expect(pdf.missingGlyphs ?? []).toEqual([]);
  });

  it("paper-cjk is 89 mm and the PDF keeps 时间 / 心率", async () => {
    const { src, ir } = compile("paper-cjk.viva");
    const box = sceneBox(ir);
    expect(box.width).toBeCloseTo(mmToPx(89));
    const { pdf, size } = await pdfPageSize(src, "paper-cjk.viva");
    expect(size.width).toBeCloseTo(box.width * PX_PER_PT, 0);
    expect(pdf.missingGlyphs ?? []).toEqual([]);
    const svg = renderSvgFromIr(ir);
    expect(svg).toMatch(/时间|周/);
    expect(svg).toMatch(/心率/);
  });

  it("paper-storyboard is 183 mm on SVG and vector PDF", async () => {
    const { src, ir } = compile("paper-storyboard.viva");
    const box = sceneBox(ir);
    expect(box.column).toBe("double");
    expect(box.width).toBeCloseTo(mmToPx(COLUMN_MM.double));
    expect(box.height).toBeCloseTo(mmToPx(103));
    const { size } = await pdfPageSize(src, "paper-storyboard.viva");
    expect(size.width).toBeCloseTo(box.width * PX_PER_PT, 0);
  });

  it("atlas still ships as a 1360 px studio, not 89/183 mm", () => {
    const { ir } = compile("figure-atlas.viva");
    const box = sceneBox(ir);
    expect(box.unit).toBe("px");
    expect(box.width).toBe(1360);
    expect(box.height).toBe(920);
    expect(ir.frames.map((f) => f.name)).toEqual(expect.arrayContaining(["a", "b", "c", "d", "e", "f"]));
  });
});

describe("four gates — hand", () => {
  it("the four named sources stay live (brush/drag, no interactive:false)", () => {
    for (const file of ["figure-atlas.viva", "paper-column.viva", "paper-cjk.viva", "paper-storyboard.viva"]) {
      const { src, ir } = compile(file);
      expect(src).not.toMatch(/interactive:\s*false/);
      expect(Object.keys(ir.state)).toEqual(expect.arrayContaining(["__brush", "__sel", "__tip"]));
      expect(ir.events.some((e) => e.type === "drag" || e.type === "dragstart")).toBe(true);
    }
  });

  it("paper-cjk brush writes __sel and an empty tap clears it", () => {
    const { ir } = compile("paper-cjk.viva");
    const target = ir.events.find((e) => e.type === "dragstart")!.target;
    const brushed = simulate(ir, {
      events: [
        { type: "dragstart", target, event: { x: 40, y: 28 } },
        { type: "drag", target, event: { x: 60, y: 18 } },
        { type: "dragend", target, event: { x: 60, y: 18 } },
      ],
    });
    expect((brushed.state.__sel as { n: number }).n).toBeGreaterThan(0);
    expect(brushed.state.__brush).toMatchObject({ on: 1 });
    const cleared = simulate(ir, {
      events: [
        { type: "dragstart", target, event: { x: 20, y: 50 } },
        { type: "dragend", target, event: { x: 21, y: 51 } },
      ],
    });
    expect((cleared.state.__sel as { n: number }).n).toBe(0);
  });

  it("paper-storyboard keeps __sel after a beat jump; dim veils do not steal pointer", () => {
    const { ir } = compile("paper-storyboard.viva");
    const target = ir.events.find((e) => e.type === "dragstart")!.target;
    const world = simulate(ir, {
      events: [
        { type: "dragstart", target, event: { x: 30, y: 70 } },
        { type: "drag", target, event: { x: 80, y: 40 } },
        { type: "dragend", target, event: { x: 80, y: 40 } },
      ],
    });
    const n = (world.state.__sel as { n: number }).n;
    expect(n).toBeGreaterThan(0);
    applyTimelineState(world.state, ir.timeline!, ir.timeline!.holdSec + ir.timeline!.easeSec + 0.05);
    expect(world.state.__beat).toBe(1);
    expect((world.state.__sel as { n: number }).n).toBe(n);
    const play = ir.scene.layers.find((l) => l.name === "__board_play")!;
    for (const item of play.items) {
      expect(item.kind).toBe("node");
      if (item.kind !== "node") continue;
      expect(nodeIgnoresPointer(item.name, evaluate(item.props.role!, [{}]))).toBe(true);
    }
  });
});

describe("four gates — export", () => {
  it("data-viva-id in static SVG matches flatten (the Runtime id scheme)", () => {
    for (const file of ["paper-column.viva", "paper-cjk.viva", "paper-storyboard.viva", "figure-atlas.viva"]) {
      const { ir } = compile(file);
      const { nodes } = flattenNodesFromIr(ir);
      const painted = nodes.filter((n) => nodePainted(n.props));
      const ids = svgIds(renderSvgFromIr(ir));
      expect(painted.length).toBeGreaterThan(0);
      for (const node of painted) expect(ids.has(node.id), `${file} ${node.id}`).toBe(true);
      for (const id of ids) expect(painted.some((n) => n.id === id), `${file} svg ${id}`).toBe(true);
    }
  });

  it("storyboard film follows the clock, not a tick increment of __beat", async () => {
    const { src, ir } = compile("paper-storyboard.viva");
    expect(ir.timeline?.beats).toBe(4);
    expect(ir.ticks.some((t) => JSON.stringify(t.body).includes("__beat"))).toBe(false);
    expect(holdFrameTimes(ir.timeline!).length).toBe(4);
    expect(playbackFrameTimes(ir.timeline!).length).toBeGreaterThan(4);
    const frames = await exportBeatSequence(src, { width: 320, ...PRINT }, "paper-storyboard.viva");
    expect(frames.length).toBe(ir.timeline!.beats);
  }, 30_000);
});

describe("four gates — agent", () => {
  it("MCP compile of paper-column returns IR without stuffing LANGUAGE.md", async () => {
    const out = await handleMcpTool("viva_compile", {
      source: readFileSync("examples/paper-column.viva", "utf8"),
      handbookIds: ["print-nature"],
      visual: false,
    });
    const json = JSON.parse(out.content[0]!.text);
    expect(json.ir?.name).toBeTruthy();
    const prompt = await handleMcpTool("viva_prompt", { handbookIds: [] });
    const text = prompt.content[0]!.text;
    expect(text.startsWith(SYSTEM_PROMPT_SLIM.slice(0, 80))).toBe(true);
    expect(text).not.toMatch(/# 语言参考|# Language/);
    expect(text.length).toBeLessThan(20_000);
  });

  it("a short broken chart repairs without a model", () => {
    const broken = `artifact Gate
data series = [{ x: 1, y: 2 }]
scene
  unit: mm
  column: single
  height: 68
widget chart.scatter
  xField: x
  yField: y
`;
    const next = repairSource(broken, [
      { code: "check.visual.emptyPanel", message: "empty" },
      { code: "check.struct.axis", message: "axis" },
    ]);
    expect(next.changed).toBe(true);
    expect(next.source).toMatch(/data: series/);
    expect(next.source).toMatch(/xLabel:/);
    const compiled = compileSource(next.source, "gate.viva", PRINT);
    expect(compiled.error).toBeNull();
    expect(compiled.ir!.events.some((e) => e.type === "dragstart")).toBe(true);
  });
});

describe("four gates — not arrived", () => {
  it("does not let a green floor be read as print / film / live-agent arrival", () => {
    const holes = {
      eyes: "Atlas is 1360×920 px. No metric here for ‘spacing like print’. SVG and PDF sizes match; they are not a side-by-side visual.",
      hand: "Headless simulate on each source, not one Runtime pointer session across brush/drag/beat/page.",
      export: "Beat PNG sequence follows Clock holds and gif/mp4 follows Clock playback; PDF now has rotate/dash/path/clip, but ID sidecar and SVG↔PDF SSIM are still open.",
      agent: "Deterministic repair + MCP compile. No short-intent LLM → playable card in this exam.",
    };
    expect(Object.keys(holes)).toEqual(["eyes", "hand", "export", "agent"]);
    expect(holes.eyes).toMatch(/Atlas is 1360/);
  });
});
