import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { COLUMN_MM, PAGE_MM, pageColumnMeasure } from "../../src/space/scene-box.js";
import { packFigureCellsToPages } from "../../src/layout/figure-page.js";

describe("figure page pack", () => {
  it("treats column as a measure on the page, not the page width", () => {
    const single = pageColumnMeasure({ name: "a4", ...PAGE_MM.a4 }, "single");
    const dbl = pageColumnMeasure({ name: "a4", ...PAGE_MM.a4 }, "double");
    expect(single).toEqual({ x: (PAGE_MM.a4.w - COLUMN_MM.double) / 2, w: COLUMN_MM.single });
    expect(dbl).toEqual({ x: (PAGE_MM.a4.w - COLUMN_MM.double) / 2, w: COLUMN_MM.double });
    expect(pageColumnMeasure(undefined, "single")).toBeNull();
  });

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
    const cellX = evaluate(result.ir!.frames.find((f) => f.name === "a")!.props.cellX!, scopes) as [
      number,
      number,
    ];
    expect(cellX[0]).toBeGreaterThan(10);
    expect(cellX[1] - cellX[0]).toBeLessThan(95);
    expect(cellX[1]).toBeLessThan(110);
  });

  it("parks a double-column figure in the 183 mm text block of an A4 page", () => {
    const src = readFileSync("examples/paper-spread.viva", "utf8");
    expect(src).not.toMatch(/areaX|areaY|insetL/);
    const result = compileSource(src, "paper-spread.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const scopes = [result.ir!.state, result.ir!.data];
    const a = evaluate(result.ir!.frames.find((f) => f.name === "a")!.props.cellX!, scopes) as [
      number,
      number,
    ];
    const b = evaluate(result.ir!.frames.find((f) => f.name === "b")!.props.cellX!, scopes) as [
      number,
      number,
    ];
    expect(a[0]).toBeGreaterThan(10);
    expect(b[1]).toBeLessThanOrEqual(13.5 + 183 + 1);
    expect(b[0]).toBeGreaterThan(a[1]!);
    expect(b[1] - a[0]).toBeGreaterThan(160);
    expect(b[1] - a[0]).toBeLessThan(186);
  });

  it("hops a right-slot figure row off the A4 knife", () => {
    const src = readFileSync("examples/paper-board-linked.viva", "utf8");
    const result = compileSource(src, "paper-board-linked.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const scopes = [result.ir!.state, result.ir!.data];
    const a = evaluate(result.ir!.frames.find((f) => f.name === "a")!.props.cellY!, scopes) as [
      number,
      number,
    ];
    const b = evaluate(result.ir!.frames.find((f) => f.name === "b")!.props.cellY!, scopes) as [
      number,
      number,
    ];
    expect(a[1]).toBeLessThanOrEqual(PAGE_MM.a4.h - 4);
    expect(b[0]).toBeGreaterThanOrEqual(PAGE_MM.a4.h);
    expect(b[1]).toBeLessThanOrEqual(PAGE_MM.a4.h * 2);
  });
});
