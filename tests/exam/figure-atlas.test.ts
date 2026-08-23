import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { propsToBBox } from "../../src/layout/node-bbox.js";
import type { VisualIR } from "../../src/ir.js";

function expectChromeInsideCells(ir: VisualIR): void {
  const env = [ir.state, ir.data];
  const nodes = ir.scene.layers.flatMap((l) => l.items.filter((i) => i.kind === "node"));
  for (const frame of ir.frames) {
    if (!frame.props.cellX || !frame.props.cellY) continue;
    const cellX = evaluate(frame.props.cellX, env) as number[];
    const cellY = evaluate(frame.props.cellY, env) as number[];
    const plotX = evaluate(frame.props.x, env) as number[];
    const plotY = evaluate(frame.props.y, env) as number[];
    expect(plotX[0]).toBeGreaterThan(cellX[0]!);
    expect(plotX[1]).toBeLessThan(cellX[1]!);
    expect(plotY[0]).toBeGreaterThan(cellY[0]!);
    expect(plotY[1]).toBeLessThan(cellY[1]!);
    for (const node of nodes) {
      if (node.kind !== "node" || !node.name.startsWith(`${frame.name}_`)) continue;
      if (!/_(title(_\d+)?|xTitle(_\d+)?|yTitle(_\d+)?|ytick_\d+|xtick_\d+|legLbl_\d+(_\d+)?|cbarLbl_\d+(_\d+)?|cbarTitle(_\d+)?)$/.test(node.name)) {
        continue;
      }
      const x = evaluate(node.props.x ?? node.props.x1, env);
      const y = evaluate(node.props.y ?? node.props.y1, env);
      if (typeof x !== "number" || typeof y !== "number") continue;
      const label = typeof node.props.text === "object" && node.props.text?.kind === "string"
        ? node.props.text.value
        : "";
      const align =
        node.props.align?.kind === "string"
          ? node.props.align.value
          : node.props.align?.kind === "ident"
            ? node.props.align.path.join(".")
            : "left";
      const rotate = node.props.rotate?.kind === "number" ? node.props.rotate.value : 0;
      const font = node.props.font?.kind === "number" ? node.props.font.value : 8;
      const tracking =
        node.props.letterSpacing?.kind === "number" ? node.props.letterSpacing.value : 0.08;
      const box = propsToBBox({ x, y, text: label, align, rotate, font, letterSpacing: tracking });
      expect(box.x).toBeGreaterThanOrEqual(cellX[0]! - 1);
      expect(box.x + box.w).toBeLessThanOrEqual(cellX[1]! + 1);
      expect(box.y).toBeGreaterThanOrEqual(cellY[0]! - 1);
      expect(box.y + box.h).toBeLessThanOrEqual(cellY[1]! + 1);
    }
  }
}

describe("figure-atlas example", () => {
  it("compiles six-panel atlas with print-nature handbook (default)", () => {
    const src = readFileSync("examples/figure-atlas.viva", "utf8");
    const result = compileSource(src, "figure-atlas.viva", {
      handbookIds: ["print-nature"],
    });
    expect(result.error).toBeNull();
    expect(result.ir?.name).toBe("Figure Atlas");
    expect(result.ir?.scene.layers.length).toBeGreaterThan(8);
    expect(result.ir?.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["a", "b", "c", "d", "e", "f"]),
    );
    const hasHeat = result.ir?.scene.layers.some((l) =>
      l.items.some(
        (i) =>
          (i.kind === "node" && i.name === "heatCell") ||
          (i.kind === "for" && i.body.some((b) => b.kind === "node" && b.name === "heatCell")),
      ),
    );
    expect(hasHeat).toBe(true);
    expect(src).not.toMatch(/insetL|insetR|insetT|insetB|areaX|areaY|gutter:|margin:|panelAdeck|panelLbl|figMain|docTitle|geneBtn/);
    expect(src).not.toMatch(/widget layout\.figure[\s\S]*?\n\s+(x|y|w|h):/);
    const boardChunk = src.slice(src.indexOf("widget layout.board"), src.indexOf("widget layout.figure"));
    expect(boardChunk).not.toMatch(/\n\s+(safe|titleH|lowerH|x|y|w|h):/);
    expect(result.ir!.scene.layers.some((l) => l.name === "__board_copy")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__board_controls")).toBe(true);
    expect(result.ir!.frames.map((f) => f.name)).toEqual(expect.arrayContaining(["hud"]));
    expect(result.ir!.events.some((e) => e.type === "click" && e.target === "board_ctl_0")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__fig_decks")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__fig_labels")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__fig_plate")).toBe(true);
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["safe", "title", "body", "lower", "a", "b", "c", "d", "e", "f"]),
    );
    const title = result.ir!.scene.layers
      .find((l) => l.name === "__board_copy")!
      .items.find((i) => i.kind === "node" && i.name === "board_docTitle");
    expect(title?.kind).toBe("node");
    if (title?.kind === "node") {
      expect(evaluate(title.props.text, [result.ir!.state, result.ir!.data])).toMatch(/虚拟临床队列/);
    }
    const a = result.ir!.frames.find((f) => f.name === "a")!;
    const body = result.ir!.frames.find((f) => f.name === "body")!;
    const cell = evaluate(a.props.cellX!, [result.ir!.state, result.ir!.data]) as number[];
    const plot = evaluate(a.props.x, [result.ir!.state, result.ir!.data]) as number[];
    const bodyX = evaluate(body.props.x, [result.ir!.state, result.ir!.data]) as number[];
    expect(cell[0]).toBeGreaterThanOrEqual(bodyX[0]!);
    expect(cell[1]).toBeLessThanOrEqual(bodyX[1]!);
    expect(plot[0]).toBeGreaterThan(cell[0]!);
    expect(plot[1]).toBeLessThan(cell[1]!);
    expect(plot[0]! - cell[0]!).toBeGreaterThan(12);
    expect(cell[1]! - plot[1]!).toBeGreaterThan(20);
    const env = [result.ir!.state, result.ir!.data];
    const bLegs = result.ir!.scene.layers
      .flatMap((l) => l.items)
      .filter((i) => i.kind === "node" && /^b_legLbl_/.test(i.name))
      .map((i) => (i.kind === "node" ? String(evaluate(i.props.text, env)) : ""));
    expect(bLegs.join(" ")).toMatch(/treatment/);
    expect(bLegs.some((t) => t === "t" || t === "treatmen")).toBe(false);
    const dAxes = result.ir!.scene.layers.find((l) => l.name === "__d_axes")!;
    const heatTicks = (suffix: string) =>
      dAxes.items
        .filter((i) => i.kind === "node" && i.name.includes(suffix))
        .map((i) => (i.kind === "node" && i.props.text?.kind === "string" ? i.props.text.value : ""));
    const xs = heatTicks("_xtick_");
    const ys = heatTicks("_ytick_");
    expect(xs).not.toContain("-0.5");
    expect(xs).not.toContain("7.5");
    expect(xs[0]).toBe("0");
    expect(xs[xs.length - 1]).toBe("7");
    expect(ys).not.toContain("-0.5");
    expect(ys).not.toContain("5.5");
    expect(ys).toContain("0");
    expect(ys).toContain("5");
    const heatCells = result.ir!.scene.layers
      .find((l) => l.name === "__d_marks")!
      .items.filter((i) => i.kind === "node" && i.name === "heatCell");
    expect(heatCells.length).toBe(48);
    expect(
      heatCells.every(
        (i) => i.kind === "node" && i.props.w?.kind === "number" && i.props.w.value === 1,
      ),
    ).toBe(true);
    expectChromeInsideCells(result.ir!);
  });
});
