/**
 * Gates 1–4 / 6–7 on a short-intent generated piece (not the hand-written fixture).
 * Sources come from the live agent loop / H09 exam artifacts written this run.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { inflateRawSync, inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { flattenNodesFromIr, nodePainted, renderSvgFromIr } from "../../src/export/static-svg.js";
import { exportArtifact, exportBeatPlayback, exportBeatSequence } from "../../src/export/index.js";
import { holdFrameTimes, playbackFrameTimes } from "../../src/timeline/clock.js";
import { COLUMN_MM } from "../../src/space/scene-box.js";
import { compareSvgPdfPages, pdftoppmAvailable } from "../../src/check/visual-parity.js";
import { listSelectableNodes } from "../../src/review/nodes.js";
import { pdfUnmappedGlyphs } from "../../src/export/pdf-font.js";

const PRINT = { handbookIds: ["print-nature"] } as const;

const PRODUCT = "/opt/cursor/artifacts/agent-loop-live.viva";
const EXAM = "/opt/cursor/artifacts/agent-exam/H09.viva";
const CANDIDATES = [PRODUCT].filter((p) => existsSync(p));

function pdfOperators(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  const chunks = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  let out = "";
  for (const chunk of chunks) {
    const buf = Buffer.from(chunk[1]!, "latin1");
    for (const inflate of [inflateSync, inflateRawSync]) {
      try {
        out += inflate(buf).toString("latin1");
        break;
      } catch {
        /* try the other wrapper */
      }
    }
  }
  return out;
}

function cellWidth(ir: NonNullable<ReturnType<typeof compileSource>["ir"]>, name: string): number {
  const frame = ir.frames.find((f) => f.name === name);
  if (!frame?.props.cellX) return 0;
  const cellX = evaluate(frame.props.cellX, [ir.state, ir.data]) as number[];
  return cellX[1]! - cellX[0]!;
}

describe.skipIf(CANDIDATES.length === 0)("generated arrival card — doors 1–4 / 6–7", () => {
  for (const path of CANDIDATES) {
    describe(path.split("/").pop()!, () => {
      const src = readFileSync(path, "utf8");

      it("1/2 compiles print-nature with 89 mm and 183 mm cells", () => {
        expect(src).not.toMatch(/LANGUAGE\.md/);
        expect(src).not.toMatch(/(^|\n)\s*(areaX|areaY|insetL)\s*:/);
        const compiled = compileSource(src, path, PRINT);
        expect(compiled.error, compiled.error ?? "").toBeNull();
        const ir = compiled.ir!;
        expect(ir.timeline?.beats).toBeGreaterThanOrEqual(4);
        expect(ir.events.some((e) => e.type === "drag")).toBe(true);
        expect(src).toMatch(/[\u4e00-\u9fff]/);
        const widths = ["a", "b", "c", "d"]
          .map((name) => cellWidth(ir, name))
          .filter((w) => w > 0)
          .sort((x, y) => x - y);
        expect(widths[0]).toBeGreaterThan(COLUMN_MM.single * 0.7);
        expect(widths[widths.length - 1]).toBeGreaterThan(COLUMN_MM.double * 0.7);
      });

      it("3 SVG↔PDF ink + sidecar", async () => {
        expect(pdftoppmAvailable()).toBe(true);
        const compiled = compileSource(src, path, PRINT);
        const ir = compiled.ir!;
        const pdf = await exportArtifact(src, "pdf", PRINT, path);
        expect(pdf.vector).toBe(true);
        const doc = await PDFDocument.load(pdf.bytes);
        expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
        const report = await compareSvgPdfPages(ir, { width: 640 });
        expect(report.pdfRaster).toBe("pdftoppm");
        expect(report.idEqual, `painted=${report.paintedIds.length} sidecar=${report.sidecarIds.length}`).toBe(true);
        expect(report.sidecarOverlap).toBeGreaterThan(0.85);
        expect(report.minInkIou, JSON.stringify(report.pages)).toBeGreaterThan(0.55);
        expect(report.maxMse).toBeLessThan(0.45);
      }, 60_000);

      it("4 PDF glyph / clip / fill / CJK", async () => {
        const compiled = compileSource(src, path, PRINT);
        const pdf = await exportArtifact(src, "pdf", PRINT, path);
        const ops = pdfOperators(pdf.bytes);
        expect(ops).toMatch(/W\s+n|W\*/);
        expect(ops).toMatch(/\bf\b|f\*|B/);
        expect(pdf.missingGlyphs ?? []).toEqual([]);
        expect(pdfUnmappedGlyphs("到站件时间得分对照")).toEqual([]);
        expect(renderSvgFromIr(compiled.ir!)).toMatch(/[\u4e00-\u9fff]/);
      }, 30_000);

      it("6 clock hold vs playback", async () => {
        const compiled = compileSource(src, path, PRINT);
        const ir = compiled.ir!;
        expect(holdFrameTimes(ir.timeline!).length).toBeGreaterThanOrEqual(4);
        expect(playbackFrameTimes(ir.timeline!).length).toBeGreaterThan(holdFrameTimes(ir.timeline!).length);
        const holds = await exportBeatSequence(src, { width: 240, ...PRINT }, path);
        const play = await exportBeatPlayback(src, { width: 240, ...PRINT }, path);
        expect(holds.length).toBe(holdFrameTimes(ir.timeline!).length);
        expect(play.length).toBe(playbackFrameTimes(ir.timeline!).length);
      }, 60_000);

      it.skipIf(!existsSync(EXAM))("H09 exam source still compiles as arrival-class", () => {
        const examSrc = readFileSync(EXAM, "utf8");
        const compiled = compileSource(examSrc, EXAM, PRINT);
        expect(compiled.error, compiled.error ?? "").toBeNull();
        expect(compiled.ir?.timeline?.beats).toBeGreaterThanOrEqual(4);
        expect(compiled.ir?.events.some((e) => e.type === "drag")).toBe(true);
        expect(examSrc).toMatch(/跨页/);
      });

      it("7 logical / painted / sidecar / review IDs", async () => {
        const compiled = compileSource(src, path, PRINT);
        const ir = compiled.ir!;
        const { nodes } = flattenNodesFromIr(ir);
        const painted = nodes.filter((n) => nodePainted(n.props)).map((n) => n.id).sort();
        const svgIds = [...renderSvgFromIr(ir).matchAll(/data-viva-id="([^"]+)"/g)].map((m) => m[1]!).sort();
        expect(svgIds).toEqual(painted);
        const pdf = await exportArtifact(src, "pdf", PRINT, path);
        const side = [...new Set((pdf.sidecar ?? []).map((n) => n.id))].sort();
        expect(side).toEqual(painted);
        const review = listSelectableNodes(ir).map((n) => n.id);
        expect(painted.every((id) => review.includes(id))).toBe(true);
      }, 30_000);
    });
  }
});
