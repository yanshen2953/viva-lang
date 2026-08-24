import { describe, expect, it } from "vitest";
import { hopFiguresPastCopy, punchColumnsAroundFigures } from "../../src/layout/newspaper.js";
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
