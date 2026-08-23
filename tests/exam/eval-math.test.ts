import { describe, expect, it } from "vitest";
import { parse } from "../../src/parser";
import { evaluate } from "../../src/eval";
import { compileSource } from "../../src/pipeline";

describe("safe math calls + array concat", () => {
  it("parses and evaluates sin/cos/clamp", () => {
    const artifact = parse(`artifact M
state x = sin(0) + cos(0)
state y = clamp(2, 0, 1)
`);
    const ir = compileSource(
      `artifact M
state x = sin(0) + cos(0)
state y = clamp(2, 0, 1)
scene
  layer a
    node t
      x: 1
      y: 1
`,
      "m.viva",
    );
    expect(ir.error).toBeNull();
    expect(ir.ir!.state.x).toBeCloseTo(1);
    expect(ir.ir!.state.y).toBe(1);
  });

  it("concatenates arrays with +", () => {
    const expr = parse(`artifact A
data a = [1] + [2, 3]
`).data[0]!.value;
    expect(evaluate(expr, [{}])).toEqual([1, 2, 3]);
  });

  it("tests point-in-polygon with inside() and pathd()", () => {
    const result = compileSource(
      `artifact P
state hit = inside(2, 2, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }])
state miss = inside(9, 9, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }])
state d = pathd([{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 0 }])
scene
  layer a
    node t
      x: 1
      y: 1
`,
      "pip.viva",
    );
    expect(result.error).toBeNull();
    expect(result.ir!.state.hit).toBe(true);
    expect(result.ir!.state.miss).toBe(false);
    expect(result.ir!.state.d).toBe("M 1 2 L 3 4 L 5 0 Z");
  });

  it("tests membership with has()", () => {
    const result = compileSource(
      `artifact H
state ok = has(["A", "B"], "A")
state no = has(["A"], "C")
scene
  layer a
    node t
      x: 1
      y: 1
`,
      "has.viva",
    );
    expect(result.error).toBeNull();
    expect(result.ir!.state.ok).toBe(true);
    expect(result.ir!.state.no).toBe(false);
  });

  it("rejects unknown functions with a clear error", () => {
    const r = compileSource(
      `artifact A
state z = pow(2, 3)
scene
  layer a
    node t
      x: 1
      y: 1
`,
      "pow.viva",
    );
    expect(r.ir).toBeNull();
    expect(r.error).toMatch(/unknown function|pow/);
  });
});
