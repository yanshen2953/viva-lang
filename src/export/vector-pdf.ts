import {
  PDFDocument,
  clip,
  concatTransformationMatrix,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";
import { DEFAULT_SCENE_BACKGROUND } from "../style/defaults.js";
import { flattenNodesFromIr, nodePainted, type FlatNode } from "./static-svg.js";
import {
  embedPdfFonts,
  pdfSafeText,
  pdfTextWidth,
  pdfUnmappedGlyphs,
  pickPdfFont,
  type PdfTextFonts,
} from "./pdf-font.js";
import { evalSceneProps, mmToPx, pxToPdfPt, resolveSceneBox, scenePageCount } from "../space/scene-box.js";
import { propsToBBox } from "../layout/node-bbox.js";
import { gradientSpec } from "../paint.js";
import { roundedRectPath } from "../paint/path.js";
import type { VisualIR } from "../ir.js";

export type VectorPdfOptions = {
  /** Scale scene units → PDF points. Default 1 (1:1 with viewBox). */
  scale?: number;
  /** Host CJK TTF/OTF. Also `VIVA_PDF_CJK_FONT`. Not a language keyword. */
  cjkFontPath?: string;
  /** Filled with uncovered characters when the font has no cmap entry. */
  missingGlyphs?: string[];
};

export type PdfSidecarNode = {
  id: string;
  name: string;
  page: number;
  bboxPt: { x: number; y: number; w: number; h: number };
};

export type VectorPdfPackage = {
  bytes: Uint8Array;
  sidecar: PdfSidecarNode[];
};

/**
 * True vector PDF: draw circle/rect/line/text/path primitives from IR geometry.
 * Coordinates match SVG/viewBox (Y flipped for PDF). Not a PNG-in-PDF raster.
 */
export async function renderVectorPdfFromIr(
  ir: VisualIR,
  opts: VectorPdfOptions = {},
): Promise<Uint8Array> {
  return (await renderVectorPdfPackageFromIr(ir, opts)).bytes;
}

export async function renderVectorPdfPackageFromIr(
  ir: VisualIR,
  opts: VectorPdfOptions = {},
): Promise<VectorPdfPackage> {
  const { scene, nodes } = flattenNodesFromIr(ir);
  const box = resolveSceneBox(evalSceneProps(ir.scene.props, [ir.state, ir.data]));
  const autoScale = box.unit === "mm" || box.unit === "pt" ? pxToPdfPt(1) : 1;
  const scale = opts.scale ?? autoScale;
  const pages = scenePageCount(box);
  const sliceH = box.page ? mmToPx(box.page.h) : scene.height;
  const pageW = scene.width * scale;
  const pageH = sliceH * scale;
  const sidecar: PdfSidecarNode[] = [];

  const pdf = await PDFDocument.create();
  const fonts = await embedPdfFonts(pdf, { fontPath: opts.cjkFontPath });
  const bg = parseColor(scene.background) ?? parseColor(DEFAULT_SCENE_BACKGROUND) ?? rgb(1, 1, 1);

  for (let i = 0; i < pages; i++) {
    const page = pdf.addPage([pageW, pageH]);
    page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: bg });
    const originY = i * sliceH;
    const y1 = originY + sliceH;
    page.pushOperators(pushGraphicsState(), rectangle(0, 0, pageW, pageH), clip(), endPath());
    for (const node of nodes) {
      if (!nodePainted(node.props)) continue;
      if (!nodeHitsSlice(node.props, originY, y1)) continue;
      drawNode(page, fonts, node, pageH, scale, originY, opts);
      const boxPx = propsToBBox(node.props);
      sidecar.push({
        id: node.id,
        name: node.name,
        page: i + 1,
        bboxPt: {
          x: boxPx.x * scale,
          y: (boxPx.y - originY) * scale,
          w: boxPx.w * scale,
          h: boxPx.h * scale,
        },
      });
    }
    page.pushOperators(popGraphicsState());
  }

  return { bytes: await pdf.save(), sidecar };
}

function drawNode(
  page: PDFPage,
  fonts: PdfTextFonts,
  node: FlatNode,
  pageH: number,
  scale: number,
  originY = 0,
  opts: VectorPdfOptions = {},
): void {
  const p = node.props;
  const opacity = p.opacity === undefined ? 1 : clamp01(Number(p.opacity) || 1);
  const tag = inferTag(p);
  const dash = dashArray(p, scale);

  if (tag === "circle") {
    const cx = num(p.x) * scale;
    const cy = flipY(sy(num(p.y), originY, scale), pageH);
    const r = num(p.r ?? p.size, 16) * scale;
    const fill = parseColor(str(p.fill ?? p.color, "#38bdf8"));
    const spec = gradientSpec(p);
    if (spec) {
      fillGradient(
        page,
        spec.colors,
        spec.vertical,
        cx - r,
        cy - r,
        r * 2,
        r * 2,
        opacity,
      );
    }
    page.drawCircle({
      x: cx,
      y: cy,
      size: r,
      color: spec ? undefined : (fill ?? undefined),
      opacity,
      borderColor: p.stroke ? parseColor(String(p.stroke)) ?? undefined : undefined,
      borderWidth: p.strokeWidth ? num(p.strokeWidth) * scale : undefined,
      borderOpacity: opacity,
      borderDashArray: dash,
    });
    return;
  }

  if (tag === "rect") {
    const x = num(p.x);
    const w = num(p.w ?? p.width, 80);
    const h = num(p.h ?? p.height, 24);
    const y = num(p.y);
    const radius = num(p.radius ?? p.rx, 0);
    const spec = gradientSpec(p);
    const fill = parseColor(str(p.fill ?? p.color, "#1e293b"));
    const stroke = p.stroke ? parseColor(String(p.stroke)) : null;
    if (radius > 0) {
      withSceneCtm(page, pageH, scale, originY, () => {
        if (spec) {
          fillGradient(
            page,
            spec.colors,
            spec.vertical,
            x * scale,
            flipY(sy(y + h, originY, scale), pageH),
            w * scale,
            h * scale,
            opacity,
          );
        }
        page.drawSvgPath(roundedRectPath(x, y, w, h, radius), {
          color: spec ? undefined : (fill ?? undefined),
          opacity,
          borderColor: stroke ?? undefined,
          borderWidth: p.strokeWidth ? num(p.strokeWidth) : undefined,
          borderOpacity: opacity,
          borderDashArray: dashArray(p, 1),
        });
      });
      return;
    }
    const pdfY = pageH - sy(y, originY, scale) - h * scale;
    if (spec) {
      fillGradient(page, spec.colors, spec.vertical, x * scale, pdfY, w * scale, h * scale, opacity);
    }
    page.drawRectangle({
      x: x * scale,
      y: pdfY,
      width: w * scale,
      height: h * scale,
      color: spec ? undefined : (fill ?? undefined),
      opacity,
      borderColor: stroke ?? undefined,
      borderWidth: p.strokeWidth ? num(p.strokeWidth) * scale : undefined,
      borderOpacity: opacity,
      borderDashArray: dash,
    });
    return;
  }

  if (tag === "line") {
    const x1 = num(p.x1, num(p.x)) * scale;
    const y1 = flipY(sy(num(p.y1, num(p.y)), originY, scale), pageH);
    const x2 = num(p.x2, num(p.x) + 40) * scale;
    const y2 = flipY(sy(num(p.y2, num(p.y)), originY, scale), pageH);
    const stroke = parseColor(str(p.stroke ?? p.fill, "#64748b")) ?? rgb(0.4, 0.45, 0.5);
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: num(p.strokeWidth, 2) * scale,
      color: stroke,
      opacity,
      dashArray: dash,
    });
    return;
  }

  if (tag === "text") {
    drawTextNode(page, fonts, node, pageH, scale, originY, opts, opacity);
    return;
  }

  const d = str(p.d ?? p.path, "");
  if (!d) return;
  const fillRaw = str(p.fill ?? p.color, "none");
  const strokeRaw = str(p.stroke, "");
  const fill = fillRaw && fillRaw !== "none" ? parseColor(fillRaw) : null;
  const stroke = strokeRaw && strokeRaw !== "none" ? parseColor(strokeRaw) : null;
  withSceneCtm(page, pageH, scale, originY, () => {
    page.drawSvgPath(d, {
      color: fill ?? undefined,
      opacity,
      borderColor: stroke ?? undefined,
      borderWidth: stroke || p.strokeWidth ? num(p.strokeWidth, 1) : undefined,
      borderOpacity: opacity,
      borderDashArray: dashArray(p, 1),
    });
  });
}

function drawTextNode(
  page: PDFPage,
  fonts: PdfTextFonts,
  node: FlatNode,
  pageH: number,
  scale: number,
  originY: number,
  opts: VectorPdfOptions,
  opacity: number,
): void {
  const p = node.props;
  const raw = str(p.text ?? p.label ?? node.name, "");
  if (!raw) return;
  const font = pickPdfFont(fonts, raw);
  const drawn = pdfSafeText(font, raw);
  const gaps = pdfUnmappedGlyphs(raw, { fontPath: opts.cjkFontPath });
  if (gaps.length && opts.missingGlyphs) {
    for (const ch of gaps) {
      if (!opts.missingGlyphs.includes(ch)) opts.missingGlyphs.push(ch);
    }
  }
  const size = num(p.font ?? p.fontSize, 14) * scale;
  const x = num(p.x) * scale;
  const y = flipY(sy(num(p.y), originY, scale), pageH);
  const fill = parseColor(str(p.fill ?? p.color, "#e2e8f0")) ?? rgb(0.9, 0.92, 0.94);
  const align = str(p.align, "start");
  const tracking = num(p.letterSpacing ?? p.tracking, 0) * scale;
  const width = textWidth(font, drawn, size, tracking);
  let drawX = x;
  if (align === "center" || align === "middle") drawX = x - width / 2;
  else if (align === "right" || align === "end") drawX = x - width;
  const rotate = num(p.rotate ?? p.rotation, 0);
  const paint = (tx: number, ty: number) => {
    if (Math.abs(tracking) > 1e-6) {
      let cx = tx;
      for (const ch of drawn) {
        page.drawText(ch, { x: cx, y: ty, size, font, color: fill, opacity });
        cx += pdfTextWidth(font, ch, size) + tracking;
      }
      return;
    }
    page.drawText(drawn, { x: tx, y: ty, size, font, color: fill, opacity });
  };
  if (Math.abs(rotate) < 0.05) {
    paint(drawX, y);
    return;
  }
  // SVG rotate(deg, x, y) is clockwise in y-down. After the Y flip, invert the angle.
  page.pushOperators(pushGraphicsState());
  page.pushOperators(concatTransformationMatrix(1, 0, 0, 1, x, y));
  const rad = (-rotate * Math.PI) / 180;
  page.pushOperators(
    concatTransformationMatrix(Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0),
  );
  page.pushOperators(concatTransformationMatrix(1, 0, 0, 1, -x, -y));
  paint(drawX, y);
  page.pushOperators(popGraphicsState());
}

function textWidth(font: PDFFont, text: string, size: number, tracking: number): number {
  if (!text) return 0;
  let w = 0;
  let n = 0;
  for (const ch of text) {
    w += pdfTextWidth(font, ch, size);
    n += 1;
  }
  return w + Math.max(0, n) * tracking;
}

function withSceneCtm(
  page: PDFPage,
  pageH: number,
  scale: number,
  originY: number,
  fn: () => void,
): void {
  page.pushOperators(
    pushGraphicsState(),
    concatTransformationMatrix(scale, 0, 0, -scale, 0, pageH + originY * scale),
  );
  fn();
  page.pushOperators(popGraphicsState());
}

function fillGradient(
  page: PDFPage,
  colors: string[],
  vertical: boolean,
  x: number,
  y: number,
  w: number,
  h: number,
  opacity: number,
): void {
  const stops = colors.map((c) => parseColor(c)).filter((c): c is RGB => Boolean(c));
  if (stops.length < 2) return;
  const steps = Math.max(16, (stops.length - 1) * 12);
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const color = sampleRamp(stops, (t0 + t1) / 2);
    if (vertical) {
      const hh = h * (t1 - t0);
      page.drawRectangle({
        x,
        y: y + h - (t1 * h),
        width: w,
        height: Math.max(hh, 0.2),
        color,
        opacity,
      });
    } else {
      const ww = w * (t1 - t0);
      page.drawRectangle({
        x: x + t0 * w,
        y,
        width: Math.max(ww, 0.2),
        height: h,
        color,
        opacity,
      });
    }
  }
}

function sampleRamp(stops: RGB[], t: number): RGB {
  const u = Math.min(1, Math.max(0, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(u));
  const f = u - i;
  const a = stops[i]!;
  const b = stops[i + 1]!;
  return rgb(a.red + (b.red - a.red) * f, a.green + (b.green - a.green) * f, a.blue + (b.blue - a.blue) * f);
}

function nodeHitsSlice(props: Record<string, unknown>, y0: number, y1: number): boolean {
  const box = propsToBBox(props);
  const top = box.y;
  const bot = box.y + box.h;
  if (!(box.w > 0 || box.h > 0)) return true;
  return bot >= y0 - 0.5 && top < y1 + 0.5;
}

function dashArray(props: Record<string, unknown>, scale: number): number[] | undefined {
  const dash = props.dash ?? props.strokeDash ?? props.strokeDasharray;
  if (dash === undefined || dash === null || dash === false) return undefined;
  const parts = Array.isArray(dash)
    ? dash.map((v) => Number(v))
    : String(dash)
        .split(/[\s,]+/)
        .map(Number);
  const scaled = parts.filter((n) => Number.isFinite(n)).map((n) => n * scale);
  return scaled.length ? scaled : undefined;
}

function sy(value: number, originY: number, scale: number): number {
  return (value - originY) * scale;
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
