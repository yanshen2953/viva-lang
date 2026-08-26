/**
 * R2-B: strings drawn in the PDF equal the source strings.
 * missingGlyphs=[] is not enough.
 */
import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { renderVectorPdfFromIr } from "../../src/export/vector-pdf.js";
import { extractPdfStrings, pdfHaystack } from "../../src/export/pdf-text.js";

const PRINT = { handbookIds: ["print-nature"] } as const;

const STRINGS = ["Visit", "Time (week)", "心率 (次每分)", "AURORA INDEX", "夜港 HARBOR"];

const SRC = `artifact Text
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  size: 360 220
  background: #ffffff
  layer ink
    node a
      x: 20
      y: 28
      text: "Visit"
      font: 9
    node b
      x: 20
      y: 48
      text: "Time (week)"
      font: 9
    node c
      x: 20
      y: 68
      text: "心率 (次每分)"
      font: 9
    node d
      x: 20
      y: 88
      text: "AURORA INDEX"
      font: 10
    node e
      x: 20
      y: 112
      text: "夜港 HARBOR"
      font: 12
widget chart.line
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  interactive: false
`;

describe("R2-B PDF text extract", () => {
  it("extracts every source string from the vector PDF", async () => {
    const compiled = compileSource(SRC, "pdf-text.viva", PRINT);
    expect(compiled.error, compiled.error ?? "").toBeNull();
    const bytes = await renderVectorPdfFromIr(compiled.ir!);
    const found = extractPdfStrings(bytes);
    const hay = pdfHaystack(bytes);
    const missing = STRINGS.filter((s) => !hay.includes(s));
    expect(missing, `missing ${missing.join(" | ")} hay=${JSON.stringify(hay.slice(0, 80))} tokens=${found.slice(0, 12).join("|")}`).toEqual([]);
  }, 20_000);

  it("names the string when extract is empty (anti-proof)", async () => {
    const compiled = compileSource(SRC, "pdf-text-anti.viva", PRINT);
    const bytes = await renderVectorPdfFromIr(compiled.ir!);
    const found = extractPdfStrings(bytes);
    const fake = "THIS_STRING_IS_NOT_IN_THE_PDF";
    expect(found.join("\n").includes(fake)).toBe(false);
    expect(`missing ${fake}`).toContain(fake);
  });
});
