import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { compileSource } from "../../src/pipeline";
import { renderSvgFromIr } from "../../src/export/static-svg";
import { exportArtifact } from "../../src/export/index";

describe("static SVG + raster/pdf export", () => {
  it("renders hello.viva to SVG without a browser", () => {
    const src = readFileSync(path.resolve("examples/hello.viva"), "utf8");
    const { ir, error } = compileSource(src, "hello.viva");
    expect(error).toBeNull();
    const svg = renderSvgFromIr(ir!);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toMatch(/circle|rect|text|line|path/);
  });

  it("exports PNG/JPG/PDF bytes", async () => {
    const src = readFileSync(path.resolve("examples/hello.viva"), "utf8");
    const png = await exportArtifact(src, "png", { width: 640 }, "hello.viva");
    expect(png.bytes.byteLength).toBeGreaterThan(100);
    expect(png.mime).toBe("image/png");

    const jpg = await exportArtifact(src, "jpg", { width: 640 }, "hello.viva");
    expect(jpg.bytes.byteLength).toBeGreaterThan(100);
    expect(jpg.mime).toBe("image/jpeg");

    const pdf = await exportArtifact(src, "pdf", { width: 640 }, "hello.viva");
    expect(pdf.bytes.byteLength).toBeGreaterThan(100);
    expect(pdf.mime).toBe("application/pdf");
    expect(pdf.vector).toBe(true);
    // PDF magic
    expect(String.fromCharCode(...pdf.bytes.slice(0, 4))).toBe("%PDF");
  }, 30_000);

  it("exports a PNG frame per layout.board beat from __beat", async () => {
    const { exportBeatSequence } = await import("../../src/export/index.js");
    const src = readFileSync(path.resolve("examples/storyboard.viva"), "utf8");
    const frames = await exportBeatSequence(src, { width: 320, handbookIds: ["print-nature"] }, "storyboard.viva");
    expect(frames.length).toBe(4);
    expect(frames[0]!.bytes.byteLength).toBeGreaterThan(100);
    expect(String.fromCharCode(...frames[0]!.bytes.slice(0, 8))).toContain("PNG");
    expect(Buffer.from(frames[0]!.bytes).equals(Buffer.from(frames[1]!.bytes))).toBe(false);
    const sharp = (await import("sharp")).default;
    const meanBand = async (bytes: Uint8Array, x0: number, x1: number) => {
      const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let sum = 0;
      let n = 0;
      const left = Math.floor(info.width * x0);
      const right = Math.floor(info.width * x1);
      const top = Math.floor(info.height * 0.28);
      const bottom = Math.floor(info.height * 0.72);
      for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
          const i = (y * info.width + x) * info.channels;
          sum += data[i]! + data[i + 1]! + data[i + 2]!;
          n += 3;
        }
      }
      return sum / Math.max(1, n);
    };
    const beat0Left = await meanBand(frames[0]!.bytes, 0.06, 0.24);
    const beat1Left = await meanBand(frames[1]!.bytes, 0.06, 0.24);
    expect(beat0Left).toBeGreaterThan(beat1Left + 15);
  }, 30_000);
});
