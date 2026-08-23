import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { figureCellsFromIr, runArtifactChecks, runStructuralChecks } from "../../src/check/index.js";
import { compileSource } from "../../src/pipeline.js";

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
});
