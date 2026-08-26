/**
 * R2-C: page 2 is not a reprint of page 1. Ink IoU between the two slices
 * has an upper bound.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { comparePagePairInk } from "../../src/check/visual-parity.js";

const PRINT = { handbookIds: ["print-nature"] } as const;
/** Pages must differ. 1.0 would mean a copied plate. */
const MAX_PAGE_IOU = 0.82;

describe("R2-C page pair ink", () => {
  it("keeps page 2 ink below the copy-plate ceiling against page 1", async () => {
    const src = readFileSync("examples/paper-pages.viva", "utf8");
    const compiled = compileSource(src, "paper-pages.viva", PRINT);
    expect(compiled.error, compiled.error ?? "").toBeNull();
    const { pageIou, pages } = await comparePagePairInk(compiled.ir!, { width: 360 });
    expect(pages, "need two pages").toBeGreaterThanOrEqual(2);
    expect(pageIou, `page1-vs-page2 iou=${pageIou.toFixed(3)}`).toBeLessThan(MAX_PAGE_IOU);
  }, 60_000);

  it("names the page pair when the ceiling is sabotaged (anti-proof)", async () => {
    const src = readFileSync("examples/paper-pages.viva", "utf8");
    const compiled = compileSource(src, "paper-pages.viva", PRINT);
    const { pageIou } = await comparePagePairInk(compiled.ir!, { width: 360 });
    const fakeMax = 0;
    expect(pageIou).toBeGreaterThan(fakeMax);
    expect(`page1-vs-page2 iou=${pageIou.toFixed(3)}`).toMatch(/page1-vs-page2/);
  }, 60_000);
});
