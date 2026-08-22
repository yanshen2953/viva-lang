import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compileSource } from "../../src/pipeline";
import { parse } from "../../src/parser";
import { compile } from "../../src/compiler";
import { evaluate } from "../../src/eval";
import {
  applyFrameToProps,
  linearMap,
  scalesFromFrameProps,
  type FrameScales,
} from "../../src/space";
import type { Expr } from "../../src/ast";

const examDir = path.resolve("examples/exam");

function evalProps(
  exprs: Record<string, Expr>,
  state: Record<string, unknown>,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(exprs)) out[key] = evaluate(expr, [state, data]);
  return out;
}

describe("space: linear scales (S1) — no magic numbers", () => {
  it("maps a data domain to a scene range", () => {
    // x: data 0..10 -> scene 80..720
    expect(linearMap(0, [0, 10], [80, 720])).toBe(80);
    expect(linearMap(5, [0, 10], [80, 720])).toBe(400);
    expect(linearMap(10, [0, 10], [80, 720])).toBe(720);
  });

  it("inverts y so the top of the data domain lands on the top of the scene", () => {
    expect(linearMap(0, [0, 100], [70, 400], true)).toBe(400);
    expect(linearMap(50, [0, 100], [70, 400], true)).toBe(235);
    expect(linearMap(100, [0, 100], [70, 400], true)).toBe(70);
  });

  it("derives FrameScales from frame props", () => {
    const scales = scalesFromFrameProps("plot", {
      x: [80, 720],
      y: [70, 400],
      xlim: [0, 10],
      ylim: [0, 100],
    });
    expect(scales).toEqual({
      name: "plot",
      x0: 80,
      x1: 720,
      y0: 70,
      y1: 400,
      xmin: 0,
      xmax: 10,
      ymin: 0,
      ymax: 100,
    });
  });

  it("applies frame props to a node (S1 fixture)", () => {
    const src = readFileSync(path.join(examDir, "S1_frame_scale.viva"), "utf8");
    const result = compileSource(src, "S1_frame_scale.viva");
    expect(result.error).toBeNull();
    const ir = result.ir!;
    const frame = ir.frames[0]!;
    const props = evalProps(frame.props, ir.state, ir.data);
    const scales = scalesFromFrameProps(frame.name, props);
    const mapped = applyFrameToProps({ frame: "plot", x: 5, y: 50, r: 4 }, [scales]);
    expect(mapped.x).toBeCloseTo(400);
    expect(mapped.y).toBeCloseTo(235);
  });

  it("maps line endpoints in a frame, not just points", () => {
    const scales: FrameScales = {
      name: "plot",
      x0: 80,
      x1: 720,
      y0: 70,
      y1: 400,
      xmin: 0,
      xmax: 10,
      ymin: 0,
      ymax: 100,
    };
    const mapped = applyFrameToProps(
      { frame: "plot", x1: 0, y1: 0, x2: 10, y2: 100 },
      [scales],
    );
    expect(mapped.x1).toBe(80);
    expect(mapped.y1).toBe(400);
    expect(mapped.x2).toBe(720);
    expect(mapped.y2).toBe(70);
  });
});

describe("widgets: chart.scatter expansion (C1)", () => {
  it("expands the C1 fixture into frame + axes + marks layers", () => {
    const src = readFileSync(path.join(examDir, "C1_chart_scatter.viva"), "utf8");
    const result = compileSource(src, "C1_chart_scatter.viva");
    expect(result.error).toBeNull();
    const ir = result.ir!;
    expect(ir.frames.map((f) => f.name)).toEqual(["plot"]);
    expect(ir.scene.layers.map((l) => l.name)).toEqual([
      "__plot_axes",
      "__plot_marks",
    ]);

    const marksLayer = ir.scene.layers.find((l) => l.name === "__plot_marks")!;
    expect(marksLayer.items).toHaveLength(1);
    const forItem = marksLayer.items[0]!;
    expect(forItem.kind).toBe("for");
    if (forItem.kind !== "for") return;
    expect(forItem.item).toBe("row");
    expect(forItem.source.kind).toBe("ident");
    if (forItem.source.kind === "ident") {
      expect(forItem.source.path.join(".")).toBe("series");
    }
    const node = forItem.body[0]!;
    expect(node.kind).toBe("node");
    if (node.kind !== "node") return;
    expect(node.name).toBe("mark");
    expect(evaluate(node.props.frame, [ir.state, ir.data])).toBe("plot");
    // x stays an identifier resolved per-row at render time.
    expect(node.props.x?.kind).toBe("ident");
  });

  it("auto-creates a default frame when the widget does not name one", () => {
    const artifact = parse(
      `artifact C
data series = [{ x: 1, y: 2 }, { x: 3, y: 4 }]
scene
  size: 880 480
widget chart.scatter
  data: series
  xField: x
  yField: y
  xlim: 0 5
  ylim: 0 10
  areaX: 40 400
  areaY: 40 300
`,
      "c.viva",
    );
    const ir = compile(artifact);
    // A default frame is auto-named __chart_1; its layers are __ + __chart_1 + _axes.
    // (that's four leading underscores: `__` + `__chart_1` + `_...`)
    expect(ir.frames.map((f) => f.name)).toEqual(["__chart_1"]);
    expect(ir.scene.layers.some((l) => l.name === "____chart_1_axes")).toBe(true);
    expect(ir.scene.layers.some((l) => l.name === "____chart_1_marks")).toBe(true);
  });
});
