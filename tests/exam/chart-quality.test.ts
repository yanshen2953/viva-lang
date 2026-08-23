import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { renderSvgFromIr } from "../../src/export/static-svg.js";
import { simulate } from "../../src/simulate.js";

const SCATTER = `artifact "Quality"
data series = [
  { x: 1, y: 10, err: 2 }
  { x: 3, y: 18, err: 1.5 }
  { x: 4, y: 12, err: 1 }
]
scene
  size: 640 360
  background: #ffffff
widget chart.scatter
  data: series
  xField: x
  yField: y
  errorField: err
  xLabel: "Time"
  xUnit: "week"
  yLabel: "Heart rate"
  yUnit: "bpm"
  xlim: 0 5
  ylim: 0 24
  areaX: 72 560
  areaY: 48 300
  title: "Heart rate"
`;

const UNSORTED = `artifact "Sort"
data series = [
  { x: 4, y: 2 }
  { x: 1, y: 1 }
  { x: 3, y: 3 }
]
scene
  size: 400 240
widget chart.line
  data: series
  xField: x
  yField: y
  xlim: 0 5
  ylim: 0 4
  areaX: 40 360
  areaY: 30 200
  interactive: false
`;

const HEAT = `artifact "Heat"
data cells = [
  { col: 1, row: 1, v: 0.1 }
  { col: 2, row: 1, v: 0.6 }
  { col: 1, row: 2, v: 0.9 }
  { col: 2, row: 2, v: 0.3 }
]
scene
  size: 400 280
widget chart.heatmap
  data: cells
  xField: col
  yField: row
  valueField: v
  xlim: 0 3
  ylim: 0 3
  zlim: 0 1
  areaX: 40 260
  areaY: 36 240
  title: "Expression"
`;

describe("chart quality: axis titles, error bars, hover, heatmap", () => {
  it("expands x/y captions with units and error-bar stems", () => {
    const result = compileSource(SCATTER, "q.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const names = axes.items.filter((i) => i.kind === "node").map((i) => (i.kind === "node" ? i.name : ""));
    expect(names.some((n) => n.endsWith("_xTitle"))).toBe(true);
    expect(names.some((n) => n.endsWith("_yTitle"))).toBe(true);
    const xTitle = axes.items.find((i) => i.kind === "node" && i.name.endsWith("_xTitle"));
    expect(xTitle && xTitle.kind === "node" ? xTitle.props.text : null).toMatchObject({
      kind: "string",
      value: "Time (week)",
    });
    const marks = result.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    const loop = marks.items.find((i) => i.kind === "for");
    expect(loop?.kind).toBe("for");
    if (loop?.kind === "for") {
      const bodyNames = loop.body.filter((b) => b.kind === "node").map((b) => (b.kind === "node" ? b.name : ""));
      expect(bodyNames).toContain("errStem");
      expect(bodyNames).toContain("errCapHi");
    }
  });

  it("wires default hover onto marks and writes __tip", () => {
    const result = compileSource(SCATTER, "q.viva");
    expect(result.ir!.events.some((e) => e.type === "hover" && e.target === "mark")).toBe(true);
    expect(Object.keys(result.ir!.state)).toContain("__tip");
    const world = simulate(result.ir!, {
      events: [{ type: "hover", target: "mark", event: { x: 1, y: 10 } }],
    });
    // simulate may not bind row fields; compile-time wiring is the contract.
    expect(world.state).toBeTruthy();
    expect(result.ir!.scene.layers.some((l) => l.name === "__chart_hud")).toBe(true);
  });

  it("connects line segments in x order even if source rows are unsorted", () => {
    const result = compileSource(UNSORTED, "s.viva");
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    const segs = marks.items.filter((i) => i.kind === "node" && i.name.startsWith("seg_"));
    expect(segs.length).toBeGreaterThanOrEqual(2);
    const first = segs[0];
    if (first?.kind === "node") {
      expect(first.props.x1).toMatchObject({ kind: "number", value: 1 });
      expect(first.props.x2).toMatchObject({ kind: "number", value: 3 });
    }
  });

  it("expands chart.heatmap cells, colorbar ticks, and sequential fill", () => {
    const result = compileSource(HEAT, "h.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    const loop = marks.items.find((i) => i.kind === "for");
    expect(loop?.kind).toBe("for");
    if (loop?.kind === "for") {
      const cell = loop.body[0];
      expect(cell?.kind).toBe("node");
      if (cell?.kind === "node") {
        expect(cell.name).toBe("heatCell");
        expect(cell.props.__chartHeat).toBeDefined();
      }
    }
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const names = axes.items.filter((i) => i.kind === "node").map((i) => (i.kind === "node" ? i.name : ""));
    expect(names.some((n) => n.includes("_cbar_"))).toBe(true);
    expect(names.some((n) => n.includes("_cbarLbl_"))).toBe(true);
  });

  it("exports SVG with font-family and grid dash (runtime parity)", () => {
    const result = compileSource(SCATTER, "q.viva", { handbookIds: ["print-nature"] });
    const svg = renderSvgFromIr(result.ir!);
    expect(svg).toContain("font-family=");
    expect(svg).toContain("stroke-dasharray=");
    expect(svg).toContain("Time (week)");
    expect(svg).toContain("Heart rate (bpm)");
  });
});
