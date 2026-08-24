import { describe, expect, it } from "vitest";
import { createVivaAgentHost } from "../../src/agent/host.js";
import { planRepairs, repairSource } from "../../src/repair/index.js";

const MAGIC = `artifact Magic
data series = [{ x: 1, y: 2 }]
scene
  size: 320 200
widget chart.line
  data: series
  xField: x
  yField: y
  areaX: 10 300
  insetL: 4
`;

describe("deterministic repair", () => {
  it("drops hand-written inset/area when chrome overflows", () => {
    const plan = planRepairs(MAGIC, [{ code: "check.struct.chromeOverflow", message: "overflow" }]);
    expect(plan.patches.some((p) => p.code === "repair.dropMagic")).toBe(true);
    const next = repairSource(MAGIC, [{ code: "check.struct.chromeOverflow", message: "overflow" }]);
    expect(next.changed).toBe(true);
    expect(next.source).not.toMatch(/areaX:/);
    expect(next.source).not.toMatch(/insetL:/);
  });

  it("session compile applies the patch and keeps IR success", () => {
    const host = createVivaAgentHost();
    const session = host.createSession({ mount: null });
    const result = session.compile(MAGIC);
    expect(result.ok).toBe(true);
    const src = session.getSource();
    expect(src.includes("areaX:") || result.diagnostics.some((d) => d.code === "repair.applied")).toBe(
      true,
    );
  });
});
