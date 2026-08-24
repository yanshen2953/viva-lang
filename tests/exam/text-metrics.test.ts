import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { measureText } from "../../src/metrics/text.js";
import { estimateTextWidthPx } from "../../src/layout/chrome-collide.js";
import { missingGlyphsInFont } from "../../src/metrics/glyphs.js";
import { bundledCjkFontPath } from "../../src/export/pdf-font.js";

const SAMPLES: { text: string; size: number }[] = [
  { text: "Response", size: 9 },
  { text: "Sum score", size: 9 },
  { text: "Visit", size: 8 },
  { text: "WWWWWWWW", size: 8 },
  { text: "iiiiiiii", size: 8 },
  { text: "0.25", size: 8 },
  { text: "Time (week)", size: 9 },
  { text: "心率 (次每分)", size: 9 },
];

describe("shared text metrics", () => {
  it("matches Helvetica AFM for Latin and stays within 8% of PDF width", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    for (const { text, size } of SAMPLES) {
      const latin = [...text].filter((ch) => (ch.codePointAt(0) ?? 0) <= 0xff).join("");
      if (!latin) continue;
      const predicted = measureText(latin, size);
      const pdfW = font.widthOfTextAtSize(latin, size);
      expect(Math.abs(predicted - pdfW) / pdfW, latin).toBeLessThan(0.08);
    }
  });

  it("no longer uses the 0.58 em Latin heuristic", () => {
    expect(estimateTextWidthPx("iiiiiiii", 8)).toBeCloseTo(measureText("iiiiiiii", 8));
    expect(estimateTextWidthPx("WWWWWWWW", 8)).toBeGreaterThan(estimateTextWidthPx("iiiiiiii", 8) * 2);
    expect(estimateTextWidthPx("iiiiiiii", 8)).toBeLessThan(8 * 0.58 * 8 * 0.7);
  });

  it("treats CJK as 1 em and mixed strings as AFM + em", () => {
    expect(measureText("心", 9)).toBeCloseTo(9);
    const mixed = measureText("心率 (次每分)", 9);
    expect(mixed).toBeGreaterThan(9 * 4);
    expect(mixed).toBeLessThan(9 * 10);
  });

  it("reports unmapped glyphs via cmap, not width exceptions", () => {
    const path = bundledCjkFontPath();
    expect(path).toBeTruthy();
    expect(missingGlyphsInFont(path, "心率时间")).toEqual([]);
    const missing = missingGlyphsInFont(path, "心率😀");
    expect(missing.join("")).toMatch(/😀/);
  });
});
