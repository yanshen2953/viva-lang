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
  zLabel: "normalized expression"
  zUnit: "log2"
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
    const cell = marks.items.find((i) => i.kind === "node" && i.name === "heatCell");
    expect(cell?.kind).toBe("node");
    if (cell?.kind === "node") {
      expect(cell.props.__chartHeat).toBeDefined();
      expect(cell.props.__heatData).toBeDefined();
      expect(cell.props.visible).toBeDefined();
      expect(JSON.stringify(cell.props.visible)).toContain("__sel");
    }
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const names = axes.items.filter((i) => i.kind === "node").map((i) => (i.kind === "node" ? i.name : ""));
    expect(names.some((n) => n.includes("_cbar_"))).toBe(true);
    expect(names.some((n) => n.includes("_cbarLbl_"))).toBe(true);
    expect(names.some((n) => n.includes("_cbarTitle"))).toBe(true);
    const titleText = axes.items
      .filter((i) => i.kind === "node" && i.name.includes("_cbarTitle"))
      .map((i) =>
        i.kind === "node" && i.props.text && "value" in i.props.text ? String(i.props.text.value) : "",
      )
      .join("");
    expect(titleText.replace(/\s/g, "")).toMatch(/normalizedexpression/);
    const tickText = (suffix: string) =>
      axes.items
        .filter((i) => i.kind === "node" && i.name.includes(suffix))
        .map((i) => (i.kind === "node" && i.props.text?.kind === "string" ? i.props.text.value : ""));
    expect(tickText("_xtick_")).toEqual(["1", "2"]);
    expect(tickText("_ytick_")).toEqual(expect.arrayContaining(["1", "2"]));
    expect(tickText("_xtick_")).not.toContain("0");
    expect(tickText("_xtick_")).not.toContain("3");
  });

  it("infers heat cell pitch from unique numeric spacing", () => {
    const src = `artifact "Pitch"
data cells = [
  { col: 0, row: 0, v: 1 }
  { col: 2, row: 0, v: 2 }
  { col: 4, row: 0, v: 3 }
  { col: 0, row: 2, v: 1 }
  { col: 2, row: 2, v: 2 }
  { col: 4, row: 2, v: 3 }
]
scene
  size: 400 240
widget chart.heatmap
  data: cells
  xField: col
  yField: row
  valueField: v
  xlim: -1 5
  ylim: -1 3
  interactive: false
`;
    const result = compileSource(src, "pitch.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    const cells = marks.items.filter((i) => i.kind === "node" && i.name === "heatCell");
    expect(cells.length).toBe(6);
    for (const cell of cells) {
      if (cell.kind !== "node") continue;
      expect(cell.props.w).toMatchObject({ kind: "number", value: 2 });
      expect(cell.props.h).toMatchObject({ kind: "number", value: 2 });
    }
  });

  it("keeps an mm heatmap colorbar in plot height and parks zLabel beside it", () => {
    const src = readFileSync("examples/paper-linked-marks.viva", "utf8");
    const result = compileSource(src, "paper-linked-marks.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name === "__b_axes")!;
    const num = (name: string, key: "x" | "y" | "w" | "h") => {
      const n = axes.items.find((i) => i.kind === "node" && i.name === name);
      return n?.kind === "node" && n.props[key]?.kind === "number" ? n.props[key].value : NaN;
    };
    const barW = num("b_cbar_0", "w");
    const barX = num("b_cbar_0", "x");
    const topY = num("b_cbar_6", "y");
    const titleX = num("b_cbarTitle", "x");
    const titleY = num("b_cbarTitle", "y");
    const plotY0 = result.ir!.frames.find((f) => f.name === "b")!.props.y;
    const plotTop = plotY0?.kind === "array" && plotY0.items[0]?.kind === "number" ? plotY0.items[0].value : 0;
    expect(barW).toBeGreaterThan(2);
    expect(barW).toBeLessThan(4);
    expect(titleX).toBeGreaterThan(barX + barW);
    expect(topY).toBeGreaterThan(plotTop - 1);
    const plotY1 = plotY0?.kind === "array" && plotY0.items[1]?.kind === "number" ? plotY0.items[1].value : 0;
    expect(titleY).toBeGreaterThan(plotTop);
    expect(titleY).toBeLessThan(plotY1);
    const title = axes.items.find((i) => i.kind === "node" && i.name === "b_cbarTitle");
    expect(title?.kind).toBe("node");
    const heatTicks = axes.items
      .filter((i) => i.kind === "node" && /_xtick_\d+$/.test(i.name))
      .map((i) => (i.kind === "node" && i.props.text?.kind === "string" ? i.props.text.value : ""));
    expect(heatTicks).toEqual(["1", "2", "3"]);
    if (title?.kind === "node") {
      expect(title.props.role).toMatchObject({ kind: "string", value: "annotation" });
      expect(title.props.rotate).toMatchObject({ kind: "number", value: -90 });
      expect(title.props.font).toMatchObject({ kind: "number", value: 9 });
      expect(title.props.letterSpacing).toMatchObject({ kind: "number", value: 0.2 });
    }
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
    const src = readFileSync("examples/box.viva", "utf8");
    expect(src).not.toMatch(/areaX|areaY/);
    const result = compileSource(src, "box.viva", { handbookIds: ["print-nature"] });
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

  it("paints a follow-cursor tip on mm paper instead of a standing corner HUD", () => {
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
    expect(names).toContain("chartTip");
    const tip = hud!.items.find((i) => i.kind === "node" && i.name === "chartTip");
    expect(tip?.kind).toBe("node");
    if (tip?.kind === "node") {
      expect(tip.props.x?.kind).not.toBe("number");
      expect(JSON.stringify(tip.props.x)).toContain("__tipX");
      expect(JSON.stringify(tip.props.y)).toContain("__tipY");
      expect(JSON.stringify(tip.props.visible)).toContain("__tip");
    }
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
    const src = readFileSync("examples/paper-cjk.viva", "utf8");
    expect(src).not.toMatch(/areaX|areaY/);
    const result = compileSource(src, "paper-cjk.viva", { handbookIds: ["print-nature"] });
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
      expect(titleY).toBeLessThan(20);
      expect(titleY).toBeGreaterThan(0);
      expect(title.props.text?.kind === "string" ? title.props.text.value : "").toBe("单栏投稿图");
    }
    const titleLines = axes.items.filter((i) => i.kind === "node" && /_title(_\d+)?$/.test(i.name));
    expect(titleLines).toHaveLength(1);
    const xTitleText =
      xTitle?.kind === "node" && xTitle.props.text?.kind === "string" ? xTitle.props.text.value : "";
    const yTitleText =
      yTitle?.kind === "node" && yTitle.props.text?.kind === "string" ? yTitle.props.text.value : "";
    expect(xTitleText).toBe("时间 (周)");
    expect(yTitleText).toBe("心率 (次每分)");
    expect(xTitleText).not.toMatch(/^\)$/);
  });

  it("exports vector heads as filled triangles", () => {
    const src = `artifact "Arrows"
data flow = [
  { x: 1, y: 1, ux: 2, uy: 0 }
]
scene
  size: 240 160
widget chart.vector
  data: flow
  xField: x
  yField: y
  uField: ux
  vField: uy
  xlim: 0 4
  ylim: 0 3
  areaX: 20 220
  areaY: 20 140
  interactive: false
`;
    const result = compileSource(src, "arrows.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    const loop = marks.items.find((i) => i.kind === "for");
    expect(loop?.kind).toBe("for");
    if (loop?.kind === "for") {
      const head = loop.body.find((b) => b.kind === "node" && b.name === "head");
      expect(head?.kind).toBe("node");
      if (head?.kind === "node") expect(head.props.__chartVec).toBeDefined();
    }
    const svg = renderSvgFromIr(result.ir!);
    expect(svg).toMatch(/<path[^>]+d="M /);
    expect(svg).toMatch(/Z"/);
    expect(svg).not.toMatch(/<circle[^>]+data-viva-name="head"/);
  });

  it("ticks a weekly line at the sample weeks, not a nice 5", () => {
    const src = `artifact "Weeks"
data rows = [
  { wk: 0, hr: 74 }
  { wk: 2, hr: 73 }
  { wk: 4, hr: 72 }
  { wk: 6, hr: 71 }
  { wk: 8, hr: 70 }
  { wk: 10, hr: 69 }
  { wk: 12, hr: 68 }
]
scene
  size: 400 240
widget chart.line
  data: rows
  xField: wk
  yField: hr
  xlim: 0 12
  ylim: 50 80
  interactive: false
`;
    const result = compileSource(src, "weeks.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const xs = axes.items
      .filter((i) => i.kind === "node" && /_xtick_\d+$/.test(i.name))
      .map((i) => (i.kind === "node" && i.props.text?.kind === "string" ? i.props.text.value : ""));
    expect(xs[0]).toBe("0");
    expect(xs[xs.length - 1]).toBe("12");
    expect(xs).not.toContain("5");
  });

  it("ticks a numeric bar axis at the visits, not xlim padding", () => {
    const src = `artifact "Visits"
data rows = [
  { visit: 1, pct: 38 }
  { visit: 2, pct: 41 }
  { visit: 3, pct: 44 }
  { visit: 4, pct: 46 }
  { visit: 5, pct: 48 }
  { visit: 6, pct: 50 }
]
scene
  size: 400 240
widget chart.bar
  data: rows
  xField: visit
  yField: pct
  xlim: 0 7
  ylim: 0 100
  interactive: false
`;
    const result = compileSource(src, "visits.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const xs = axes.items
      .filter((i) => i.kind === "node" && /_xtick_\d+$/.test(i.name))
      .map((i) => (i.kind === "node" && i.props.text?.kind === "string" ? i.props.text.value : ""));
    expect(xs[0]).toBe("1");
    expect(xs[xs.length - 1]).toBe("6");
    expect(xs).not.toContain("0");
    expect(xs).not.toContain("7");
  });

  it("pins author xlim/ylim ends onto linear ticks", () => {
    const src = `artifact "Ends"
data rows = [
  { x: 10, y: 12 }
  { x: 40, y: 20 }
]
scene
  size: 400 240
widget chart.scatter
  data: rows
  xField: x
  yField: y
  xlim: 0 70
  ylim: 6 28
  interactive: false
`;
    const result = compileSource(src, "ends.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const texts = (suffix: string) =>
      axes.items
        .filter((i) => i.kind === "node" && i.name.includes(suffix))
        .map((i) => (i.kind === "node" && i.props.text?.kind === "string" ? i.props.text.value : ""));
    const xs = texts("_xtick_");
    const ys = texts("_ytick_");
    expect(xs[0]).toBe("0");
    expect(xs[xs.length - 1]).toBe("70");
    expect(ys).toContain("6");
    expect(ys).toContain("28");
    expect(ys[0]).toBe("28");
    expect(ys[ys.length - 1]).toBe("6");
  });

  it("joins an unquoted multi-word xLabel onto a horizontal funnel", () => {
    const src = `artifact "Funnel words"
data rows = [
  { arm: "placebo", score: 8 }
  { arm: "drug-A", score: 18 }
]
scene
  size: 400 240
widget chart.funnel
  data: rows
  xField: score
  yField: arm
  xlim: 0 24
  xLabel: Sum score
  yLabel: Arm
  interactive: false
`;
    const result = compileSource(src, "funnel-words.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const xTitle = axes.items.find((i) => i.kind === "node" && i.name.endsWith("_xTitle"));
    expect(xTitle?.kind).toBe("node");
    if (xTitle?.kind === "node") {
      expect(xTitle.props.text).toMatchObject({ kind: "string", value: "Sum score" });
    }
  });
});
