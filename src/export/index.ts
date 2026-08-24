import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { compileSource } from "../pipeline.js";
import type { VisualIR } from "../ir.js";
import { flattenNodesFromIr, renderSvgFromIr } from "./static-svg.js";
import { renderVectorPdfFromIr } from "./vector-pdf.js";
import { applyTimelineState, holdFrameTimes, playbackFrameTimes, timelineFromState } from "../timeline/clock.js";

export type ExportFormat = "svg" | "png" | "jpg" | "jpeg" | "pdf" | "pdf-raster" | "gif" | "mp4";
export type BeatAnimFormat = "gif" | "mp4";

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
   * Host TTF/OTF for vector PDF CJK. Wins over `VIVA_PDF_CJK_FONT` and the
   * bundled subset. Missing path falls through. Not a language keyword.
   */
  cjkFontPath?: string;
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
  /** Characters the PDF font could not cover (substituted as `?`). */
  missingGlyphs?: string[];
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

  if (fmt === "gif" || fmt === "mp4") {
    throw new Error(`${fmt} is a clocked layout.board play export — pass beats:true / --beats`);
  }

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
      const missingGlyphs: string[] = [];
      const bytes = await renderVectorPdfFromIr(result.ir, {
        ...(opts.scale !== undefined ? { scale: opts.scale } : {}),
        cjkFontPath: opts.cjkFontPath,
        missingGlyphs,
      });
      return {
        format: "pdf",
        bytes,
        mime: "application/pdf",
        svg,
        vector: true,
        ...(missingGlyphs.length ? { missingGlyphs } : {}),
      };
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

/** Raster one PNG per board beat at the hold midpoint (same clock as Runtime). */
export async function exportBeatSequence(
  source: string,
  opts: ExportOptions = {},
  filename = "<input>",
): Promise<BeatFrame[]> {
  const result = compileSource(source, filename, { handbookIds: opts.handbookIds });
  if (!result.ir) throw new Error(result.error ?? "compile failed");
  const spec = result.ir.timeline ?? timelineFromState(result.ir.state);
  const times = spec ? holdFrameTimes(spec) : Array.from({ length: Math.max(1, beatCountFromIr(result.ir)) }, (_, i) => i);
  const sceneBg = flattenNodesFromIr(result.ir).scene.background;
  const frames: BeatFrame[] = [];
  for (let i = 0; i < times.length; i++) {
    const ir = structuredClone(result.ir);
    if (spec) applyTimelineState(ir.state as Record<string, unknown>, spec, times[i]!);
    else ir.state.__beat = i;
    const svg = renderSvgFromIr(ir);
    const bytes = await rasterize(svg, { ...opts, background: opts.background ?? sceneBg });
    frames.push({ index: i, bytes, mime: "image/png", svg });
  }
  return frames;
}

/** Interpolated play frames at timeline.fps (includes ease, not just holds). */
export async function exportBeatPlayback(
  source: string,
  opts: ExportOptions = {},
  filename = "<input>",
): Promise<BeatFrame[]> {
  const result = compileSource(source, filename, { handbookIds: opts.handbookIds });
  if (!result.ir) throw new Error(result.error ?? "compile failed");
  const spec = result.ir.timeline ?? timelineFromState(result.ir.state);
  if (!spec) return exportBeatSequence(source, opts, filename);
  const times = playbackFrameTimes(spec);
  const sceneBg = flattenNodesFromIr(result.ir).scene.background;
  const frames: BeatFrame[] = [];
  for (let i = 0; i < times.length; i++) {
    const ir = structuredClone(result.ir);
    applyTimelineState(ir.state as Record<string, unknown>, spec, times[i]!);
    const svg = renderSvgFromIr(ir);
    const bytes = await rasterize(svg, { ...opts, background: opts.background ?? sceneBg });
    frames.push({ index: i, bytes, mime: "image/png", svg });
  }
  return frames;
}

export function isBeatAnimFormat(format: string): format is BeatAnimFormat {
  return format === "gif" || format === "mp4";
}

export async function ffmpegAvailable(): Promise<boolean> {
  const probe = await spawnOnce("ffmpeg", ["-version"]);
  return probe.ok;
}

function spawnOnce(cmd: string, args: string[], timeoutMs = 30_000): Promise<{ ok: boolean; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ ok: false, stderr: stderr || "ffmpeg timed out" });
    }, timeoutMs);
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, stderr: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, stderr });
    });
  });
}

/** Assemble clocked play frames with ffmpeg at timeline.fps. */
export async function exportBeatAnimation(
  source: string,
  kind: BeatAnimFormat,
  opts: ExportOptions = {},
  filename = "<input>",
): Promise<ExportResult> {
  if (!(await ffmpegAvailable())) {
    throw new Error("ffmpeg not found — export --beats PNG frames, or install ffmpeg to stitch gif/mp4");
  }
  const compiled = compileSource(source, filename, { handbookIds: opts.handbookIds });
  const spec = compiled.ir?.timeline ?? (compiled.ir ? timelineFromState(compiled.ir.state) : null);
  const fps = String(Math.max(1, Math.round(spec?.fps ?? 12)));
  const frames = spec
    ? await exportBeatPlayback(source, opts, filename)
    : await exportBeatSequence(source, opts, filename);
  const dir = await mkdtemp(join(tmpdir(), "viva-beats-"));
  try {
    for (const frame of frames) {
      await writeFile(join(dir, `frame-${frame.index}.png`), frame.bytes);
    }
    const out = join(dir, kind === "gif" ? "out.gif" : "out.mp4");
    const input = join(dir, "frame-%d.png");
    const args =
      kind === "gif"
        ? ["-y", "-hide_banner", "-loglevel", "error", "-framerate", fps, "-start_number", "0", "-i", input, "-loop", "0", out]
        : [
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-framerate",
            fps,
            "-start_number",
            "0",
            "-i",
            input,
            "-an",
            "-vf",
            "scale=trunc(iw/2)*2:trunc(ih/2)*2",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            out,
          ];
    const ran = await spawnOnce("ffmpeg", args);
    if (!ran.ok) {
      throw new Error(`ffmpeg failed to stitch ${kind}: ${ran.stderr.slice(0, 400)}`);
    }
    const bytes = new Uint8Array(await readFile(out));
    return {
      format: kind,
      bytes,
      mime: kind === "gif" ? "image/gif" : "video/mp4",
      svg: frames[0]?.svg ?? "",
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export { renderSvgFromIr, flattenNodesFromIr } from "./static-svg.js";
export { renderVectorPdfFromIr } from "./vector-pdf.js";
