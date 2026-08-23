import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { PAGE_MM } from "../../src/space/scene-box.js";
import { packFigureCellsToPages } from "../../src/layout/figure-page.js";

describe("figure page pack", () => {
  it("pushes a row that would straddle the page knife onto the next page", () => {
    const packed = packFigureCellsToPages(
      [
        { name: "a", cellX0: 0, cellY0: 8, cellW: 80, cellH: 190 },
        { name: "b", cellX0: 0, cellY0: 202, cellW: 80, cellH: 190 },
      ],
      { pageH: 297, topReserve: 6, bottomReserve: 5 },
    );
    expect(packed.cells[0]!.cellY0).toBeCloseTo(8);
    expect(packed.cells[0]!.cellY0 + packed.cells[0]!.cellH).toBeLessThanOrEqual(297 - 5);
    expect(packed.cells[1]!.cellY0).toBeGreaterThanOrEqual(297 + 6);
    expect(packed.cells[1]!.cellY0 + packed.cells[1]!.cellH).toBeLessThanOrEqual(594 - 5);
    expect(packed.bottom).toBeGreaterThan(297);
  });

  it("leaves a 2x2 that already fits one page where it is", () => {
    const packed = packFigureCellsToPages(
      [
        { name: "a", cellX0: 0, cellY0: 8, cellW: 40, cellH: 120 },
        { name: "b", cellX0: 44, cellY0: 8, cellW: 40, cellH: 120 },
        { name: "c", cellX0: 0, cellY0: 132, cellW: 40, cellH: 120 },
        { name: "d", cellX0: 44, cellY0: 132, cellW: 40, cellH: 120 },
      ],
      { pageH: 297, topReserve: 6, bottomReserve: 5 },
    );
    expect(packed.cells.map((c) => c.cellY0)).toEqual([8, 8, 132, 132]);
    expect(packed.bottom).toBeCloseTo(252);
  });

  it("keeps paper-pages panels entirely on one A4 slice each", () => {
    const src = readFileSync("examples/paper-pages.viva", "utf8");
    const result = compileSource(src, "paper-pages.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const pageH = PAGE_MM.a4.h;
    const scopes = [result.ir!.state, result.ir!.data];
    const a = evaluate(result.ir!.frames.find((f) => f.name === "a")!.props.cellY!, scopes) as [
      number,
      number,
    ];
    const b = evaluate(result.ir!.frames.find((f) => f.name === "b")!.props.cellY!, scopes) as [
      number,
      number,
    ];
    expect(a[1]).toBeLessThanOrEqual(pageH - 4);
    expect(b[0]).toBeGreaterThanOrEqual(pageH);
    expect(b[1]).toBeLessThanOrEqual(pageH * 2 - 4);
    const height = evaluate(result.ir!.scene.props.height!, scopes) as number;
    expect(height).toBeGreaterThan(pageH);
    expect(b[1]).toBeLessThanOrEqual(height + 1e-6);
  });
});
