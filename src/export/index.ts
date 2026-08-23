import { PDFDocument } from "pdf-lib";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { compileSource } from "../pipeline.js";
import type { VisualIR } from "../ir.js";
import { flattenNodesFromIr, renderSvgFromIr } from "./static-svg.js";
import { renderVectorPdfFromIr } from "./vector-pdf.js";

export type ExportFormat = "svg" | "png" | "jpg" | "jpeg" | "pdf" | "pdf-raster";

export type ExportOptions = {
  /** Raster width in CSS pixels (SVG viewBox mapped). Default 1280. */
  width?: number;
  /** JPEG quality 1–100. Default 92. */
  quality?: number;
  background?: string;
  /**
   * PDF mode: `vector` (default) draws primitives 1:1 with SVG geometry;
   * `raster` embeds a PNG (legacy). Format `pdf-raster` forces raster.
   */
  pdfMode?: "vector" | "raster";
  /** Vector PDF scale (scene unit → PDF point). Default 1. */
  scale?: number;
  /** Style handbook ids applied at compile time (same as session handbooks). */
  handbookIds?: string[];
  /**
   * When true, export every `layout.board` beat as its own raster.
   * No new language keyword — uses existing `__beat` state.
   */
  beats?: boolean;
};

export type BeatFrame = {
  index: number;
  bytes: Uint8Array;
  mime: string;
  svg: string;
};

export type ExportResult = {
  format: ExportFormat;
  bytes: Uint8Array;
  mime: string;
  svg: string;
  /** True when PDF used vector primitives (not PNG embed). */
  vector?: boolean;
};

export function exportSvgFromSource(
  source: string,
  filename = "<input>",
  handbookIds?: string[],
): { svg: string; error: string | null } {
  const result = compileSource(source, filename, { handbookIds });
  if (!result.ir) return { svg: "", error: result.error };
  return { svg: renderSvgFromIr(result.ir), error: null };
}

export async function exportArtifact(
  source: string,
  format: ExportFormat,
  opts: ExportOptions = {},
  filename = "<input>",
): Promise<ExportResult> {
  const result = compileSource(source, filename, {
    handbookIds: opts.handbookIds,
  });
  if (!result.ir) throw new Error(result.error ?? "compile failed");
  const svg = renderSvgFromIr(result.ir);
  const sceneBg = flattenNodesFromIr(result.ir).scene.background;
  const fmt = format === "jpeg" ? "jpg" : format;

  if (fmt === "svg") {
    return {
      format: "svg",
      bytes: new TextEncoder().encode(svg),
      mime: "image/svg+xml",
      svg,
      vector: true,
    };
  }

  if (fmt === "pdf" || fmt === "pdf-raster") {
    const mode = fmt === "pdf-raster" ? "raster" : (opts.pdfMode ?? "vector");
    if (mode === "vector") {
      const bytes = await renderVectorPdfFromIr(result.ir, { scale: opts.scale ?? 1 });
      return { format: "pdf", bytes, mime: "application/pdf", svg, vector: true };
    }
    const raster = await rasterize(svg, { ...opts, background: opts.background ?? sceneBg });
    const pdf = await PDFDocument.create();
    const pngImage = await pdf.embedPng(raster);
    const page = pdf.addPage([pngImage.width, pngImage.height]);
    page.drawImage(pngImage, { x: 0, y: 0, width: pngImage.width, height: pngImage.height });
    const pdfBytes = await pdf.save();
    return { format: "pdf-raster", bytes: pdfBytes, mime: "application/pdf", svg, vector: false };
  }

  const png = await rasterize(svg, { ...opts, background: opts.background ?? sceneBg });

  if (fmt === "png") {
    return { format: "png", bytes: png, mime: "image/png", svg };
  }

  if (fmt === "jpg") {
    const jpg = await sharp(png)
      .jpeg({ quality: opts.quality ?? 92, mozjpeg: true })
      .toBuffer();
    return { format: "jpg", bytes: jpg, mime: "image/jpeg", svg };
  }

  throw new Error(`unsupported format: ${format}`);
}

async function rasterize(svg: string, opts: ExportOptions): Promise<Uint8Array> {
  const width = opts.width ?? 1280;
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: opts.background ?? "#ffffff",
  });
  return resvg.render().asPng();
}

export function beatCountFromIr(ir: VisualIR): number {
  return ir.frames.filter((f) => /(?:^|_)beat\d+$/.test(f.name)).length;
}

/** Raster one PNG per board beat by writing `__beat` (still not a video file). */
export async function exportBeatSequence(
  source: string,
  opts: ExportOptions = {},
  filename = "<input>",
): Promise<BeatFrame[]> {
  const result = compileSource(source, filename, { handbookIds: opts.handbookIds });
  if (!result.ir) throw new Error(result.error ?? "compile failed");
  const n = Math.max(1, beatCountFromIr(result.ir));
  const sceneBg = flattenNodesFromIr(result.ir).scene.background;
  const frames: BeatFrame[] = [];
  for (let i = 0; i < n; i++) {
    const ir = structuredClone(result.ir);
    ir.state.__beat = i;
    const svg = renderSvgFromIr(ir);
    const bytes = await rasterize(svg, { ...opts, background: opts.background ?? sceneBg });
    frames.push({ index: i, bytes, mime: "image/png", svg });
  }
  return frames;
}

export { renderSvgFromIr, flattenNodesFromIr } from "./static-svg.js";
export { renderVectorPdfFromIr } from "./vector-pdf.js";
