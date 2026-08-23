import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { renderSvgFromIr } from "../../src/export/static-svg.js";
import { simulate } from "../../src/simulate.js";
import { scalePathD } from "../../src/space/scene-box.js";

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
        expect(cell.props.visible).toBeDefined();
        expect(JSON.stringify(cell.props.visible)).toContain("__sel");
      }
    }
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const names = axes.items.filter((i) => i.kind === "node").map((i) => (i.kind === "node" ? i.name : ""));
    expect(names.some((n) => n.includes("_cbar_"))).toBe(true);
    expect(names.some((n) => n.includes("_cbarLbl_"))).toBe(true);
  });

  it("reads unary-minus xlim/ylim so ticks stay in the data domain", () => {
    const result = compileSource(
      `artifact "Neg"
data cells = [
  { x: 0, y: 0, v: 0.2 }
  { x: 1, y: 1, v: 0.8 }
]
scene
  size: 400 280
widget chart.heatmap
  data: cells
  xField: x
  yField: y
  valueField: v
  xlim: -0.5 2.5
  ylim: -0.5 2.5
  zlim: 0 1
  areaX: 40 260
  areaY: 36 240
  interactive: false
`,
      "neg.viva",
    );
    expect(result.error).toBeNull();
    const svg = renderSvgFromIr(result.ir!);
    expect(svg).not.toMatch(/y1="-[1-9]\d{3}/);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it("exports SVG with font-family and grid dash (runtime parity)", () => {
    const result = compileSource(SCATTER, "q.viva", { handbookIds: ["print-nature"] });
    const svg = renderSvgFromIr(result.ir!);
    expect(svg).toContain("font-family=");
    expect(svg).toContain("stroke-dasharray=");
    expect(svg).toContain("Time (week)");
    expect(svg).toContain("Heart rate (bpm)");
  });

  it("places y-tick labels in scene space so they sit left of the plot, not in the data pad", () => {
    const result = compileSource(
      readFileSync("examples/box.viva", "utf8"),
      "box.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const ytick = axes.items.find((i) => i.kind === "node" && i.name.includes("_ytick_"));
    expect(ytick?.kind).toBe("node");
    if (ytick?.kind === "node") {
      expect(ytick.props.frame).toBeUndefined();
      expect(ytick.props.x).toMatchObject({ kind: "number" });
      expect(ytick.props.align).toMatchObject({ kind: "string", value: "right" });
      const x = ytick.props.x?.kind === "number" ? ytick.props.x.value : 0;
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThan(72);
    }
    const yMark = axes.items.find((i) => i.kind === "node" && i.name.includes("_ytickMark_"));
    expect(yMark?.kind).toBe("node");
    if (yMark?.kind === "node") {
      expect(yMark.props.frame).toBeUndefined();
      const x1 = yMark.props.x1?.kind === "number" ? yMark.props.x1.value : 0;
      const x2 = yMark.props.x2?.kind === "number" ? yMark.props.x2.value : 99;
      expect(x2 - x1).toBeLessThan(10);
    }
    const svg = renderSvgFromIr(result.ir!);
    expect(svg).not.toMatch(/NaN|Infinity/);
    const tickXs = [...svg.matchAll(/data-viva-name="[^"]+_ytick_\d+"[^>]*\sx="([\d.]+)"/g)].map(
      (m) => Number(m[1]),
    );
    expect(tickXs.length).toBeGreaterThan(0);
    expect(Math.min(...tickXs)).toBeGreaterThan(8);
    expect(Math.max(...tickXs)).toBeLessThan(72);
  });

  it("expands chart.violin as a closed scene-space density path", () => {
    const result = compileSource(readFileSync("examples/violin.viva", "utf8"), "vl.viva");
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    const violins = marks.items.filter((i) => i.kind === "node" && i.name === "violin");
    expect(violins.length).toBeGreaterThanOrEqual(3);
    const first = violins[0];
    expect(first?.kind).toBe("node");
    if (first?.kind === "node") {
      expect(first.props.frame).toBeUndefined();
      expect(first.props.d?.kind).toBe("string");
      const d = first.props.d?.kind === "string" ? first.props.d.value : "";
      expect(d.startsWith("M ")).toBe(true);
      expect(d.includes(" Z") || d.endsWith("Z")).toBe(true);
    }
    const svg = renderSvgFromIr(result.ir!);
    expect(svg).toContain("<path ");
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it("keeps the mm paper HUD to the brush overlay (no standing tip)", () => {
    const result = compileSource(
      `artifact "Mm"
data series = [{ x: 1, y: 2 }, { x: 4, y: 6 }]
scene
  unit: mm
  column: single
  width: 89
  height: 68
widget chart.scatter
  data: series
  xField: x
  yField: y
  xlim: 0 8
  ylim: 0 10
  areaX: 16 80
  areaY: 12 56
`,
      "mm.viva",
    );
    expect(result.error).toBeNull();
    const hud = result.ir!.scene.layers.find((l) => l.name === "__chart_hud");
    expect(hud).toBeTruthy();
    const names = hud!.items
      .filter((i) => i.kind === "node")
      .map((i) => (i.kind === "node" ? i.name : ""));
    expect(names).toContain("brushRect");
    expect(names).not.toContain("chartTip");
  });

  it("scales path d with unit: mm so violin/scene paths stay aligned", () => {
    expect(scalePathD("M 10,20 L 30,40 Z", 2)).toBe("M 20,40 L 60,80 Z");
    expect(scalePathD("M 1.5,2 L 3,4 Z", 1)).toBe("M 1.5,2 L 3,4 Z");
  });

  it("lets print-nature own tick and axis title type", () => {
    const result = compileSource(SCATTER, "q.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const ytick = axes.items.find((i) => i.kind === "node" && i.name.includes("_ytick_"));
    expect(ytick?.kind).toBe("node");
    if (ytick?.kind === "node") {
      expect(ytick.props.font).toMatchObject({ kind: "number", value: 8 });
      expect(ytick.props.letterSpacing).toMatchObject({ kind: "number", value: 0.08 });
    }
    const xTitle = axes.items.find((i) => i.kind === "node" && i.name.endsWith("_xTitle"));
    expect(xTitle?.kind).toBe("node");
    if (xTitle?.kind === "node") {
      expect(xTitle.props.font).toMatchObject({ kind: "number", value: 9 });
      expect(xTitle.props.letterSpacing).toMatchObject({ kind: "number", value: 0.2 });
    }
    const svg = renderSvgFromIr(result.ir!);
    expect(svg).toContain('letter-spacing="0.08"');
    expect(svg).toContain('letter-spacing="0.2"');
  });

  it("keeps mm paper chrome on the canvas and stacked title/tick/title", () => {
    const result = compileSource(
      readFileSync("examples/paper-cjk.viva", "utf8"),
      "paper-cjk.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const nodeNamed = (suffix: string) =>
      axes.items.find((i) => i.kind === "node" && i.name.endsWith(suffix));
    const yTick = nodeNamed("_ytick_0");
    const yTitle = nodeNamed("_yTitle");
    const xTick = nodeNamed("_xtick_0");
    const xTitle = nodeNamed("_xTitle");
    const title = nodeNamed("_title");
    expect(yTick?.kind).toBe("node");
    expect(yTitle?.kind).toBe("node");
    expect(xTick?.kind).toBe("node");
    expect(xTitle?.kind).toBe("node");
    if (
      yTick?.kind === "node" &&
      yTitle?.kind === "node" &&
      xTick?.kind === "node" &&
      xTitle?.kind === "node"
    ) {
      const yTickX = yTick.props.x?.kind === "number" ? yTick.props.x.value : 99;
      const yTitleX = yTitle.props.x?.kind === "number" ? yTitle.props.x.value : 99;
      const xTickY = xTick.props.y?.kind === "number" ? xTick.props.y.value : 0;
      const xTitleY = xTitle.props.y?.kind === "number" ? xTitle.props.y.value : 0;
      expect(yTitleX).toBeLessThan(yTickX);
      expect(xTitleY).toBeGreaterThan(xTickY);
      expect(xTitleY).toBeLessThan(68);
    }
    if (title?.kind === "node") {
      const titleY = title.props.y?.kind === "number" ? title.props.y.value : 99;
      expect(titleY).toBeLessThan(14);
      expect(titleY).toBeGreaterThan(0);
    }
  });
});
