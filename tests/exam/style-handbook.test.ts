import { describe, expect, it } from "vitest";
import { parse } from "../../src/parser.js";
import { compile } from "../../src/compiler.js";
import { evaluate } from "../../src/eval.js";
import { setStyleContext } from "../../src/style/context.js";
import { resolveStylePresets } from "../../src/style/registry.js";

describe("style handbook hook", () => {
  it("applies print-nature role defaults to unnamed rects", () => {
    const src = `
artifact "T"
scene
  layer main
    node panel
      x: 10
      y: 10
      w: 100
      h: 80
      role: panel
`;
    const ir = compile(parse(src), { handbookIds: ["print-nature"] });
    expect(ir.meta?.handbookIds).toContain("print-nature");
    const layer = ir.scene.layers.find((l) => l.name === "main");
    const node = layer?.items[0];
    expect(node?.kind).toBe("node");
    if (node?.kind === "node") {
      expect(node.props.fill?.kind).toBe("string");
    }
  });

  it("parses hyphenated roles like mark-area (not subtraction)", () => {
    const src = `
artifact "T"
scene
  layer main
    for c in heatCells
      node cell
        w: 40
        h: 40
        role: mark-area
        colorBy: tier
        palette: sequential
`;
    const ir = compile(parse(src), { handbookIds: ["print-nature"] });
    const forItem = ir.scene.layers[0]?.items[0];
    expect(forItem?.kind).toBe("for");
    if (forItem?.kind === "for") {
      const cell = forItem.body[0];
      expect(cell?.kind).toBe("node");
      if (cell?.kind === "node") {
        expect(cell.props.fill?.kind).toBe("call");
        expect(cell.props.fill?.kind === "call" && cell.props.fill.callee).toBe("palette");
      }
    }
  });

  it("injects palette() for colorBy in for-loops", () => {
    const src = `
artifact "T"
data pts = [
  { x: 1, y: 2, grp: "A" }
  { x: 2, y: 3, grp: "B" }
]
scene
  layer main
    for p in pts
      node dot
        x: p.x
        y: p.y
        r: 5
        role: mark
        colorBy: grp
        palette: categorical
`;
    const ir = compile(parse(src), { handbookIds: ["print-nature"] });
    const forItem = ir.scene.layers[0]?.items[0];
    expect(forItem?.kind).toBe("for");
    if (forItem?.kind === "for") {
      const body = forItem.body[0];
      if (body?.kind === "node") {
        expect(body.props.fill?.kind).toBe("call");
        if (body.props.fill?.kind === "call") {
          expect(body.props.fill.callee).toBe("palette");
        }
      }
    }
  });

  it("enforces print-nature glow policy at compile time", () => {
    const src = `
artifact "T"
scene
  layer main
    node glowy
      x: 0
      y: 0
      r: 20
      glow: 24
`;
    const artifact = parse(src);
    const hooked = compile(artifact, { handbookIds: ["print-nature"], enforce: true });
    const node = hooked.scene.layers[0]?.items[0];
    if (node?.kind === "node") {
      expect(node.props.glow).toBeUndefined();
    }
  });

  it("resolves palette() builtin at runtime eval", () => {
    const preset = resolveStylePresets(["print-nature"]);
    expect(preset).not.toBeNull();
    setStyleContext({ meta: { handbookIds: ["print-nature"], preset: preset! } });
    const a = evaluate(
      {
        kind: "call",
        callee: "palette",
        args: [
          { kind: "string", value: "A", span: { line: 1, column: 1 } },
          { kind: "string", value: "categorical", span: { line: 1, column: 1 } },
        ],
        span: { line: 1, column: 1 },
      },
      [{}],
    );
    const b = evaluate(
      {
        kind: "call",
        callee: "palette",
        args: [
          { kind: "string", value: "B", span: { line: 1, column: 1 } },
          { kind: "string", value: "categorical", span: { line: 1, column: 1 } },
        ],
        span: { line: 1, column: 1 },
      },
      [{}],
    );
    expect(a).not.toBe(b);
    setStyleContext(null);
  });

  it("styles chart.bar expansion via dashboard handbook", () => {
    const src = `
artifact "C"
data bars = [
  { cat: 1, val: 10, grp: "A" }
  { cat: 2, val: 20, grp: "B" }
]
widget chart.bar
  data: bars
  xField: cat
  yField: val
  group: grp
  xlim: 0 3
  ylim: 0 30
`;
    const ir = compile(parse(src), { handbookIds: ["dashboard"] });
    expect(ir.frames.length).toBeGreaterThan(0);
    const marks = ir.scene.layers.find((l) => l.name.endsWith("_marks"));
    expect(marks).toBeDefined();
  });

  it("resolves sequential palette by numeric tier", () => {
    const preset = resolveStylePresets(["dashboard"]);
    setStyleContext({ meta: { handbookIds: ["dashboard"], preset: preset! } });
    const low = evaluate(
      {
        kind: "call",
        callee: "palette",
        args: [
          { kind: "number", value: 0, span: { line: 1, column: 1 } },
          { kind: "string", value: "sequential", span: { line: 1, column: 1 } },
        ],
        span: { line: 1, column: 1 },
      },
      [{}],
    );
    const high = evaluate(
      {
        kind: "call",
        callee: "palette",
        args: [
          { kind: "number", value: 4, span: { line: 1, column: 1 } },
          { kind: "string", value: "sequential", span: { line: 1, column: 1 } },
        ],
        span: { line: 1, column: 1 },
      },
      [{}],
    );
    expect(low).not.toBe(high);
    setStyleContext(null);
  });
});
