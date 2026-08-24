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

  it("binds declared data and axis labels for empty / axis notes", () => {
    const empty = `artifact Empty
data series = [{ x: 1, y: 2 }]
scene
  size: 240 160
widget chart.line
  xField: x
  yField: y
`;
    const bound = repairSource(empty, [{ code: "check.visual.emptyPanel", message: "empty panel" }]);
    expect(bound.changed).toBe(true);
    expect(bound.source).toMatch(/data: series/);
    const axis = repairSource(empty, [{ code: "check.struct.axis", message: "axis ticks" }]);
    expect(axis.source).toMatch(/xLabel: x/);
    expect(axis.source).toMatch(/yLabel: y/);
  });

  it("inserts colons on widget props and rewrites a titled frame", () => {
    const src = `artifact Fold
scene
  unit: mm
widget layout.board
  title 到站件
frame 到站件 · 双栏
`;
    const next = repairSource(src, [{ message: "expected COLON" }]);
    expect(next.source).toMatch(/title: 到站件/);
    expect(next.source).toMatch(/widget layout\.board/);
    expect(next.source).toMatch(/title: "到站件 · 双栏"/);
    expect(next.source).not.toMatch(/^frame 到站件/m);
  });

  it("folds top-level unit/column/page under scene", () => {
    const src = `artifact Fold
data rows = [{ x: 1, y: 2 }]
unit: mm
column: double
scene
  page: a4
widget chart.scatter
  data: rows
  xField: x
  yField: y
`;
    const next = repairSource(src, [{ message: "expected declaration, got 'unit'" }]);
    expect(next.changed).toBe(true);
    expect(next.source).not.toMatch(/^unit:/m);
    expect(next.source).toMatch(/^scene$/m);
    expect(next.source).toMatch(/^  unit: mm$/m);
    expect(next.source).toMatch(/^  column: double$/m);
    expect(next.source).toMatch(/^  page: a4$/m);
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
