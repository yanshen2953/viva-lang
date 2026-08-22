import sharp from "sharp";
import type { VisualIR } from "../ir.js";
import type { RasterizedArtifact } from "./raster.js";
import { rasterizeIr } from "./raster.js";
import type { CheckDiagnostic, CheckOptions } from "./types.js";

function push(
  out: CheckDiagnostic[],
  code: string,
  message: string,
  severity: CheckDiagnostic["severity"],
  hint?: string,
): void {
  out.push({
    code,
    message,
    severity,
    layer: "visual",
    span: { line: 1, column: 1 },
    hint,
  });
}

function parseBgRgb(hex: string): [number, number, number] {
  const h = hex.trim();
  if (/^#[0-9a-f]{6}$/i.test(h)) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  if (/^#[0-9a-f]{3}$/i.test(h)) {
    const r = h[1]!;
    const g = h[2]!;
    const b = h[3]!;
    return [
      parseInt(r + r, 16),
      parseInt(g + g, 16),
      parseInt(b + b, 16),
    ];
  }
  return [255, 255, 255];
}

function inkStats(
  data: Buffer,
  width: number,
  height: number,
  bg: [number, number, number],
  threshold = 28,
): { ink: number; colors: Set<string> } {
  let ink = 0;
  const colors = new Set<string>();
  const [bgR, bgG, bgB] = bg;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const delta = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
      if (delta <= threshold) continue;
      ink++;
      colors.add(`${Math.floor(r / 10)},${Math.floor(g / 10)},${Math.floor(b / 10)}`);
    }
  }
  return { ink, colors };
}

function cellInk(
  data: Buffer,
  width: number,
  height: number,
  bg: [number, number, number],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const [bgR, bgG, bgB] = bg;
  let ink = 0;
  let total = 0;
  const xStart = Math.max(0, Math.floor(x0));
  const yStart = Math.max(0, Math.floor(y0));
  const xEnd = Math.min(width, Math.ceil(x1));
  const yEnd = Math.min(height, Math.ceil(y1));
  for (let y = yStart; y < yEnd; y++) {
    for (let x = xStart; x < xEnd; x++) {
      total++;
      const i = (y * width + x) * 4;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      if (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) > 28) ink++;
    }
  }
  return total > 0 ? ink / total : 0;
}

export async function runVisualChecks(
  ir: VisualIR,
  opts: CheckOptions = {},
  cachedRaster?: RasterizedArtifact,
): Promise<{ diagnostics: CheckDiagnostic[]; inkRatio: number; colorCount: number }> {
  const out: CheckDiagnostic[] = [];
  const minInk = opts.minInkRatio ?? 0.004;
  const minColors = opts.minColorCount ?? 6;

  const raster = cachedRaster ?? await rasterizeIr(ir, opts);
  const raw = await sharp(raster.png).ensureAlpha().raw().toBuffer();
  const width = raster.width;
  const height = raster.height;
  const bg = parseBgRgb(raster.background);

  const { ink, colors } = inkStats(raw, width, height, bg);
  const total = width * height;
  const inkRatio = ink / total;
  const colorCount = colors.size;

  if (inkRatio < minInk) {
    push(
      out,
      "check.visual.blank",
      `raster looks mostly blank (ink ${(inkRatio * 100).toFixed(2)}% < ${(minInk * 100).toFixed(2)}%)`,
      "error",
      "Scene may have no visible marks or palette fills failed.",
    );
  }

  if (total > 200_000 && colorCount < minColors) {
    push(
      out,
      "check.visual.flat",
      `low color diversity (${colorCount} quantized colors) for ${width}×${height} export`,
      "warn",
      "Heatmaps/bars may be single-color; verify palette() and role fills.",
    );
  }

  if (width >= 600 && height >= 360) {
    const cols = width >= 900 ? 3 : 2;
    const rows = height >= 500 ? 2 : 1;
    const cellMinInk = minInk * 0.35;
    let emptyPanels = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x0 = (col / cols) * width;
        const y0 = (row / rows) * height;
        const x1 = ((col + 1) / cols) * width;
        const y1 = ((row + 1) / rows) * height;
        const ratio = cellInk(raw, width, height, bg, x0, y0, x1, y1);
        if (ratio < cellMinInk) emptyPanels++;
      }
    }
    if (emptyPanels > 0 && rows * cols >= 4) {
      push(
        out,
        "check.visual.emptyPanel",
        `${emptyPanels} of ${rows * cols} raster panels look empty`,
        "warn",
        "Multi-panel layout may have missing or off-frame charts.",
      );
    }
  }

  return { diagnostics: out, inkRatio, colorCount };
}
