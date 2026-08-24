import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { attachHotPathVisual } from "../../src/check/index.js";
import { bundledCjkFontPath, resolveCjkFontPath } from "../../src/export/pdf-font.js";
import { statSync } from "node:fs";

const BLANK = `artifact "Blank"
scene
  background: #ffffff
  layer a
    node t
      x: 10
      y: 10
      text: "ok"
`;

const INKED = `artifact "Inked"
data series = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  background: #ffffff
widget chart.scatter
  data: series
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
`;

describe("visual blocks IR success", () => {
  it("fails compile success when raster visual sees a blank scene", async () => {
    const result = compileSource(BLANK, "blank.viva", { check: { structural: true } });
    expect(result.ir).toBeTruthy();
    const attached = await attachHotPathVisual(result, { source: BLANK });
    expect(attached.visualOk).toBe(false);
    expect(attached.success).toBe(false);
    expect(attached.diagnostics.some((d) => String(d.code ?? "").startsWith("check.visual."))).toBe(
      true,
    );
  });

  it("keeps success when a chart has marks", async () => {
    const result = compileSource(INKED, "inked.viva", { check: { structural: true } });
    expect(result.success).toBe(true);
    const attached = await attachHotPathVisual(result, { source: INKED });
    expect(attached.visualOk).toBe(true);
    expect(attached.success).toBe(true);
  });
});

describe("bundled CJK library", () => {
  it("ships a full packaged font, not only the leftover subset", () => {
    const bundled = bundledCjkFontPath();
    expect(bundled).toBeTruthy();
    expect(bundled).toMatch(/VivaSansCJK\.ttf$/);
    expect(statSync(bundled!).size).toBeGreaterThan(1_000_000);
    const resolved = resolveCjkFontPath();
    expect(resolved).toBeTruthy();
  });
});
