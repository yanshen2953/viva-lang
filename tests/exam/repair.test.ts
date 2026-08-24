import { describe, expect, it } from "vitest";
import { createVivaAgentHost } from "../../src/agent/host.js";
import { planRepairs, repairSource } from "../../src/repair/index.js";
import { compileSource } from "../../src/pipeline.js";

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
    expect(next.source).toMatch(/title: "到站件"/);
    expect(next.source).toMatch(/widget layout\.board/);
    expect(next.source).toMatch(/title: "到站件 · 双栏"/);
    expect(next.source).not.toMatch(/^frame 到站件/m);
  });

  it("quotes CJK, drops lone dots, and folds YAML so a model dump compiles", () => {
    const src = `artifact Dump
更不要写说明
.
data rows: [{ t: 1, score: 12, arm: 对照 }]
unit: mm
scene:
  page: a4
  column: double
.layout.board
  title: 到站件
  beats: 4
  play: true
widget layout.figure
  panel: body
  cols: 2
  title 同一栏
chart.scatter
  panel: a
  data: rows
  xField: t
  yField: score
  xLabel: 时间
event drag on rows
  rows.t = __event.x
`;
    const next = repairSource(src, [{ message: "unexpected character" }]);
    expect(next.source).not.toMatch(/^更/m);
    expect(next.source).not.toMatch(/^\s*\.\s*$/m);
    expect(next.source).toMatch(/^scene$/m);
    expect(next.source).toMatch(/^  unit: mm$/m);
    expect(next.source).toMatch(/title: "到站件"/);
    expect(next.source).toMatch(/arm: "对照"/);
    expect(next.source).toMatch(/xLabel: "时间"/);
    expect(next.source).toMatch(/widget layout\.board/);
    expect(next.source).toMatch(/widget chart\.scatter/);
    const compiled = compileSource(next.source, "repair-dump.viva", { handbookIds: ["print-nature"] });
    expect(compiled.error, compiled.error ?? "").toBeNull();
    expect(compiled.ir).toBeTruthy();
  });

  it("keeps array closers and strips invented brush/timeline from a live model dump", () => {
    const src = `artifact "到站件"
data rows = [
  { t: 1, score: 12, arm: "对照" }
]
data tokens = [{ id: "p1", x: 24, y: 36 }]
scene
  unit: mm
  page: a4
  column: double
  height: 400
  layer world
    for token in tokens
      node token as tokens
        x: token.x
        y: token.y
        r: 3
        drag: true
        solid: true
widget layout.board
  title: "到站件"
  beats: 4
  play: true
widget layout.figure
  panel: body
  cols: 2
widget chart.scatter
  panel: a
  data: rows
  xField: t
  yField: score
widget chart.violin
  panel: c
  span: 2
  data: rows
  xField: arm
  yField: score
event drag on tokens
  token.x = __event.x
  token.y = __event.y
event brush on chart.scatter
  __sel.keys = ["arm"]
timeline
  beat 1
    widget chart.scatter
      opacity: 0.8
`;
    const next = repairSource(src, [{ message: "expected declaration, got '.'" }]);
    expect(next.source).toMatch(/^\]$/m);
    expect(next.source).not.toMatch(/event brush/);
    expect(next.source).not.toMatch(/^timeline$/m);
    expect(next.source).not.toMatch(/^\s+beat /m);
    const compiled = compileSource(next.source, "live-dump.viva", { handbookIds: ["print-nature"] });
    expect(compiled.error, compiled.error ?? "").toBeNull();
    expect(compiled.ir?.timeline?.beats).toBeGreaterThanOrEqual(4);
    expect(compiled.ir?.events.some((e) => e.type === "drag")).toBe(true);
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
