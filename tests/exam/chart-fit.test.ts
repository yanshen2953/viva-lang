import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { largestEmptyRect } from "../../src/layout/chart-fit.js";

describe("chart host leftover", () => {
  it("picks the slab below a top knob", () => {
    const host = largestEmptyRect(
      { x: 0, y: 0, w: 480, h: 280 },
      [{ x: 92, y: 32, w: 16, h: 16 }],
      { pad: 10, minW: 64, minH: 64 },
    );
    expect(host.y).toBeGreaterThanOrEqual(48);
    expect(host.y + host.h).toBeCloseTo(280);
    expect(host.w).toBeCloseTo(480);
  });

  it("parks a chart to the right of an author frame", () => {
    const host = largestEmptyRect(
      { x: 0, y: 0, w: 640, h: 360 },
      [{ x: 40, y: 40, w: 360, h: 260 }],
      { pad: 10, minW: 64, minH: 64 },
    );
    expect(host.x).toBeGreaterThanOrEqual(400);
    expect(host.w).toBeGreaterThan(64);
    expect(host.h).toBeGreaterThan(200);
  });

  it("fills the scene when nothing is in the way", () => {
    const host = largestEmptyRect({ x: 0, y: 0, w: 480, h: 280 }, [], { pad: 10 });
    expect(host).toEqual({ x: 0, y: 0, w: 480, h: 280 });
  });

  it("drops exam C2/C3 area boxes and still expands marks", () => {
    for (const file of ["C2_chart_line.viva", "C3_chart_bar.viva"] as const) {
      const src = readFileSync(`examples/exam/${file}`, "utf8");
      expect(src).not.toMatch(/areaX|areaY/);
      const result = compileSource(src, file);
      expect(result.error).toBeNull();
      expect(result.ir!.scene.layers.some((l) => l.name.endsWith("_marks"))).toBe(true);
    }
  });

  it("parks the param-lab chart below the dragged knob", () => {
    const src = readFileSync("examples/exam/P1_param_lab.viva", "utf8");
    expect(src).not.toMatch(/areaX|areaY/);
    const result = compileSource(src, "P1.viva");
    expect(result.error).toBeNull();
    const frame = result.ir!.frames[0]!;
    const cellY = evaluate(frame.props.cellY!, [result.ir!.state, result.ir!.data]) as [
      number,
      number,
    ];
    expect(cellY[0]).toBeGreaterThan(48);
    expect(cellY[1]).toBeCloseTo(280);
    const plotY = evaluate(frame.props.y, [result.ir!.state, result.ir!.data]) as [number, number];
    expect(plotY[0]).toBeGreaterThan(cellY[0] - 1);
  });

  it("keeps the param-lab example chart off the slider track", () => {
    const src = readFileSync("examples/param-lab.viva", "utf8");
    expect(src).not.toMatch(/areaX|areaY/);
    const result = compileSource(src, "param-lab.viva");
    expect(result.error).toBeNull();
    const cellY = evaluate(result.ir!.frames[0]!.props.cellY!, [
      result.ir!.state,
      result.ir!.data,
    ]) as [number, number];
    expect(cellY[0]).toBeGreaterThan(72);
    expect(cellY[1]).toBeCloseTo(400);
  });
});
