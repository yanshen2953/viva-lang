import { describe, expect, it } from "vitest";
import { roleToken } from "../../src/style/roles.js";
import { parse } from "../../src/parser.js";

describe("roleToken", () => {
  it("reconstructs mark-area from subtraction parse", () => {
    const a = parse(`artifact x
scene
  layer L
    node n
      role: mark-area
`);
    const n = a.scene!.layers[0]!.items[0];
    if (n.kind !== "node") throw new Error("node expected");
    expect(roleToken(n.props.role)).toBe("mark-area");
  });

  it("handles panel-label and mark-line", () => {
    for (const role of ["panel-label", "mark-line", "plot-border"]) {
      const a = parse(`artifact x
scene
  layer L
    node n
      role: ${role}
`);
      const n = a.scene!.layers[0]!.items[0];
      if (n.kind !== "node") throw new Error("node expected");
      expect(roleToken(n.props.role)).toBe(role);
    }
  });
});
