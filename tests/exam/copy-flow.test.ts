import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { packCopyLinesToColumns, packCopyLinesToPages, readableTypeColCount } from "../../src/layout/copy-flow.js";
import { PAGE_MM } from "../../src/space/scene-box.js";
import { exportArtifact } from "../../src/export/index.js";
import { PDFDocument } from "pdf-lib";

describe("copy flow across a page knife", () => {
  it("hops a line that would straddle the knife onto the next page", () => {
    const packed = packCopyLinesToPages(["keep", "hop"], {
      x: 13.5,
      startY: 284,
      lineH: 5,
      pageH: 297,
      topReserve: 6,
      bottomReserve: 5,
    });
    expect(packed.places[0]!.y + 5).toBeLessThanOrEqual(297 - 5);
    expect(packed.places[1]!.y).toBeGreaterThanOrEqual(297 + 6);
    expect(packed.places[1]!.page).toBe(1);
    expect(packed.clipped).toBe(false);
  });

  it("stops at the host bottom when there is no page", () => {
    const packed = packCopyLinesToPages(["a", "b", "c", "d"], {
      x: 0,
      startY: 10,
      lineH: 20,
      hostBottom: 48,
    });
    expect(packed.places).toHaveLength(1);
    expect(packed.clipped).toBe(true);
    expect(packed.places[0]!.y + 20).toBeLessThanOrEqual(48);
  });

  it("flows paper-prose off the A4 knife inside the 89 mm column", async () => {
    const src = readFileSync("examples/paper-prose.viva", "utf8");
    expect(src).not.toMatch(/^\s+(insetL|areaX|y:)/m);
    const result = compileSource(src, "paper-prose.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const scopes = [result.ir!.state, result.ir!.data];
    const copy = result.ir!.scene.layers.find((l) => l.name === "__board_copy")!;
    const bodies = copy.items.filter((i) => i.kind === "node" && /^board_docBody/.test(i.name));
    expect(bodies.length).toBeGreaterThan(8);
    const pageH = PAGE_MM.a4.h;
    const ys = bodies.map((item) => {
      if (item.kind !== "node") return 0;
      return Number(evaluate(item.props.y, scopes));
    });
    const xs = bodies.map((item) => {
      if (item.kind !== "node") return 0;
      return Number(evaluate(item.props.x, scopes));
    });
    expect(Math.max(...ys)).toBeGreaterThan(pageH);
    expect(ys.some((y) => y >= pageH - 5 && y < pageH + 6)).toBe(false);
    expect(Math.min(...xs)).toBeGreaterThan(10);
    expect(Math.max(...xs)).toBeLessThan(30);
    const height = evaluate(result.ir!.scene.props.height!, scopes) as number;
    expect(height).toBeGreaterThan(pageH);
    const pdf = await exportArtifact(src, "pdf", { handbookIds: ["print-nature"] }, "paper-prose.viva");
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(doc.getPage(0)!.getSize().width).toBeGreaterThan(500);
    const folio = result.ir!.scene.layers.find((l) => l.name === "__page_folio")!;
    const folioTexts = folio.items
      .filter((i) => i.kind === "node")
      .map((i) => (i.kind === "node" ? String(evaluate(i.props.text, scopes)) : ""));
    expect(folioTexts[0]).toMatch(/^1 \/ \d+$/);
    expect(folioTexts.some((t) => /^2 \/ \d+$/.test(t))).toBe(true);
    expect(folioTexts).toContain("89 mm prose on an A4 sheet");
    expect(folioTexts.some((t) => /\(continued\)/.test(t))).toBe(false);
  });

  it("counts a 12-col type grid as three readable prose measures", () => {
    expect(readableTypeColCount(12)).toBe(3);
    expect(readableTypeColCount(6)).toBe(2);
    expect(readableTypeColCount(3)).toBe(3);
    expect(readableTypeColCount(2)).toBe(2);
  });

  it("fills type columns top-to-bottom then left-to-right", () => {
    const packed = packCopyLinesToColumns(["a", "b", "c", "d", "e"], [
      { x: 10, y0: 0, y1: 40 },
      { x: 80, y0: 0, y1: 40 },
    ], { lineH: 20 });
    expect(packed.places.map((p) => [p.text, p.x, p.y])).toEqual([
      ["a", 10, 0],
      ["b", 10, 20],
      ["c", 80, 0],
      ["d", 80, 20],
    ]);
    expect(packed.clipped).toBe(true);
  });

  it("wraps typeGrid body to a readable measure instead of the full 12-col width", () => {
    const result = compileSource(
      readFileSync("examples/board-typegrid.viva", "utf8"),
      "typegrid-body.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const scopes = [result.ir!.state, result.ir!.data];
    const copy = result.ir!.scene.layers.find((l) => l.name === "__board_copy")!;
    const bodies = copy.items.filter((i) => i.kind === "node" && /^board_docBody/.test(i.name));
    expect(bodies.length).toBeGreaterThan(4);
    const first = bodies[0];
    expect(first?.kind).toBe("node");
    if (first?.kind === "node") {
      const w = Number(evaluate(first.props.w, scopes));
      const safe = result.ir!.frames.find((f) => f.name === "safe")!;
      const sx = evaluate(safe.props.x, scopes) as number[];
      const safeW = sx[1]! - sx[0]!;
      expect(w).toBeGreaterThan(safeW / 4);
      expect(w).toBeLessThan(safeW / 2);
    }
  });

  it("pours a short typeGrid board into the next readable column", () => {
    const result = compileSource(
      `artifact ShortGrid
scene
  size: 720 200
  background: #ffffff
widget layout.board
  title: "Type columns"
  body: "The compiler fills the first readable measure then the next. A coding agent keeps writing sentences until the first column is full and the leftover lines start in the following measure. 十二栏参考线仍在，正文按可读栏宽从左栏流到右栏，不写魔法数 x。"
  typeGrid: true
  typeGridStep: 8
  typeGridCols: 12
  guides: false
`,
      "short-typegrid.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const scopes = [result.ir!.state, result.ir!.data];
    const copy = result.ir!.scene.layers.find((l) => l.name === "__board_copy")!;
    const bodies = copy.items.filter((i) => i.kind === "node" && /^board_docBody/.test(i.name));
    const xs = [
      ...new Set(
        bodies.map((item) => (item.kind === "node" ? Number(evaluate(item.props.x, scopes)) : 0)),
      ),
    ].sort((a, b) => a - b);
    expect(xs.length).toBeGreaterThanOrEqual(2);
    expect(xs[1]! - xs[0]!).toBeGreaterThan(120);
  });

  it("keeps a screen board body inside the left slot", () => {
    const result = compileSource(
      `artifact ClipBoard
scene
  size: 640 200
widget layout.board
  title: "Board"
  body: "This sentence is long enough that wrapping it into the left column of a short board would overflow the figure slot unless the compiler stops at the host bottom and does not keep painting twenty-pixel steps into the lower band."
  splits: 2
  guides: false
`,
      "clip-board.viva",
    );
    expect(result.error).toBeNull();
    const scopes = [result.ir!.state, result.ir!.data];
    const leftY = evaluate(result.ir!.frames.find((f) => f.name === "left")!.props.y, scopes) as [
      number,
      number,
    ];
    const copy = result.ir!.scene.layers.find((l) => l.name === "__board_copy")!;
    const bodies = copy.items.filter((i) => i.kind === "node" && /^board_docBody/.test(i.name));
    expect(bodies.length).toBeGreaterThan(0);
    for (const item of bodies) {
      if (item.kind !== "node") continue;
      const y = Number(evaluate(item.props.y, scopes));
      expect(y).toBeLessThanOrEqual(leftY[1]!);
    }
  });
});
