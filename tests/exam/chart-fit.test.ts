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

  it("promotes a role: panel node so a figure can bind without areaX", () => {
    const src = `artifact Deck
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  size: 400 240
  layer ui
    node chartDeck
      role: panel
      x: 40
      y: 20
      w: 320
      h: 200
widget layout.figure
  panel: chartDeck
  cols: 1
  rows: 1
  plate: false
widget chart.line
  panel: a
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  interactive: false
`;
    const result = compileSource(src, "deck.viva");
    expect(result.error).toBeNull();
    const scopes = [result.ir!.state, result.ir!.data];
    const deck = result.ir!.frames.find((f) => f.name === "chartDeck");
    expect(deck).toBeTruthy();
    const cell = evaluate(result.ir!.frames.find((f) => f.name === "a")!.props.cellX!, scopes) as [
      number,
      number,
    ];
    expect(cell[0]).toBeGreaterThanOrEqual(40);
    expect(cell[1]).toBeLessThanOrEqual(360);
  });

  it("drops science-studio area boxes onto the chartDeck panel", () => {
    const src = readFileSync("examples/science-studio.viva", "utf8");
    expect(src).not.toMatch(/areaX|areaY/);
    const result = compileSource(src, "science-studio.viva");
    expect(result.error).toBeNull();
    const scopes = [result.ir!.state, result.ir!.data];
    const deck = evaluate(result.ir!.frames.find((f) => f.name === "chartDeck")!.props.x, scopes) as [
      number,
      number,
    ];
    expect(deck[0]).toBeCloseTo(488);
    expect(deck[1]).toBeCloseTo(1160);
    for (const name of ["a", "b"] as const) {
      const cellX = evaluate(result.ir!.frames.find((f) => f.name === name)!.props.cellX!, scopes) as [
        number,
        number,
      ];
      const cellY = evaluate(result.ir!.frames.find((f) => f.name === name)!.props.cellY!, scopes) as [
        number,
        number,
      ];
      expect(cellX[0]).toBeGreaterThanOrEqual(488);
      expect(cellX[1]).toBeLessThanOrEqual(1160);
      expect(cellY[0]).toBeGreaterThanOrEqual(64);
      expect(cellY[1]).toBeLessThanOrEqual(312);
    }
  });

  it("ignores a full-bleed atmosphere wash when parking a chart", () => {
    const result = compileSource(
      `artifact Wash
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  size: 400 240
  layer bg
    node wash
      role: atmosphere
      x: 0
      y: 0
      w: 400
      h: 240
widget chart.line
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  interactive: false
`,
      "wash.viva",
    );
    expect(result.error).toBeNull();
    const cell = evaluate(result.ir!.frames[0]!.props.cellX!, [
      result.ir!.state,
      result.ir!.data,
    ]) as [number, number];
    expect(cell[0]).toBeCloseTo(0);
    expect(cell[1]).toBeCloseTo(400);
  });

  it("tiles unbound charts above a caption instead of covering it", () => {
    const src = readFileSync("examples/charts.viva", "utf8");
    expect(src).not.toMatch(/areaX|areaY|layout\.figure/);
    const result = compileSource(src, "charts.viva");
    expect(result.error).toBeNull();
    const scopes = [result.ir!.state, result.ir!.data];
    const bottoms = result.ir!.frames
      .filter((f) => ["a", "b", "c"].includes(f.name))
      .map((f) => {
        const cellY = evaluate(f.props.cellY!, scopes) as [number, number];
        return cellY[1];
      });
    expect(bottoms.length).toBe(3);
    expect(Math.max(...bottoms)).toBeLessThan(490);
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
