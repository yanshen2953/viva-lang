import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { packCopyLinesToPages } from "../../src/layout/copy-flow.js";
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
