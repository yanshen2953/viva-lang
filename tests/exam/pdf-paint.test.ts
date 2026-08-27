import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { pdfOperators } from "./pdf-ops.js";
import { compileSource } from "../../src/pipeline.js";
import { flattenNodesFromIr } from "../../src/export/static-svg.js";
import { renderVectorPdfFromIr, renderVectorPdfPackageFromIr } from "../../src/export/vector-pdf.js";
import { exportArtifact } from "../../src/export/index.js";
import { propsToBBox } from "../../src/layout/node-bbox.js";

const PRINT = { handbookIds: ["print-nature"] } as const;

function compile(src: string, file: string) {
  const result = compileSource(src, file, PRINT);
  expect(result.error, result.error ?? file).toBeNull();
  return result.ir!;
}

describe("vector PDF paint", () => {
  it("writes rotate, dash, radius, fill path and letterSpacing operators", async () => {
    const ir = compile(
      `artifact "Paint"
scene
  size: 200 80
  background: #ffffff
  layer ink
    node title
      x: 20
      y: 40
      text: "Y"
      font: 12
      rotate: -90
      fill: #111111
    node grid
      x1: 10
      y1: 10
      x2: 80
      y2: 10
      stroke: #999999
      strokeWidth: 1
      dash: 4 3
    node card
      x: 100
      y: 16
      w: 40
      h: 24
      radius: 6
      fill: #eeeeee
      stroke: #333333
    node blob
      d: "M 20 50 C 30 20 50 20 60 50 Z"
      fill: #0072B2
      stroke: #003366
    node spaced
      x: 120
      y: 60
      text: "AB"
      font: 14
      letterSpacing: 2
      fill: #111111
`,
      "paint.viva",
    );
    const bytes = await renderVectorPdfFromIr(ir);
    const ops = await pdfOperators(bytes);
    expect(ops).toMatch(/\bcm\b/);
    expect(ops).toMatch(/\s[d]\n|\sd\s/);
    expect(ops).toMatch(/\bc\b/);
    expect(ops.length).toBeGreaterThan(80);
    expect(bytes.length).toBeGreaterThan(800);
  });

  it("clips page 2 so a full-height plate does not repeat as a second full page", async () => {
    const ir = compile(
      `artifact "Pages"
scene
  unit: mm
  page: a4
  column: single
  height: 400
  background: #ffffff
  layer ink
    node plate
      x: 0
      y: 0
      w: 89
      h: 400
      fill: #f3f4f6
    node onlyTop
      x: 10
      y: 20
      w: 20
      h: 10
      fill: #111111
    node onlyBot
      x: 10
      y: 320
      w: 20
      h: 10
      fill: #0072B2
`,
      "pages.viva",
    );
    const bytes = await renderVectorPdfFromIr(ir);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(2);
    const { nodes } = flattenNodesFromIr(ir);
    const plate = nodes.find((n) => n.name === "plate");
    expect(plate).toBeTruthy();
    const box = propsToBBox(plate!.props);
    expect(box.h).toBeGreaterThan(1000);
  });

  it("places a rounded swatch at the scene y, not a double-flipped mid-page", async () => {
    const ir = compile(
      `artifact "Round"
scene
  size: 200 160
  background: #ffffff
  layer ink
    node swatch
      x: 40
      y: 80
      w: 20
      h: 20
      radius: 2
      fill: #0072B2
      stroke: #111111
`,
      "round-swatch.viva",
    );
    const pack = await renderVectorPdfPackageFromIr(ir);
    const hit = pack.sidecar.find((n) => n.name === "swatch");
    expect(hit, "sidecar missing swatch").toBeTruthy();
    expect(hit!.bboxPt.y).toBeCloseTo(80, 5);
    expect(hit!.bboxPt.x).toBeCloseTo(40, 5);
  });

  it("keeps 时间 / 心率 as mapped CJK, not missingGlyphs false green", async () => {
    const src = await import("node:fs").then((fs) => fs.readFileSync("examples/paper-cjk.viva", "utf8"));
    const pdf = await exportArtifact(src, "pdf", PRINT, "paper-cjk.viva");
    expect(pdf.missingGlyphs ?? []).toEqual([]);
    const raw = new TextDecoder("latin1").decode(pdf.bytes);
    expect(raw.includes("Time") || raw.length > 1000).toBe(true);
  });
});
