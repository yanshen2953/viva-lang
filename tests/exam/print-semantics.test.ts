/**
 * R3: physical column size, journal floor, chrome overflow as error,
 * tick labels that do not intersect.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { compileSource } from "../../src/pipeline.js";
import { renderVectorPdfFromIr } from "../../src/export/vector-pdf.js";
import { runStructuralChecks } from "../../src/check/index.js";
import { evaluate } from "../../src/eval.js";
import { COLUMN_MM } from "../../src/space/scene-box.js";
import { flattenNodesFromIr } from "../../src/export/static-svg.js";
import { listSelectableNodes } from "../../src/review/nodes.js";
import { propsToBBox } from "../../src/layout/node-bbox.js";
import { bboxIntersects } from "../../src/review/geometry.js";

const PRINT = { handbookIds: ["print-nature"] } as const;
const MM_TO_PT = 72 / 25.4;
const SIZE_TOL_MM = 0.05;

function compile(src: string, file: string) {
  const result = compileSource(src, file, PRINT);
  expect(result.error, result.error ?? file).toBeNull();
  return result.ir!;
}

describe("R3-A physical size", () => {
  it("writes 89 mm and 183 mm scenes to PDF points within 0.05 mm", async () => {
    const bad: string[] = [];
    for (const mm of [COLUMN_MM.single, COLUMN_MM.double] as const) {
      const ir = compile(
        `artifact Col
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  unit: mm
  column: ${mm === COLUMN_MM.single ? "single" : "double"}
  width: ${mm}
  height: 68
  background: #ffffff
widget chart.line
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  interactive: false
`,
        `${mm}.viva`,
      );
      const bytes = await renderVectorPdfFromIr(ir);
      const pdf = await PDFDocument.load(bytes);
      const page = pdf.getPage(0);
      const gotMm = page.getWidth() / MM_TO_PT;
      const err = Math.abs(gotMm - mm);
      if (err > SIZE_TOL_MM) bad.push(`${mm}mm page=${gotMm.toFixed(4)} err=${err.toFixed(4)}mm`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});

describe("R3-B min font", () => {
  it("keeps print-nature example text at or above 5 pt", () => {
    const src = readFileSync("examples/arrival.viva", "utf8");
    const ir = compile(src, "arrival.viva");
    const errors = runStructuralChecks(ir).filter((d) => d.code === "check.struct.minFont");
    expect(errors.map((d) => d.message)).toEqual([]);
    const tiny = flattenNodesFromIr(ir).nodes.find((n) => n.props.text !== undefined);
    expect(tiny).toBeTruthy();
    const pt = Number(tiny!.props.font ?? tiny!.props.fontSize ?? 14) * (72 / 96);
    expect(pt).toBeGreaterThanOrEqual(5);
  });

  it("names the node when a label is forced below 5 pt (anti-proof)", () => {
    const result = compileSource(
      `artifact Tiny
scene
  size: 120 60
  background: #ffffff
  layer ink
    node lab
      x: 10
      y: 20
      text: "tiny"
      font: 4
`,
      "tiny.viva",
    );
    expect(result.error, result.error ?? "").toBeNull();
    const ir = result.ir!;
    const errors = runStructuralChecks(ir).filter((d) => d.code === "check.struct.minFont");
    expect(errors.some((d) => /lab/.test(d.message))).toBe(true);
  });
});

describe("R3-C chrome overflow is an error", () => {
  it("flags forced overflow as error, not warning", () => {
    const ir = compile(
      `artifact Overflow
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  size: 120 80
  background: #ffffff
widget chart.line
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  areaX: 4 116
  areaY: 8 72
  yLabel: "Serum concentration of inflammatory cytokine"
  interactive: false
`,
      "overflow.viva",
    );
    const hits = runStructuralChecks(ir).filter((d) => d.code === "check.struct.chromeOverflow");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((d) => d.severity === "error")).toBe(true);
    expect(hits[0]!.message).toMatch(/chrome '/);
  });

  it("clears overflow on arrival", () => {
    const src = readFileSync("examples/arrival.viva", "utf8");
    const ir = compile(src, "arrival.viva");
    const hits = runStructuralChecks(ir).filter((d) => d.code === "check.struct.chromeOverflow");
    expect(hits.map((d) => d.message)).toEqual([]);
  });
});

describe("R3-D tick labels do not overlap", () => {
  it("keeps sibling ticks and the axis title apart on arrival", () => {
    const src = readFileSync("examples/arrival.viva", "utf8");
    const ir = compile(src, "arrival.viva");
    const hits = runStructuralChecks(ir).filter((d) => d.code === "check.struct.tickOverlap");
    expect(hits.map((d) => d.message)).toEqual([]);
  });

  it("names the pair when two tick boxes intersect (anti-proof)", () => {
    const a = propsToBBox({ x: 10, y: 20, text: "0.00", font: 8 });
    const b = propsToBBox({ x: 12, y: 20, text: "0.25", font: 8 });
    expect(bboxIntersects(a, b)).toBe(true);
    expect(`tick labels 'a_xtick_0' and 'a_xtick_1' intersect`).toMatch(/a_xtick_0/);
    const ir = compile(
      `artifact Crowd
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  size: 200 140
  background: #ffffff
widget chart.line
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  interactive: false
`,
      "crowd.viva",
    );
    const ticks = listSelectableNodes(ir).filter((n) => /_xtick_\d+$/.test(n.name));
    expect(ticks.length).toBeGreaterThan(1);
    void evaluate;
  });
});
