import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { compileSource } from "../../src/pipeline";
import { evaluate } from "../../src/eval";
import { applyFrameToProps, linearMap, scalesFromFrameProps } from "../../src/space";
import type { Expr } from "../../src/ast";
import type { VisualIR } from "../../src/ir";

type ExpectSpec = {
  case: string;
  input: string;
  expect: {
    layers?: string[];
    layerProps?: Record<string, Record<string, unknown>>;
    frames?: string[];
    frameProps?: Record<string, Record<string, unknown>>;
    data?: string[];
    marks?: { forItem?: string; source?: string; nodeName?: string; frame?: string };
    scale?: {
      xValue: number;
      expectedX: number;
      xDomain: [number, number];
      xRange: [number, number];
      yValue: number;
      expectedY: number;
      yDomain: [number, number];
      yRange: [number, number];
    };
  };
};

const corpusDir = path.resolve("tests/corpus");
const specs: { file: string; spec: ExpectSpec }[] = readdirSync(corpusDir)
  .filter((f) => f.endsWith(".expect.json"))
  .map((f) => ({
    file: f,
    spec: JSON.parse(readFileSync(path.join(corpusDir, f), "utf8")) as ExpectSpec,
  }));

function evalProps(exprs: Record<string, Expr>, scopes: [Record<string, unknown>, Record<string, unknown>]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, expr] of Object.entries(exprs)) out[key] = evaluate(expr, scopes);
  return out;
}

function layerProps(ir: VisualIR, name: string): Record<string, unknown> {
  const layer = ir.scene.layers.find((l) => l.name === name);
  return layer ? evalProps(layer.props ?? {}, [ir.state, ir.data]) : {};
}

function frameProps(ir: VisualIR, name: string): Record<string, unknown> {
  const frame = ir.frames.find((f) => f.name === name);
  return frame ? evalProps(frame.props, [ir.state, ir.data]) : {};
}

describe("exam corpus (input .viva -> expected VisualIR)", () => {
  it("discovered at least the 7 required cases", () => {
    expect(specs.length).toBeGreaterThanOrEqual(7);
  });

  for (const { file, spec } of specs) {
    it(`corpus: ${spec.case} (${file})`, () => {
      const src = readFileSync(path.resolve(spec.input), "utf8");
      const result = compileSource(src, spec.input);
      expect(result.error, `${spec.case}: ${result.error}`).toBeNull();
      const ir = result.ir!;

      if (spec.expect.layers) {
        expect(ir.scene.layers.map((l) => l.name)).toEqual(spec.expect.layers);
      }
      if (spec.expect.layerProps) {
        for (const [name, props] of Object.entries(spec.expect.layerProps)) {
          expect(layerProps(ir, name)).toMatchObject(props);
        }
      }
      if (spec.expect.frames) {
        expect(ir.frames.map((f) => f.name)).toEqual(spec.expect.frames);
      }
      if (spec.expect.frameProps) {
        for (const [name, props] of Object.entries(spec.expect.frameProps)) {
          expect(frameProps(ir, name)).toMatchObject(props);
        }
      }
      if (spec.expect.data) {
        expect(Object.keys(ir.data).sort()).toEqual([...spec.expect.data].sort());
      }
      if (spec.expect.marks) {
        const forItem = findMarksFor(ir, spec.expect.marks.source);
        expect(forItem).not.toBeNull();
        const node = forItem!.body[0];
        expect(node.kind).toBe("node");
        if (node.kind === "node") {
          expect(node.name).toBe(spec.expect.marks.nodeName);
          expect(node.props.frame && evaluate(node.props.frame, [ir.state, ir.data])).toBe(
            spec.expect.marks.frame,
          );
        }
      }
      if (spec.expect.scale) {
        const s = spec.expect.scale;
        const scales = scalesFromFrameProps("plot", frameProps(ir, "plot"));
        // Frame geometry comes straight from the declared numbers (no magic).
        expect(scales.x0).toBe(s.xRange[0]);
        expect(scales.x1).toBe(s.xRange[1]);
        expect(scales.y0).toBe(s.yRange[0]);
        expect(scales.y1).toBe(s.yRange[1]);
        expect(scales.xmin).toBe(s.xDomain[0]);
        expect(scales.xmax).toBe(s.xDomain[1]);
        expect(scales.ymin).toBe(s.yDomain[0]);
        expect(scales.ymax).toBe(s.yDomain[1]);

        const probe = applyFrameToProps(
          { frame: "plot", x: s.xValue, y: s.yValue },
          [scales],
        );
        // Oracle values are real numbers, not recomputed by the test.
        expect(probe.x).toBeCloseTo(s.expectedX);
        expect(probe.y).toBeCloseTo(s.expectedY);

        // Independent midpoint sanity, so the oracle isn't a round-trip.
        const midX = linearMap(s.xValue, s.xDomain, s.xRange, false);
        const midY = linearMap(s.yValue, s.yDomain, s.yRange, true);
        expect(midX).toBeCloseTo(s.expectedX);
        expect(midY).toBeCloseTo(s.expectedY);
      }
    });
  }
});

function findMarksFor(
  ir: VisualIR,
  source: string,
): Extract<VisualIR["scene"]["layers"][number]["items"][number], { kind: "for" }> | null {
  for (const layer of ir.scene.layers) {
    for (const item of layer.items) {
      if (item.kind !== "for") continue;
      if (item.source.kind === "ident" && item.source.path.join(".") === source) return item;
    }
  }
  return null;
}
