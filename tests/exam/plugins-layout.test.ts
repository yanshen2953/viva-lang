import { afterEach, describe, expect, it } from "vitest";
import { literal } from "../../src/ast";
import { compileSource } from "../../src/pipeline";
import { evaluate } from "../../src/eval";
import { listWidgets, registerWidget, resetWidgetPlugins } from "../../src/widgets";
import { figureCopyDefaults, figureGapDefaults } from "../../src/layout/figure-gap.js";
import { simulate } from "../../src/simulate";
import { readFileSync } from "node:fs";
import path from "node:path";

afterEach(() => {
  resetWidgetPlugins();
});

describe("widget plugin registry", () => {
  it("seeds builtins on compile and lists them", () => {
    const result = compileSource(
      `artifact T
scene
  size: 120 80
`,
      "t.viva",
    );
    expect(result.error).toBeNull();
    expect(listWidgets()).toEqual(
      expect.arrayContaining([
        "chart.bar",
        "chart.box",
        "chart.funnel",
        "chart.heatmap",
        "chart.line",
        "chart.scatter",
        "chart.vector",
        "chart.violin",
        "layout.board",
        "layout.figure",
        "timeline",
      ]),
    );
  });

  it("lets a host register a widget without new language keywords", () => {
    registerWidget({
      name: "demo.box",
      expand({ artifact, props }) {
        artifact.scene?.layers.push({
          name: "__demo_box",
          span: artifact.span,
          props: {},
          items: [
            {
              kind: "node",
              name: "box",
              props: {
                x: props.x ?? literal(10),
                y: props.y ?? literal(10),
                w: literal(40),
                h: literal(40),
              },
              span: artifact.span,
            },
          ],
        });
      },
    });
    const result = compileSource(
      `artifact P
scene
  size: 200 200
widget demo.box
  x: 12
  y: 20
`,
      "p.viva",
    );
    expect(result.error).toBeNull();
    expect(result.ir!.scene.layers.some((l) => l.name === "__demo_box")).toBe(true);
    const layer = result.ir!.scene.layers.find((l) => l.name === "__demo_box")!;
    const node = layer.items[0];
    expect(node?.kind).toBe("node");
    if (node?.kind === "node") {
      expect(evaluate(node.props.x, [{}, {}])).toBe(12);
    }
  });

  it("fails closed on unknown widgets and names the registry", () => {
    const result = compileSource(
      `artifact P
scene
  size: 100 100
widget chart.ridge
  data: series
`,
      "u.viva",
    );
    expect(result.ir).toBeNull();
    expect(result.error).toMatch(/unknown widget 'chart.ridge'/);
    expect(result.error).toMatch(/layout.figure/);
    expect(result.diagnostics.some((d) => d.code === "unknown-widget")).toBe(true);
  });
});

describe("layout.figure plugin", () => {
  it("creates lettered frames and lets charts bind with panel:", () => {
    const result = compileSource(
      `artifact Grid
data series = [{ x: 1, y: 2 }, { x: 3, y: 4 }]
scene
  size: 800 600
widget chart.scatter
  panel: a
  data: series
  xField: x
  yField: y
  xlim: 0 5
  ylim: 0 10
  interactive: false
widget layout.figure
  x: 0
  y: 0
  w: 800
  h: 600
  cols: 2
  rows: 2
  gutter: 28
  margin: 16
  insetL: 52
  insetR: 20
  insetT: 28
  insetB: 40
  labels: true
`,
      "grid.viva",
    );
    expect(result.error).toBeNull();
    const ir = result.ir!;
    expect(ir.frames.map((f) => f.name)).toEqual(["a", "b", "c", "d"]);
    const a = ir.frames.find((f) => f.name === "a")!;
    const x = evaluate(a.props.x, [ir.state, ir.data]) as number[];
    const y = evaluate(a.props.y, [ir.state, ir.data]) as number[];
    // cell (0,0): origin 16,16 size 370×270; plot inset L52 R20 T28 B40
    expect(x[0]).toBeCloseTo(68);
    expect(x[1]).toBeCloseTo(366);
    expect(y[0]).toBeCloseTo(44);
    expect(y[1]).toBeCloseTo(246);
    expect(ir.scene.layers.some((l) => l.name === "__fig_labels")).toBe(true);
    expect(ir.scene.layers.some((l) => l.name === "__a_axes")).toBe(true);
    expect(ir.scene.layers.some((l) => l.name === "__a_marks")).toBe(true);
    const labels = ir.scene.layers.find((l) => l.name === "__fig_labels")!;
    const texts = labels.items
      .filter((i) => i.kind === "node")
      .map((i) => (i.kind === "node" ? evaluate(i.props.text, [{}, {}]) : ""));
    expect(texts).toEqual(["(a)", "(b)", "(c)", "(d)"]);
  });

  it("compiles the figure-grid example onto four panels without areaX", () => {
    const src = readFileSync(path.resolve("examples/figure-grid.viva"), "utf8");
    const result = compileSource(src, "figure-grid.viva", {
      handbookIds: ["print-nature"],
    });
    expect(result.error).toBeNull();
    const names = result.ir!.frames.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["a", "b", "c", "d"]));
    expect(result.ir!.scene.layers.some((l) => l.name === "__a_marks")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__b_marks")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__c_marks")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__d_marks")).toBe(true);
    expect(src).not.toMatch(/insetL|insetR|insetT|insetB|areaX|areaY/);
    const a = result.ir!.frames.find((f) => f.name === "a")!;
    const cell = evaluate(a.props.cellX!, [result.ir!.state, result.ir!.data]) as number[];
    const plot = evaluate(a.props.x, [result.ir!.state, result.ir!.data]) as number[];
    expect(plot[0]).toBeGreaterThan(cell[0]!);
    expect(plot[1]).toBeLessThan(cell[1]!);
    expect(plot[0]! - cell[0]!).toBeGreaterThan(12);
  });

  it("paints title/subtitle/caption and fills the scene without x/y/w/h", () => {
    const result = compileSource(
      `artifact Titled
data series = [{ x: 1, y: 2 }, { x: 3, y: 4 }]
scene
  size: 800 600
  background: #ffffff
widget layout.figure
  title: "Figure 1. Response"
  subtitle: "n=12 · print-nature"
  caption: "Source: virtual cohort"
  cols: 2
  rows: 1
  gutter: 20
  margin: 12
widget chart.scatter
  panel: a
  data: series
  xField: x
  yField: y
  xlim: 0 5
  ylim: 0 10
  interactive: false
`,
      "titled.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const ir = result.ir!;
    const copy = ir.scene.layers.find((l) => l.name === "__fig_copy");
    expect(copy).toBeTruthy();
    const texts = copy!.items
      .filter((i) => i.kind === "node")
      .map((i) => (i.kind === "node" ? evaluate(i.props.text, [ir.state, ir.data]) : ""));
    expect(texts).toEqual(["Figure 1. Response", "n=12 · print-nature", "Source: virtual cohort"]);
    expect(ir.scene.layers.some((l) => l.name === "__fig_plate")).toBe(true);
    const a = ir.frames.find((f) => f.name === "a")!;
    const cellY = evaluate(a.props.cellY!, [ir.state, ir.data]) as number[];
    expect(cellY[0]).toBeGreaterThan(24);
    const cellX = evaluate(a.props.cellX!, [ir.state, ir.data]) as number[];
    expect(cellX[0]).toBeGreaterThanOrEqual(0);
    expect(cellX[1]).toBeLessThanOrEqual(800);
  });

  it("lets a figure inherit layout.board body without magic x/y/w/h", () => {
    const result = compileSource(
      `artifact Page
data series = [{ x: 1, y: 2 }, { x: 3, y: 4 }]
scene
  size: 640 400
  background: #ffffff
widget layout.board
  title: "Board title"
  caption: "Board caption"
  safe: 20
  guides: false
widget layout.figure
  panel: body
  cols: 2
  rows: 1
  gutter: 16
  margin: 8
widget chart.scatter
  panel: a
  data: series
  xField: x
  yField: y
  xlim: 0 5
  ylim: 0 10
  interactive: false
`,
      "page.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const ir = result.ir!;
    expect(ir.scene.layers.some((l) => l.name === "__board_copy")).toBe(true);
    const body = ir.frames.find((f) => f.name === "body")!;
    const a = ir.frames.find((f) => f.name === "a")!;
    const bodyX = evaluate(body.props.x, [ir.state, ir.data]) as number[];
    const bodyY = evaluate(body.props.y, [ir.state, ir.data]) as number[];
    const cellX = evaluate(a.props.cellX!, [ir.state, ir.data]) as number[];
    const cellY = evaluate(a.props.cellY!, [ir.state, ir.data]) as number[];
    expect(cellX[0]).toBeGreaterThanOrEqual(bodyX[0]!);
    expect(cellX[1]).toBeLessThanOrEqual(bodyX[1]!);
    expect(cellY[0]).toBeGreaterThanOrEqual(bodyY[0]!);
    expect(cellY[1]).toBeLessThanOrEqual(bodyY[1]!);
    const cap = ir.scene.layers
      .find((l) => l.name === "__board_copy")!
      .items.find((i) => i.kind === "node" && i.name === "board_docCap");
    expect(cap?.kind).toBe("node");
    if (cap?.kind === "node") {
      expect(evaluate(cap.props.text, [ir.state, ir.data])).toBe("Board caption");
    }
  });

  it("paints board control chips from controls/bind without scene nodes", () => {
    const result = compileSource(
      `artifact Hud
state gene = "CD8A"
scene
  size: 640 360
  background: #ffffff
widget layout.board
  title: "Board"
  controls: [CD8A, IL6]
  bind: gene
  safe: 20
  guides: false
`,
      "hud.viva",
    );
    expect(result.error).toBeNull();
    const ir = result.ir!;
    expect(ir.frames.map((f) => f.name)).toEqual(expect.arrayContaining(["hud", "lower", "body"]));
    expect(ir.scene.layers.some((l) => l.name === "__board_controls")).toBe(true);
    const click = ir.events.find((e) => e.type === "click" && e.target === "board_ctl_1");
    expect(click).toBeTruthy();
    const after = simulate(ir, { events: [{ type: "click", target: "board_ctlLbl_1" }] });
    expect(after.state.gene).toBe("IL6");
    const chips = ir.scene.layers
      .find((l) => l.name === "__board_controls")!
      .items.filter((i) => i.kind === "node");
    expect(chips.some((i) => i.kind === "node" && i.name === "board_ctlVal")).toBe(false);
    const on = chips.find((i) => i.kind === "node" && i.name === "board_ctl_0");
    const off = chips.find((i) => i.kind === "node" && i.name === "board_ctl_1");
    const offLbl = chips.find((i) => i.kind === "node" && i.name === "board_ctlLbl_1");
    expect(on?.kind).toBe("node");
    expect(off?.kind).toBe("node");
    expect(offLbl?.kind).toBe("node");
    if (on?.kind === "node" && off?.kind === "node" && offLbl?.kind === "node") {
      expect(evaluate(on.props.opacity!, [ir.state, ir.data])).toBeCloseTo(1);
      expect(evaluate(off.props.opacity!, [ir.state, ir.data])).toBeCloseTo(0.4);
      expect(evaluate(offLbl.props.opacity!, [ir.state, ir.data])).toBeCloseTo(0.4);
      expect(evaluate(off.props.opacity!, [after.state, ir.data])).toBeCloseTo(1);
    }
  });

  it("tiles two unbound charts into a figure grid without areaX", () => {
    const src = `artifact Pair
data a = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
data b = [{ x: 1, y: 8 }, { x: 2, y: 3 }]
scene
  size: 640 240
  background: #ffffff
widget chart.line
  data: a
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 6
  interactive: false
widget chart.line
  data: b
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 10
  interactive: false
`;
    const result = compileSource(src, "pair.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(expect.arrayContaining(["a", "b"]));
    expect(result.ir!.scene.layers.some((l) => l.name === "__auto_labels")).toBe(true);
    const a = result.ir!.frames.find((f) => f.name === "a")!;
    const b = result.ir!.frames.find((f) => f.name === "b")!;
    const ax = evaluate(a.props.x, [result.ir!.state, result.ir!.data]) as number[];
    const bx = evaluate(b.props.x, [result.ir!.state, result.ir!.data]) as number[];
    expect(ax[1]!).toBeLessThan(bx[0]!);
  });

  it("sizes omitted figure gutters in scene units so mm columns stay readable", () => {
    const mm = figureGapDefaults({ unit: "mm", width: 89, cols: 2 });
    const px = figureGapDefaults({ unit: "px", width: 1360, cols: 2 });
    expect(mm.gutter).toBeLessThan(5);
    expect(mm.margin).toBeLessThan(3);
    expect(px.gutter).toBe(28);
    const result = compileSource(
      `artifact MmGrid
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  unit: mm
  column: single
  width: 89
  height: 68
  background: #ffffff
widget layout.figure
  cols: 2
  rows: 1
widget chart.line
  panel: a
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  interactive: false
widget chart.line
  panel: b
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  interactive: false
`,
      "mm-grid.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const ir = result.ir!;
    const a = ir.frames.find((f) => f.name === "a")!;
    const b = ir.frames.find((f) => f.name === "b")!;
    const env = [ir.state, ir.data];
    const ax = evaluate(a.props.cellX!, env) as number[];
    const bx = evaluate(b.props.cellX!, env) as number[];
    const gap = bx[0]! - ax[1]!;
    expect(gap).toBeCloseTo(2.4, 5);
    expect(ax[1]! - ax[0]!).toBeGreaterThan(30);
  });

  it("keeps omitted figure title bands in millimetres on unit: mm", () => {
    const bands = figureCopyDefaults({
      unit: "mm",
      hasTitle: true,
      hasSubtitle: true,
      hasCaption: true,
    });
    expect(bands.titleH).toBeLessThan(10);
    expect(bands.capH).toBeLessThan(5);
    const result = compileSource(
      `artifact MmTitled
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  unit: mm
  column: single
  width: 89
  height: 68
  background: #ffffff
widget layout.figure
  title: "Single-column 89 mm"
  caption: "virtual cohort"
  cols: 2
  rows: 1
widget chart.line
  panel: a
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  interactive: false
widget chart.line
  panel: b
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  interactive: false
`,
      "mm-titled.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const ir = result.ir!;
    const env = [ir.state, ir.data];
    const a = ir.frames.find((f) => f.name === "a")!;
    const cellY = evaluate(a.props.cellY!, env) as number[];
    expect(cellY[0]).toBeGreaterThan(4);
    expect(cellY[0]).toBeLessThan(12);
    const title = ir.scene.layers
      .find((l) => l.name === "__fig_copy")!
      .items.find((i) => i.kind === "node" && i.name === "fig_title");
    expect(title?.kind).toBe("node");
    if (title?.kind === "node") {
      expect(evaluate(title.props.y, env)).toBeLessThan(5);
    }
  });
});
