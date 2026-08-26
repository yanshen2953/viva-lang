import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";

/**
 * A figure cuts cells for the charts that follow it. An author `role: plot`
 * node asking for a cell is a claim too, so the cell must still exist.
 */
describe("figure panel ownership", () => {
  it("cuts a cell for an author plot node with no chart of its own", () => {
    const src = readFileSync("examples/science-studio.viva", "utf8");
    const result = compileSource(src, "science-studio.viva");
    expect(result.error).toBeNull();
    const names = result.ir!.frames.map((f) => f.name);
    for (const cell of ["a", "b", "c", "d"]) {
      expect(names, `cell ${cell}`).toContain(cell);
    }
    expect(names).toContain("pcaPlotBg");
  });

  it("keeps the first figure from stealing cells a later figure needs", () => {
    const src = `artifact "TwoFigures"

data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]

scene
  size: 900 600
  background: #ffffff

widget layout.figure
  cols: 2
  rows: 1

widget chart.line
  panel: a
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5

widget chart.scatter
  panel: b
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
`;
    const result = compileSource(src, "two.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const names = result.ir!.frames.map((f) => f.name);
    expect(names).toContain("a");
    expect(names).toContain("b");
  });

  it("does not invent cells for board slots named in author nodes", () => {
    const src = `artifact "BoardSlot"

data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]

scene
  size: 900 600
  background: #ffffff

  layer notes
    node sideNote
      role: panel
      panel: left
      text: "note"

widget layout.board
  title: "Slots"
  splits: 2

widget layout.figure
  panel: right
  cols: 1
  rows: 1

widget chart.line
  panel: a
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
`;
    const result = compileSource(src, "slot.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const names = result.ir!.frames.map((f) => f.name);
    expect(names).toContain("a");
    expect(names.filter((n) => n === "left")).toHaveLength(1);
  });
});
