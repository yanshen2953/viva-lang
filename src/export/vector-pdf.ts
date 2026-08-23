import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { DEFAULT_SCENE_BACKGROUND } from "../style/defaults.js";
import { flattenNodesFromIr, type FlatNode } from "./static-svg.js";
import { embedPdfFonts, pdfSafeText, pdfTextWidth, pickPdfFont, type PdfTextFonts } from "./pdf-font.js";
import { evalSceneProps, pxToPdfPt, resolveSceneBox } from "../space/scene-box.js";
import type { VisualIR } from "../ir.js";

export type VectorPdfOptions = {
  /** Scale scene units → PDF points. Default 1 (1:1 with viewBox). */
  scale?: number;
};

/**
 * True vector PDF: draw circle/rect/line/text/path primitives from IR geometry.
 * Coordinates match SVG/viewBox (Y flipped for PDF). Not a PNG-in-PDF raster.
 */
export async function renderVectorPdfFromIr(
  ir: VisualIR,
  opts: VectorPdfOptions = {},
): Promise<Uint8Array> {
  const { scene, nodes } = flattenNodesFromIr(ir);
  const box = resolveSceneBox(evalSceneProps(ir.scene.props, [ir.state, ir.data]));
  const autoScale = box.unit === "mm" || box.unit === "pt" ? pxToPdfPt(1) : 1;
  const scale = opts.scale ?? autoScale;
  const pageW = scene.width * scale;
  const pageH = scene.height * scale;

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([pageW, pageH]);
  const fonts = await embedPdfFonts(pdf);

  // Background
  const bg = parseColor(scene.background) ?? parseColor(DEFAULT_SCENE_BACKGROUND) ?? rgb(1, 1, 1);
  page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: bg });

  for (const node of nodes) {
    drawNode(page, fonts, node, pageH, scale);
  }

  return pdf.save();
}

function drawNode(
  page: PDFPage,
  fonts: PdfTextFonts,
  node: FlatNode,
  pageH: number,
  scale: number,
): void {
  const p = node.props;
  const opacity = p.opacity === undefined ? 1 : clamp01(Number(p.opacity) || 1);
  const tag = inferTag(p);

  if (tag === "circle") {
    const cx = num(p.x) * scale;
    const cy = flipY(num(p.y) * scale, pageH);
    const r = num(p.r ?? p.size, 16) * scale;
    const fill = parseColor(str(p.fill ?? p.color, "#38bdf8"));
    page.drawCircle({
      x: cx,
      y: cy,
      size: r, // pdf-lib: size → ellipse xScale/yScale (radius)
      color: fill ?? undefined,
      opacity,
      borderColor: p.stroke ? parseColor(String(p.stroke)) ?? undefined : undefined,
      borderWidth: p.strokeWidth ? num(p.strokeWidth) * scale : undefined,
      borderOpacity: opacity,
    });
    return;
  }

  if (tag === "rect") {
    const x = num(p.x) * scale;
    const w = num(p.w ?? p.width, 80) * scale;
    const h = num(p.h ?? p.height, 24) * scale;
    const yTop = num(p.y) * scale;
    const y = pageH - yTop * 1 - h; // bottom-left in PDF
    const fill = parseColor(str(p.fill ?? p.color, "#1e293b"));
    page.drawRectangle({
      x,
      y,
      width: w,
      height: h,
      color: fill ?? undefined,
      opacity,
      borderColor: p.stroke ? parseColor(String(p.stroke)) ?? undefined : undefined,
      borderWidth: p.strokeWidth ? num(p.strokeWidth) * scale : undefined,
      borderOpacity: opacity,
    });
    return;
  }

  if (tag === "line") {
    const x1 = num(p.x1, num(p.x)) * scale;
    const y1 = flipY(num(p.y1, num(p.y)) * scale, pageH);
    const x2 = num(p.x2, num(p.x) + 40) * scale;
    const y2 = flipY(num(p.y2, num(p.y)) * scale, pageH);
    const stroke = parseColor(str(p.stroke ?? p.fill, "#64748b")) ?? rgb(0.4, 0.45, 0.5);
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: num(p.strokeWidth, 2) * scale,
      color: stroke,
      opacity,
    });
    return;
  }

  if (tag === "text") {
    const raw = str(p.text ?? p.label ?? node.name, "");
    if (!raw) return;
    const text = raw;
    const font = pickPdfFont(fonts, text);
    const drawn = pdfSafeText(font, text);
    const size = num(p.font ?? p.fontSize, 14) * scale;
    const x = num(p.x) * scale;
    // SVG text y is baseline; PDF drawText y is baseline too after flip
    const y = flipY(num(p.y) * scale, pageH);
    const fill = parseColor(str(p.fill ?? p.color, "#e2e8f0")) ?? rgb(0.9, 0.92, 0.94);
    const align = str(p.align, "start");
    let drawX = x;
    if (align === "center" || align === "middle") {
      drawX = x - pdfTextWidth(font, drawn, size) / 2;
    } else if (align === "right" || align === "end") {
      drawX = x - pdfTextWidth(font, drawn, size);
    }
    page.drawText(drawn, {
      x: drawX,
      y: y - size * 0.15,
      size,
      font,
      color: fill,
      opacity,
    });
    return;
  }

  // Path: approximate with line segments from path `d` when simple M/L only
  const d = str(p.d ?? p.path, "");
  const pts = parseSimplePath(d);
  if (pts.length >= 2) {
    const stroke = parseColor(str(p.stroke, "#94a3b8")) ?? rgb(0.58, 0.64, 0.72);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      page.drawLine({
        start: { x: a.x * scale, y: flipY(a.y * scale, pageH) },
        end: { x: b.x * scale, y: flipY(b.y * scale, pageH) },
        thickness: num(p.strokeWidth, 1) * scale,
        color: stroke,
        opacity,
      });
    }
  }
}

function flipY(y: number, pageH: number): number {
  return pageH - y;
}

function inferTag(props: Record<string, unknown>): string {
  if (props.d !== undefined || props.path !== undefined) return "path";
  if (props.x1 !== undefined || props.x2 !== undefined) return "line";
  if (props.text !== undefined || props.label !== undefined || props.font !== undefined) return "text";
  if (props.w !== undefined || props.width !== undefined || props.h !== undefined || props.height !== undefined)
    return "rect";
  return "circle";
}

function parseSimplePath(d: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const re = /([ML])\s*([-\d.]+)\s*([-\d.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    out.push({ x: Number(m[2]), y: Number(m[3]) });
  }
  return out.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

function parseColor(input: string): RGB | null {
  const s = input.trim();
  if (s.startsWith("#")) {
    const hex = s.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex.length >= 6
          ? hex.slice(0, 6)
          : "";
    if (full.length !== 6) return null;
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    if (![r, g, b].every(Number.isFinite)) return null;
    return rgb(r, g, b);
  }
  const m = s.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) {
    return rgb(clamp01(Number(m[1]) / 255), clamp01(Number(m[2]) / 255), clamp01(Number(m[3]) / 255));
  }
  return null;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
