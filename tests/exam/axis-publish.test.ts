import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { linearMinorTicks, logMinorTicks, niceScaleNumber } from "../../src/layout/axis-ticks.js";
import { layoutChartBar } from "../../src/space.js";

describe("publication axis and marks", () => {
  it("emits log minors between decades", () => {
    const minors = logMinorTicks(1, 100);
    expect(minors).toContain(2);
    expect(minors).toContain(50);
    expect(minors).not.toContain(1);
    expect(minors).not.toContain(100);
  });

  it("fills linear minors between majors", () => {
    const minors = linearMinorTicks([0, 10], 0, 10);
    expect(minors.length).toBe(4);
    expect(minors[0]).toBeCloseTo(2);
  });

  it("compiles log minors and a quiver scale", () => {
    const src = `artifact Pub
data vec = [
  { x: 0, y: 0, ux: 2, uy: 0 }
  { x: 1, y: 1, ux: 0, uy: 1 }
]
scene
  size: 400 240
widget chart.vector
  data: vec
  xField: x
  yField: y
  uField: ux
  vField: uy
  xScale: log
  xlim: 0.5 20
  ylim: 0 2
  areaX: 40 300
  areaY: 30 200
`;
    const result = compileSource(src, "pub.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const names = axes.items.filter((i) => i.kind === "node").map((i) => (i.kind === "node" ? i.name : ""));
    expect(names.some((n) => n.includes("_xmin_"))).toBe(true);
    const marks = result.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    expect(marks.items.some((i) => i.kind === "node" && i.name.includes("vecScale"))).toBe(true);
    expect(niceScaleNumber(3.2)).toBe(5);
  });

  it("draws a colorbar spine like a third axis", () => {
    const src = `artifact Heat
data grid = [
  { x: 0, y: 0, z: 1 }
  { x: 1, y: 0, z: 3 }
]
scene
  size: 320 200
widget chart.heatmap
  data: grid
  xField: x
  yField: y
  valueField: z
  zlim: 0 4
  zLabel: Intensity
`;
    const result = compileSource(src, "heat.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const names = result.ir!.scene.layers.flatMap((l) =>
      l.items.filter((i) => i.kind === "node").map((i) => (i.kind === "node" ? i.name : "")),
    );
    expect(names.some((n) => n.includes("cbarSpine"))).toBe(true);
  });

  it("draws a funnel stage as a trapezoid path", () => {
    const laid = layoutChartBar(
      {
        __chartBar: true,
        __chartFunnel: true,
        __chartBarOrient: "h",
        __funnelNext: 4,
        frame: "p",
        x: 80,
        y: 100,
        h: 0.5,
      },
      [
        {
          name: "p",
          x0: 0,
          x1: 200,
          y0: 0,
          y1: 200,
          xmin: 0,
          xmax: 10,
          ymin: 0,
          ymax: 4,
          xScale: "linear",
          yScale: "linear",
          xCats: [],
          yCats: [],
          invertY: true,
        },
      ],
    );
    expect(String(laid.d)).toMatch(/^M /);
    expect(String(laid.d)).toContain("Z");
  });

  it("sizes box width from category gap and adds a violin inner box", () => {
    const src = `artifact Dist
data rows = [
  { g: 0, y: 2 }
  { g: 0, y: 4 }
  { g: 0, y: 8 }
  { g: 1, y: 3 }
  { g: 1, y: 5 }
  { g: 1, y: 9 }
]
scene
  size: 400 240
widget chart.violin
  data: rows
  xField: g
  yField: y
  xlim: -0.5 1.5
  ylim: 0 12
  areaX: 40 360
  areaY: 30 210
`;
    const result = compileSource(src, "dist.viva");
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    const box = marks.items.find((i) => i.kind === "node" && i.name.startsWith("violinBox"));
    expect(box?.kind).toBe("node");
    if (box?.kind === "node") {
      expect(evaluate(box.props.__chartBox!, [{}, {}])).toBe(true);
    }
  });
});
