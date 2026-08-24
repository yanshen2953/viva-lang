import { describe, expect, it } from "vitest";
import {
  composeNewspaper,
  hopFiguresPastCopy,
  newspaperMeasure,
  punchColumnsAroundFigures,
  snapFigureToMeasure,
} from "../../src/layout/newspaper.js";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";

describe("newspaper flow", () => {
  it("punches column holes around figure cells", () => {
    const cols = punchColumnsAroundFigures(
      [{ x: 10, y0: 0, y1: 200, w: 80 }],
      [{ x0: 10, y0: 60, x1: 90, y1: 120 }],
      4,
    );
    expect(cols.length).toBe(2);
    expect(cols[0]!.y1).toBeLessThanOrEqual(60);
    expect(cols[1]!.y0).toBeGreaterThanOrEqual(120);
  });

  it("hops a figure that sits on packed copy", () => {
    const next = hopFiguresPastCopy(
      [{ x0: 10, y0: 40, x1: 80, y1: 90 }],
      [{ x: 12, y: 50 }],
      { gap: 4, lineH: 6 },
    );
    expect(next[0]!.y0).toBeGreaterThan(50);
  });

  it("snaps a figure onto the column measure and repacks body after hop", () => {
    const measure = newspaperMeasure({
      pageW: 210,
      pageH: 297,
      column: "double",
      cols: 2,
      bodyX: 13.5,
      bodyW: 89,
      topReserve: 6,
      bottomReserve: 5,
      gap: 4,
    });
    expect(measure.colW).toBeCloseTo(89, 0);
    const fig = snapFigureToMeasure({ x0: 20, y0: 40, x1: 70, y1: 90 }, measure);
    expect(fig.x0).toBeCloseTo(measure.x, 0);
    expect(fig.x1 - fig.x0).toBeCloseTo(measure.colW, 0);
    const composed = composeNewspaper(
      ["one", "two", "three", "four"],
      [{ x0: 16, y0: 8, x1: 60, y1: 40 }],
      [
        { x: measure.x, y0: 6, y1: 297, w: measure.colW },
        { x: measure.x + measure.colW + measure.gutter, y0: 6, y1: 297, w: measure.colW },
      ],
      measure,
      { lineH: 6 },
    );
    expect(composed.figures[0]!.x0).toBeCloseTo(measure.x, 0);
    expect(composed.places.length).toBe(4);
    expect(composed.places.every((p) => p.y + 6 <= composed.figures[0]!.y0 - measure.gap + 1e-6 || p.y >= composed.figures[0]!.y1 + measure.gap - 1e-6 || p.x > composed.figures[0]!.x1)).toBe(
      true,
    );
  });

  it("paints jump folio and chapter marks from subtitle", () => {
    const src = `artifact News
scene
  unit: mm
  page: a4
  height: 600
  background: #ffffff
widget layout.figure
  title: "Results"
  subtitle: "§2 cohort"
  cols: 1
  rows: 1
`;
    const result = compileSource(src, "news.viva");
    expect(result.error).toBeNull();
    const folio = result.ir!.scene.layers.find((l) => l.name === "__page_folio")!;
    const names = folio.items.filter((i) => i.kind === "node").map((i) => (i.kind === "node" ? i.name : ""));
    expect(names.some((n) => n.startsWith("__page_jump_"))).toBe(true);
    expect(names.some((n) => n.startsWith("__page_chapter_"))).toBe(true);
    const chapter = folio.items.find((i) => i.kind === "node" && i.name === "__page_chapter_1");
    expect(chapter?.kind).toBe("node");
    if (chapter?.kind === "node") {
      expect(String(evaluate(chapter.props.text!, [{}]))).toMatch(/cohort/);
    }
  });
});
