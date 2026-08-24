import { describe, expect, it } from "vitest";
import { solveChartInsets } from "../../src/layout/chrome-solve.js";
import { MIN_PLOT_FRAC } from "../../src/layout/chrome-collide.js";

describe("simultaneous chrome insets", () => {
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
});
