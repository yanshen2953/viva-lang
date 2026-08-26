import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { flattenNodesFromIr, nodePainted, renderSvgFromIr } from "../export/static-svg.js";
import { renderVectorPdfPackageFromIr, type PdfSidecarNode } from "../export/vector-pdf.js";
import { bundledCjkFontPath } from "../export/pdf-font.js";
import {
  BUNDLED_LATIN_FAMILY,
  bundledLatinBoldPath,
  bundledLatinRegularPath,
} from "../metrics/bundled-fonts.js";
import { propsToBBox } from "../layout/node-bbox.js";
import {
  evalSceneProps,
  mmToPx,
  pxToPdfPt,
  resolveSceneBox,
  scenePageCount,
} from "../space/scene-box.js";
import type { VisualIR } from "../ir.js";

export type PageParity = {
  page: number;
  inkIou: number;
  mse: number;
};

export type VisualParityReport = {
  pages: PageParity[];
  sidecar: PdfSidecarNode[];
  paintedIds: string[];
  sidecarIds: string[];
  idEqual: boolean;
  minInkIou: number;
  maxMse: number;
  sidecarOverlap: number;
  pdfRaster: "pdftoppm" | "none";
};

function iou(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 1 : inter / union;
}

async function rasterPng(png: Buffer, width: number): Promise<{ data: Buffer; w: number; h: number }> {
  const raw = await sharp(png)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .resize({ width, withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({
      resolveWithObject: true,
    });
  return { data: raw.data, w: raw.info.width, h: raw.info.height };
}

async function rasterSvg(svg: string, width: number): Promise<{ data: Buffer; w: number; h: number }> {
  const fontFiles = [bundledLatinRegularPath(), bundledLatinBoldPath(), bundledCjkFontPath()].filter(
    (p): p is string => Boolean(p),
  );
  const png = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: {
      loadSystemFonts: false,
      defaultFontFamily: BUNDLED_LATIN_FAMILY,
      ...(fontFiles.length ? { fontFiles } : {}),
    },
  })
    .render()
    .asPng();
  return rasterPng(Buffer.from(png), width);
}

function inkMask(data: Buffer, w: number, h: number, bg = [255, 255, 255]): Uint8Array {
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const dr = Math.abs(data[o]! - bg[0]!);
    const dg = Math.abs(data[o + 1]! - bg[1]!);
    const db = Math.abs(data[o + 2]! - bg[2]!);
    mask[i] = dr + dg + db > 24 ? 1 : 0;
  }
  return mask;
}

/**
 * 8-connected 1 px dilate. After paint alignment (fonts, CJK embed, rounded
 * rect CTM), leftover mismatch is resvg/poppler halo on 1 CSS-px strokes.
 */
function dilateMask(mask: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(mask);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) out[ny * w + nx] = 1;
        }
      }
    }
  }
  return out;
}

function maskIou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0;
  let union = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i]!;
    const bv = b[i]!;
    inter += av & bv;
    union += av | bv;
  }
  return union === 0 ? 1 : inter / union;
}

function maskMse(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (a[i]! - b[i]!) ** 2;
  return n === 0 ? 0 : sum / n;
}

function sliceSvg(full: string, y0: number, h: number, width: number): string {
  const inner = full.replace(/^[\s\S]*?<svg[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${y0} ${width} ${h}" width="${width}" height="${h}" style="background:#ffffff"><rect x="0" y="${y0}" width="${width}" height="${h}" fill="#ffffff"/>${inner}</svg>`;
}

export function pdftoppmAvailable(): boolean {
  const probe = spawnSync("pdftoppm", ["-v"], { encoding: "utf8" });
  return probe.status === 0 || /pdftoppm/i.test(`${probe.stdout}\n${probe.stderr}`);
}

function rasterPdfPages(bytes: Uint8Array, width: number): Buffer[] {
  const dir = mkdtempSync(join(tmpdir(), "viva-pdf-"));
  try {
    const pdfPath = join(dir, "in.pdf");
    writeFileSync(pdfPath, bytes);
    const prefix = join(dir, "p");
    const ran = spawnSync("pdftoppm", ["-png", "-scale-to-x", String(width), "-scale-to-y", "-1", pdfPath, prefix], {
      encoding: "utf8",
    });
    if (ran.status !== 0) {
      throw new Error(`pdftoppm failed: ${ran.stderr || ran.stdout || ran.status}`);
    }
    const files = readdirSync(dir)
      .filter((name) => name.startsWith("p-") && name.endsWith(".png"))
      .sort();
    if (!files.length) throw new Error("pdftoppm wrote no pages");
    return files.map((name) => readFileSync(join(dir, name)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Compare static SVG page slices to rasterized vector PDF pages.
 * IDs come from flatten vs sidecar. Geometry overlap uses page-local boxes.
 */
export async function compareSvgPdfPages(
  ir: VisualIR,
  opts: { width?: number } = {},
): Promise<VisualParityReport> {
  const width = opts.width ?? 720;
  const { scene, nodes } = flattenNodesFromIr(ir);
  const box = resolveSceneBox(evalSceneProps(ir.scene.props, [ir.state, ir.data]));
  const pages = scenePageCount(box);
  const sliceH = box.page ? mmToPx(box.page.h) : scene.height;
  const scale = box.unit === "mm" || box.unit === "pt" ? pxToPdfPt(1) : 1;
  const pack = await renderVectorPdfPackageFromIr(ir);
  const painted = nodes.filter((n) => nodePainted(n.props));
  const paintedIds = painted.map((n) => n.id).sort();
  const sidecarIds = [...new Set(pack.sidecar.map((n) => n.id))].sort();
  const fullSvg = renderSvgFromIr(ir);
  const pageReports: PageParity[] = [];
  const canRaster = pdftoppmAvailable();
  const pdfPngs = canRaster ? rasterPdfPages(pack.bytes, width) : [];

  for (let i = 0; i < pages; i++) {
    const y0 = i * sliceH;
    const svgPage = sliceSvg(fullSvg, y0, sliceH, scene.width);
    const svgRas = await rasterSvg(svgPage, width);
    const svgInk = inkMask(svgRas.data, svgRas.w, svgRas.h);
    let pdfInk = svgInk;
    let mse = 0;
    let ink = 1;
    const pdfPng = pdfPngs[i];
    if (pdfPng) {
      const pdfRas = await rasterPng(pdfPng, svgRas.w);
      const h = Math.min(svgRas.h, pdfRas.h);
      const cropSvg = cropMask(svgInk, svgRas.w, svgRas.h, h);
      const cropPdf = cropMask(inkMask(pdfRas.data, pdfRas.w, pdfRas.h), pdfRas.w, pdfRas.h, h);
      // Two 8-connected steps: leftover after paint alignment is 1–2 px
      // resvg/poppler halo on 1 CSS-px strokes (SVG-only pixels are white).
      const dSvg = dilateMask(dilateMask(cropSvg, svgRas.w, h), svgRas.w, h);
      const dPdf = dilateMask(dilateMask(cropPdf, pdfRas.w, h), pdfRas.w, h);
      ink = maskIou(dSvg, dPdf);
      mse = maskMse(cropSvg, cropPdf);
      pdfInk = cropPdf;
    }
    pageReports.push({ page: i + 1, inkIou: ink, mse });
    void pdfInk;
  }

  const minInkIou = pageReports.reduce((m, p) => Math.min(m, p.inkIou), 1);
  const maxMse = pageReports.reduce((m, p) => Math.max(m, p.mse), 0);
  return {
    pages: pageReports,
    sidecar: pack.sidecar,
    paintedIds,
    sidecarIds,
    idEqual:
      paintedIds.every((id) => sidecarIds.includes(id)) && sidecarIds.every((id) => paintedIds.includes(id)),
    minInkIou,
    maxMse,
    sidecarOverlap: sidecarOverlap(ir, pack.sidecar, scale, sliceH),
    pdfRaster: canRaster ? "pdftoppm" : "none",
  };
}

function cropMask(mask: Uint8Array, w: number, _h: number, keepH: number): Uint8Array {
  return mask.subarray(0, w * keepH);
}

export function sidecarOverlap(
  ir: VisualIR,
  sidecar: PdfSidecarNode[],
  scale: number,
  sliceHPx: number,
): number {
  const { nodes } = flattenNodesFromIr(ir);
  const pageHpt = sliceHPx * scale;
  let worst = 1;
  for (const node of nodes) {
    if (!nodePainted(node.props)) continue;
    const hits = sidecar.filter((s) => s.id === node.id);
    if (!hits.length) return 0;
    const box = propsToBBox(node.props);
    const svgPt = { x: box.x * scale, y: box.y * scale, w: box.w * scale, h: box.h * scale };
    const best = Math.max(
      ...hits.map((hit) =>
        iou(svgPt, {
          x: hit.bboxPt.x,
          y: hit.bboxPt.y + (hit.page - 1) * pageHpt,
          w: hit.bboxPt.w,
          h: hit.bboxPt.h,
        }),
      ),
    );
    worst = Math.min(worst, best);
  }
  return worst;
}

export type RoleInkReport = {
  role: string;
  names: string[];
  inkIou: number;
};

function hideUnmatched(ir: VisualIR, match: RegExp): VisualIR {
  const next = structuredClone(ir);
  const walk = (items: typeof next.scene.layers[number]["items"]): void => {
    for (const item of items) {
      if (item.kind === "node") {
        if (!match.test(item.name)) {
          item.props.visible = { kind: "boolean", value: false, span: { line: 1, column: 1 } };
        }
        continue;
      }
      walk(item.body);
    }
  };
  for (const layer of next.scene.layers) walk(layer.items);
  return next;
}

/** Per-role SVG vs PDF ink IoU on an IR that only paints that role. */
export async function compareRoleInk(
  ir: VisualIR,
  roles: { role: string; match: RegExp }[],
  opts: { width?: number } = {},
): Promise<RoleInkReport[]> {
  const width = opts.width ?? 480;
  const { nodes } = flattenNodesFromIr(ir);
  const out: RoleInkReport[] = [];
  for (const { role, match } of roles) {
    const names = nodes.filter((n) => match.test(n.name)).map((n) => n.name);
    if (!names.length) {
      out.push({ role, names, inkIou: 0 });
      continue;
    }
    const isolated = hideUnmatched(ir, match);
    const report = await compareSvgPdfPages(isolated, { width });
    out.push({ role, names, inkIou: report.minInkIou });
  }
  return out;
}

/** Ink IoU between two PDF/SVG page rasters. Low means the pages are not copies. */
export async function comparePagePairInk(
  ir: VisualIR,
  opts: { width?: number } = {},
): Promise<{ pageIou: number; pages: number }> {
  const width = opts.width ?? 360;
  const report = await compareSvgPdfPages(ir, { width });
  const { scene } = flattenNodesFromIr(ir);
  const box = resolveSceneBox(evalSceneProps(ir.scene.props, [ir.state, ir.data]));
  const pages = scenePageCount(box);
  if (pages < 2) return { pageIou: 1, pages };
  const fullSvg = renderSvgFromIr(ir);
  const sliceH = box.page ? mmToPx(box.page.h) : scene.height;
  const a = await rasterSvg(sliceSvg(fullSvg, 0, sliceH, scene.width), width);
  const b = await rasterSvg(sliceSvg(fullSvg, sliceH, sliceH, scene.width), width);
  const h = Math.min(a.h, b.h);
  const iou = maskIou(
    cropMask(inkMask(a.data, a.w, a.h), a.w, a.h, h),
    cropMask(inkMask(b.data, b.w, b.h), b.w, b.h, h),
  );
  void report;
  return { pageIou: iou, pages };
}
