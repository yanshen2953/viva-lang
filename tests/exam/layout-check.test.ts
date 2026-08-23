import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { figureCellsFromIr, runArtifactChecks, runStructuralChecks } from "../../src/check/index.js";
import { compileSource } from "../../src/pipeline.js";
import { propsToBBox } from "../../src/layout/node-bbox.js";
import { listSelectableNodes } from "../../src/review/nodes.js";

describe("layout checks", () => {
  it("figure-atlas passes structural checks with print-nature", () => {
    const src = readFileSync("examples/figure-atlas.viva", "utf8");
    const compiled = compileSource(src, "figure-atlas.viva", {
      handbookIds: ["print-nature"],
      check: { structural: true },
    });
    expect(compiled.error).toBeNull();
    expect(compiled.ir).not.toBeNull();
    const structural = runStructuralChecks(compiled.ir!);
    const errors = structural.filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });

  it("reads figure cells from IR instead of a guessed raster grid", () => {
    const atlas = compileSource(readFileSync("examples/figure-atlas.viva", "utf8"), "atlas.viva", {
      handbookIds: ["print-nature"],
    });
    expect(atlas.error).toBeNull();
    const atlasCells = figureCellsFromIr(atlas.ir!);
    expect(atlasCells.map((c) => c.name).sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
    const span = compileSource(readFileSync("examples/figure-span.viva", "utf8"), "span.viva", {
      handbookIds: ["print-nature"],
    });
    expect(span.error).toBeNull();
    const spanCells = figureCellsFromIr(span.ir!);
    expect(spanCells.map((c) => c.name).sort()).toEqual(["a", "b", "c"]);
    const lead = spanCells.find((c) => c.name === "a")!;
    const side = spanCells.find((c) => c.name === "b")!;
    expect(lead.x1 - lead.x0).toBeGreaterThan(side.x1 - side.x0);
  });

  it("figure-atlas passes visual raster checks", async () => {
    const src = readFileSync("examples/figure-atlas.viva", "utf8");
    const compiled = compileSource(src, "figure-atlas.viva", {
      handbookIds: ["print-nature"],
    });
    const checks = await runArtifactChecks(compiled.ir!, {
      structural: true,
      visual: true,
      rasterWidth: 800,
    });
    expect(checks.ok).toBe(true);
    expect(checks.stats?.inkRatio ?? 0).toBeGreaterThan(0.01);
    expect(checks.stats?.colorCount ?? 0).toBeGreaterThan(8);
  });

  it("detects flat heatmap fills", () => {
    const src = readFileSync("examples/figure-atlas.viva", "utf8");
    const compiled = compileSource(src, "figure-atlas.viva", {
      handbookIds: ["print-nature"],
    });
    const structural = runStructuralChecks(compiled.ir!);
    expect(structural.some((d) => d.code === "check.struct.flatHeatmap")).toBe(false);
  });

  it("measures rotated y-titles as a vertical box, not a wide horizontal one", () => {
    const box = propsToBBox({
      x: 20,
      y: 80,
      text: "心率 (次每分)",
      font: 9,
      letterSpacing: 0.2,
      align: "center",
      rotate: -90,
    });
    expect(box.h).toBeGreaterThan(box.w);
    expect(box.w).toBeLessThan(20);
    expect(box.x).toBeGreaterThan(10);
    expect(box.x + box.w).toBeLessThan(30);
  });

  it("lists mm-scene chrome in CSS px so a CJK y-title stays on canvas", () => {
    const src = readFileSync("examples/paper-cjk.viva", "utf8");
    const compiled = compileSource(src, "paper-cjk.viva", {
      handbookIds: ["print-nature"],
    });
    expect(compiled.error).toBeNull();
    const nodes = listSelectableNodes(compiled.ir!);
    const yTitle = nodes.find((n) => /yTitle/.test(n.name));
    expect(yTitle).toBeTruthy();
    expect(yTitle!.bbox.h).toBeGreaterThan(yTitle!.bbox.w);
    expect(yTitle!.bbox.x).toBeGreaterThan(0);
    const structural = runStructuralChecks(compiled.ir!);
    expect(structural.filter((d) => d.code === "check.struct.chromeOverflow")).toEqual([]);
  });

  it("warns when forced areaX leaves a y-title outside the scene", () => {
    const compiled = compileSource(
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
      { handbookIds: ["print-nature"] },
    );
    expect(compiled.error).toBeNull();
    const structural = runStructuralChecks(compiled.ir!);
    expect(structural.some((d) => d.code === "check.struct.chromeOverflow")).toBe(true);
  });
});
