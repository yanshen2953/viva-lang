import { afterEach, describe, expect, it } from "vitest";
import { literal } from "../../src/ast";
import { compileSource } from "../../src/pipeline";
import { evaluate } from "../../src/eval";
import { listWidgets, registerWidget, resetWidgetPlugins } from "../../src/widgets";
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
        "chart.funnel",
        "chart.heatmap",
        "chart.line",
        "chart.scatter",
        "chart.vector",
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
widget chart.violin
  data: series
`,
      "u.viva",
    );
    expect(result.ir).toBeNull();
    expect(result.error).toMatch(/unknown widget 'chart.violin'/);
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
  });
});
