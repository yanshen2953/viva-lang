import { afterEach, describe, expect, it } from "vitest";
import { solveChartInsets } from "../../src/layout/chrome-solve.js";
import {
  MIN_PLOT_FRAC,
  getChromeGrammar,
  placePaperChrome,
  setChromeGrammar,
} from "../../src/layout/chrome-collide.js";

describe("simultaneous chrome insets", () => {
  afterEach(() => {
    setChromeGrammar(null);
  });

  it("grows every side from one residual, past the old 38% cap", () => {
    const insets = solveChartInsets({
      cell: { x0: 0, y0: 0, x1: 100, y1: 80 },
      floor: { l: 8, r: 8, t: 6, b: 8 },
      pad: 2,
      plotFloor: { minFrac: MIN_PLOT_FRAC },
      place: (cur) => ({
        rects: [
          { id: "yTitle", x: -20, y: 20, w: 18, h: 30 },
          { id: "legend-0", x: 100 - cur.r + 12, y: 10, w: 40, h: 20 },
          { id: "title", x: 10, y: -8, w: 40, h: 12 },
          { id: "xTitle", x: 20, y: 80 - cur.b + 10, w: 30, h: 10 },
        ],
      }),
    });
    expect(insets.l).toBeGreaterThan(8);
    expect(insets.t).toBeGreaterThan(6);
    const plotW = 100 - insets.l - insets.r;
    expect(plotW).toBeGreaterThanOrEqual(100 * MIN_PLOT_FRAC - 1);
  });

  it("lets handbook typography drive chrome wrap measure", () => {
    setChromeGrammar({ titleFont: 20, axisFont: 9, tickFont: 8, panelFont: 11, legendFont: 8 });
    expect(getChromeGrammar().titleFont).toBe(20);
    const { chrome } = placePaperChrome(
      { px0: 40, px1: 160, py0: 30, py1: 140 },
      (px) => px,
      false,
      { title: "A fairly long chart title that must wrap" },
      { x0: 0, y0: 0, x1: 200, y1: 160 },
    );
    expect(chrome.titleLineH).toBeGreaterThan(20);
    expect(chrome.titleLines.length).toBeGreaterThan(1);
    setChromeGrammar(null);
    expect(getChromeGrammar().titleFont).toBe(12);
  });
});
