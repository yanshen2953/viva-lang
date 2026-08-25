/**
 * Compile showcase stills + Clock / interaction movies for the README.
 * Run: npx vite-node --config vitest.config.ts scripts/export-gallery.mts
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { compileSource } from "../src/pipeline.js";
import { exportArtifact, exportBeatAnimation, ffmpegAvailable } from "../src/export/index.js";
import { flattenNodesFromIr, renderSvgFromIr } from "../src/export/static-svg.js";
import { createSimWorld, stepSimWorld, type SimWorld } from "../src/simulate.js";
import type { VisualIR } from "../src/ir.js";

const OUT = "docs/gallery";
mkdirSync(OUT, { recursive: true });

function rasterSvg(svg: string, width: number, background?: string): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    background: background ?? "#ffffff",
  });
  return resvg.render().asPng();
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr?.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(0, 800) || `ffmpeg exit ${code}`));
    });
  });
}

async function stitchMovie(
  frames: Uint8Array[],
  stem: string,
  fps: number,
): Promise<{ gif: string; mp4: string }> {
  if (!frames.length) throw new Error(`no frames for ${stem}`);
  const dir = join(tmpdir(), `viva-gallery-${stem}-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  try {
    for (let i = 0; i < frames.length; i++) {
      writeFileSync(join(dir, `frame-${i}.png`), frames[i]!);
    }
    const gif = `${OUT}/${stem}.gif`;
    const mp4 = `${OUT}/${stem}.mp4`;
    const input = join(dir, "frame-%d.png");
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-framerate",
      String(fps),
      "-start_number",
      "0",
      "-i",
      input,
      "-vf",
      "fps=" + fps + ",scale=800:-2:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=160:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3",
      "-loop",
      "0",
      gif,
    ]);
    await runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-framerate",
      String(fps),
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
      mp4,
    ]);
    return { gif, mp4 };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function snap(ir: VisualIR, world: SimWorld, width: number): Uint8Array {
  const clone = structuredClone(ir);
  clone.state = world.state;
  clone.data = world.data;
  const svg = renderSvgFromIr(clone);
  const { scene } = flattenNodesFromIr(clone);
  return rasterSvg(svg, width, scene.background);
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
}

async function still(file: string, name: string, handbookIds: string[], width: number): Promise<void> {
  const source = readFileSync(file, "utf8");
  const compiled = compileSource(source, file, { handbookIds });
  if (compiled.error || !compiled.ir) {
    throw new Error(`${file}: ${compiled.error ?? "no ir"}`);
  }
  const png = await exportArtifact(source, "png", { handbookIds, width }, file);
  writeFileSync(`${OUT}/${name}.png`, png.bytes);
  console.log(`still ${name}.png (${png.bytes.byteLength})`);
}

async function clockMovie(file: string, name: string, handbookIds: string[], width: number): Promise<void> {
  const source = readFileSync(file, "utf8");
  const gif = await exportBeatAnimation(source, "gif", { handbookIds, width, beats: true }, file);
  writeFileSync(`${OUT}/${name}.gif`, gif.bytes);
  const mp4 = await exportBeatAnimation(source, "mp4", { handbookIds, width, beats: true }, file);
  writeFileSync(`${OUT}/${name}.mp4`, mp4.bytes);
  console.log(`clock ${name}.gif/${name}.mp4 (${gif.bytes.byteLength}/${mp4.bytes.byteLength})`);
}

async function harborMovie(): Promise<void> {
  const file = "examples/harbor.viva";
  const source = readFileSync(file, "utf8");
  const compiled = compileSource(source, file, { handbookIds: ["dashboard"] });
  if (!compiled.ir) throw new Error(compiled.error ?? "harbor compile");
  const ir = compiled.ir;
  const world = createSimWorld(ir);
  const frames: Uint8Array[] = [];
  const width = 800;
  const piers = asRows(world.data.piers);
  const ships = asRows(world.data.ships);

  const tick = (n: number) => {
    for (let i = 0; i < n; i++) {
      stepSimWorld(ir, world, { ticks: 1 });
      frames.push(snap(ir, world, width));
    }
  };

  tick(10);
  stepSimWorld(ir, world, {
    events: [{ type: "click", target: "piers", item: { pier: piers[1] } }],
  });
  frames.push(snap(ir, world, width));
  tick(6);

  const ship = ships[0]!;
  const fromX = Number(ship.x);
  const fromY = Number(ship.y);
  const toX = 420;
  const toY = 500;
  for (let i = 1; i <= 10; i++) {
    const t = i / 10;
    const x = fromX + (toX - fromX) * t + 27;
    const y = fromY + (toY - fromY) * t + 9;
    stepSimWorld(ir, world, {
      events: [{ type: "drag", target: "ships", item: { ship }, event: { x, y } }],
    });
    frames.push(snap(ir, world, width));
  }

  stepSimWorld(ir, world, {
    events: [{ type: "click", target: "piers", item: { pier: piers[2] } }],
  });
  frames.push(snap(ir, world, width));
  tick(8);

  const { gif, mp4 } = await stitchMovie(frames, "harbor", 10);
  console.log(`interact harbor ${frames.length}f → ${gif} ${mp4}`);
}

async function auroraMovie(): Promise<void> {
  const file = "examples/aurora.viva";
  const source = readFileSync(file, "utf8");
  const compiled = compileSource(source, file, { handbookIds: ["dashboard"] });
  if (!compiled.ir) throw new Error(compiled.error ?? "aurora compile");
  const ir = compiled.ir;
  const world = createSimWorld(ir);
  const frames: Uint8Array[] = [];
  const width = 800;
  const pca = asRows(world.data.pca);

  for (let i = 0; i < 18; i++) {
    stepSimWorld(ir, world, { ticks: 1 });
    frames.push(snap(ir, world, width));
  }
  stepSimWorld(ir, world, {
    events: [{ type: "click", target: "pcaPts", item: { p: pca[6] } }],
  });
  frames.push(snap(ir, world, width));
  for (let i = 0; i < 14; i++) {
    stepSimWorld(ir, world, { ticks: 1 });
    frames.push(snap(ir, world, width));
  }

  const { gif, mp4 } = await stitchMovie(frames, "aurora", 10);
  console.log(`interact aurora ${frames.length}f → ${gif} ${mp4}`);
}

async function nocturneInteract(): Promise<void> {
  const file = "examples/nocturne.viva";
  const source = readFileSync(file, "utf8");
  const compiled = compileSource(source, file, { handbookIds: ["print-nature"] });
  if (!compiled.ir) throw new Error(compiled.error ?? "nocturne compile");
  const ir = compiled.ir;
  const world = createSimWorld(ir);
  const frames: Uint8Array[] = [];
  const width = 720;
  const pins = asRows(world.data.pins);
  const pin = pins[0]!;

  frames.push(snap(ir, world, width));
  const path = [
    [18, 22],
    [28, 30],
    [40, 38],
    [52, 46],
    [64, 40],
    [72, 32],
  ] as const;
  for (const [x, y] of path) {
    stepSimWorld(ir, world, {
      events: [{ type: "drag", target: "pins", item: { pin }, event: { x, y } }],
    });
    frames.push(snap(ir, world, width));
  }
  const { gif, mp4 } = await stitchMovie(frames, "nocturne-hand", 8);
  console.log(`interact nocturne-hand ${frames.length}f → ${gif} ${mp4}`);
}

if (!(await ffmpegAvailable())) {
  throw new Error("ffmpeg is required to export showcase movies");
}

await still("examples/harbor.viva", "harbor", ["dashboard"], 1400);
await still("examples/aurora.viva", "aurora", ["dashboard"], 1400);
await still("examples/nocturne.viva", "nocturne", ["print-nature"], 1400);

await harborMovie();
await auroraMovie();
await clockMovie("examples/nocturne.viva", "nocturne", ["print-nature"], 720);
await nocturneInteract();
await clockMovie("examples/storyboard.viva", "reel", ["print-nature"], 640);

console.log("gallery ready");
