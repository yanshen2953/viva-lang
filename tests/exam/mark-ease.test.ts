import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { MARK_EASE_MS, markPaintState } from "../../src/runtime/mark-ease.js";
import { exportArtifact } from "../../src/export/index.js";

describe("runtime mark ease and paper raster background", () => {
  it("keeps hidden marks painted at opacity 0 so they can fade", () => {
    const shown = markPaintState(true, 0.4);
    expect(shown.opacity).toBe(0.4);
    expect(shown.hideAfterMs).toBeNull();
    expect(shown.pointerEvents).toBe("");
    const hidden = markPaintState(false, 1);
    expect(hidden.opacity).toBe(0);
    expect(hidden.hideAfterMs).toBe(MARK_EASE_MS);
    expect(hidden.pointerEvents).toBe("none");
  });

  it("fills print-nature PNG corners with the scene background, not a hole", async () => {
    const src = readFileSync("examples/paper-cjk.viva", "utf8");
    const png = await exportArtifact(
      src,
      "png",
      { width: 336, handbookIds: ["print-nature"] },
      "paper-cjk.viva",
    );
    const { data, info } = await sharp(Buffer.from(png.bytes))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
    const corner = (x: number, y: number) => {
      const i = (y * info.width! + x) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    };
    for (const [r, g, b, a] of [corner(0, 0), corner(info.width! - 1, 0)]) {
      expect(a).toBe(255);
      expect(r).toBeGreaterThan(240);
      expect(g).toBeGreaterThan(240);
      expect(b).toBeGreaterThan(240);
    }
  }, 30_000);
});
