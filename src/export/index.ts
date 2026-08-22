import { PDFDocument } from "pdf-lib";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { compileSource } from "../pipeline.js";
import { renderSvgFromIr } from "./static-svg.js";

export type ExportFormat = "svg" | "png" | "jpg" | "jpeg" | "pdf";

export type ExportOptions = {
  /** Raster / PDF width in CSS pixels (SVG viewBox mapped). Default 1280. */
  width?: number;
  /** JPEG quality 1–100. Default 92. */
  quality?: number;
  background?: string;
};

export type ExportResult = {
  format: ExportFormat;
  bytes: Uint8Array;
  mime: string;
  svg: string;
};

export function exportSvgFromSource(source: string, filename = "<input>"): { svg: string; error: string | null } {
  const result = compileSource(source, filename);
  if (!result.ir) return { svg: "", error: result.error };
  return { svg: renderSvgFromIr(result.ir), error: null };
}

export async function exportArtifact(
  source: string,
  format: ExportFormat,
  opts: ExportOptions = {},
  filename = "<input>",
): Promise<ExportResult> {
  const { svg, error } = exportSvgFromSource(source, filename);
  if (error) throw new Error(error);
  const fmt = format === "jpeg" ? "jpg" : format;
  if (fmt === "svg") {
    return {
      format: "svg",
      bytes: new TextEncoder().encode(svg),
      mime: "image/svg+xml",
      svg,
    };
  }

  const width = opts.width ?? 1280;
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: opts.background,
  });
  const pngData = resvg.render();
  const png = pngData.asPng();

  if (fmt === "png") {
    return { format: "png", bytes: png, mime: "image/png", svg };
  }

  if (fmt === "jpg") {
    const jpg = await sharp(png)
      .jpeg({ quality: opts.quality ?? 92, mozjpeg: true })
      .toBuffer();
    return { format: "jpg", bytes: jpg, mime: "image/jpeg", svg };
  }

  // pdf
  const pdf = await PDFDocument.create();
  const pngImage = await pdf.embedPng(png);
  const pageWidth = pngImage.width;
  const pageHeight = pngImage.height;
  const page = pdf.addPage([pageWidth, pageHeight]);
  page.drawImage(pngImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });
  const pdfBytes = await pdf.save();
  return { format: "pdf", bytes: pdfBytes, mime: "application/pdf", svg };
}
