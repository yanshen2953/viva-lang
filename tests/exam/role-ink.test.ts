/**
 * R2-A: per-role SVG vs PDF ink IoU. Whole-page 0.90 is a floor, not a
 * substitute for axis titles / colorbar / violin / dash / rotate.
 */
import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { compareRoleInk, pdftoppmAvailable } from "../../src/check/visual-parity.js";

const PRINT = { handbookIds: ["print-nature"] } as const;

const FIXTURES: {
  role: string;
  minIou: number;
  src: string;
  match: RegExp;
}[] = [
  {
    role: "axis-title",
    minIou: 0.55,
    match: /_yTitle|_xTitle/,
    src: `artifact Axis
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  size: 320 220
  background: #ffffff
widget chart.line
  data: rows
  xField: x
  yField: y
  xLabel: Time (week)
  yLabel: Response
  xlim: 0 3
  ylim: 0 5
  interactive: false
`,
  },
  {
    role: "colorbar",
    minIou: 0.55,
    match: /cbarTitle|cbarLbl|_cbar/,
    src: `artifact Bar
data cells = [{ x: 0, y: 0, z: 1 }, { x: 1, y: 0, z: 3 }, { x: 0, y: 1, z: 2 }, { x: 1, y: 1, z: 4 }]
scene
  size: 320 220
  background: #ffffff
widget chart.heatmap
  data: cells
  xField: x
  yField: y
  zField: z
  zLabel: "AURORA INDEX"
  xlim: -0.5 1.5
  ylim: -0.5 1.5
  zlim: 0 4
  interactive: false
`,
  },
  {
    role: "violin",
    minIou: 0.5,
    match: /violin|density|_marks/,
    src: `artifact Violin
data rows = [{ x: 1, y: 2 }, { x: 1, y: 3 }, { x: 1, y: 4 }, { x: 2, y: 1 }, { x: 2, y: 5 }]
scene
  size: 320 220
  background: #ffffff
widget chart.violin
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 6
  interactive: false
`,
  },
  {
    role: "dash",
    minIou: 0.5,
    match: /grid|dash|_xGrid|_yGrid/,
    src: `artifact Dash
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  size: 280 180
  background: #ffffff
widget chart.scatter
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  interactive: false
`,
  },
  {
    role: "rotate",
    minIou: 0.5,
    match: /_yTitle/,
    src: `artifact Rotate
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  size: 280 180
  background: #ffffff
widget chart.line
  data: rows
  xField: x
  yField: y
  yLabel: Response
  xlim: 0 3
  ylim: 0 5
  interactive: false
`,
  },
];

describe("R2-A role ink IoU", () => {
  it("keeps each chrome role above its own SVG/PDF ink floor", async ({ skip }) => {
    if (!pdftoppmAvailable()) skip();
    const bad: string[] = [];
    for (const fixture of FIXTURES) {
      const compiled = compileSource(fixture.src, `${fixture.role}.viva`, PRINT);
      expect(compiled.error, `${fixture.role}: ${compiled.error ?? ""}`).toBeNull();
      const reports = await compareRoleInk(compiled.ir!, [{ role: fixture.role, match: fixture.match }], {
        width: 400,
      });
      const row = reports[0]!;
      if (!row.names.length || row.inkIou < fixture.minIou) {
        bad.push(`${fixture.role}: iou=${row.inkIou.toFixed(3)} names=${row.names.join(",")}`);
      }
    }
    expect(bad, bad.join("\n")).toEqual([]);
  }, 120_000);

  it("names the role when the threshold is sabotaged (anti-proof)", async ({ skip }) => {
    if (!pdftoppmAvailable()) skip();
    const fixture = FIXTURES[0]!;
    const compiled = compileSource(fixture.src, "axis-anti.viva", PRINT);
    const reports = await compareRoleInk(compiled.ir!, [{ role: fixture.role, match: fixture.match }], {
      width: 400,
    });
    const row = reports[0]!;
    expect(row.names.length).toBeGreaterThan(0);
    const fakeMin = 0.999;
    if (row.inkIou < fakeMin) {
      expect(`${fixture.role}: iou=${row.inkIou.toFixed(3)}`).toContain(fixture.role);
    } else {
      expect(row.inkIou).toBeLessThan(fakeMin);
    }
  }, 60_000);
});
