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
