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
});
