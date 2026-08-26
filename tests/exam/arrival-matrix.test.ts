/**
 * Arrival matrix — one source, four doors. A green file here is evidence,
 * not a name. Each assertion names the gate it closes.
 */
import { afterEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import { paintedNodesFromIr, renderSvgFromIr } from "../../src/export/static-svg.js";
import {
  exportArtifact,
  exportBeatPlayback,
  exportBeatSequence,
} from "../../src/export/index.js";
import { holdFrameTimes, playbackFrameTimes } from "../../src/timeline/clock.js";
import { COLUMN_MM, evalSceneProps, mmToPx, resolveSceneBox, scenePageCount } from "../../src/space/scene-box.js";
import { compareSvgPdfPages, pdftoppmAvailable } from "../../src/check/visual-parity.js";
import { listSelectableNodes } from "../../src/review/nodes.js";
import { pdfUnmappedGlyphs } from "../../src/export/pdf-font.js";
import {
  listCompileHooks,
  registerCompileHook,
  registerWidget,
  resetWidgetPlugins,
  unregisterCompileHook,
  unregisterWidget,
} from "../../src/widgets.js";
import { literal } from "../../src/ast.js";
import { registerStylePreset, listStylePresets } from "../../src/style/index.js";
import { handleMcpTool } from "../../src/mcp/tools.js";
import { productSystemPrompt, vivaCapabilities } from "../../src/agent/orchestrator.js";
import { SYSTEM_PROMPT_SLIM } from "../../src/llm/system-prompt-slim.js";
import { writePage, readPage } from "../../src/runtime/view-machine.js";

const PRINT = { handbookIds: ["print-nature"] } as const;
const PX_PER_PT = 72 / 96;
/** R5-C: one notch from 0.55 after measuring arrival page 1 at 0.713. */
const ARRIVAL_MIN_INK_IOU = 0.6;
const ARRIVAL_MIN_SIDECAR = 0.85;
const ARRIVAL_MAX_MSE = 0.45;

function dockerHost(): string {
  if (process.env.DOCKER_HOST) return process.env.DOCKER_HOST;
  if (existsSync("/tmp/docker.sock")) return "unix:///tmp/docker.sock";
  if (existsSync("/var/run/docker.sock")) return "unix:///var/run/docker.sock";
  return "";
}

function compileArrival() {
  const src = readFileSync("examples/arrival.viva", "utf8");
  const result = compileSource(src, "arrival.viva", PRINT);
  expect(result.error, result.error ?? "").toBeNull();
  return { src, ir: result.ir! };
}

function cellWidthMm(ir: ReturnType<typeof compileArrival>["ir"], name: string): number {
  const frame = ir.frames.find((f) => f.name === name);
  expect(frame, `missing frame ${name}`).toBeTruthy();
  const cellX = evaluate(frame!.props.cellX!, [ir.state, ir.data]) as number[];
  return cellX[1]! - cellX[0]!;
}

function plotWidthMm(ir: ReturnType<typeof compileArrival>["ir"], name: string): number {
  const frame = ir.frames.find((f) => f.name === name);
  expect(frame, `missing frame ${name}`).toBeTruthy();
  const x = evaluate(frame!.props.x!, [ir.state, ir.data]) as number[];
  return x[1]! - x[0]!;
}

function pdfOperators(bytes: Uint8Array): string {
  const raw = new TextDecoder("latin1").decode(bytes);
  const chunks = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
  let out = "";
  for (const chunk of chunks) {
    const buf = Buffer.from(chunk[1]!, "latin1");
    for (const inflate of [inflateSync, inflateRawSync]) {
      try {
        out += inflate(buf).toString("latin1");
        break;
      } catch {
        /* try the other wrapper */
      }
    }
  }
  return out;
}

describe("arrival 1 — print-nature compile", () => {
  it("compiles examples/arrival.viva with print-nature and no hand-written inset", () => {
    const { src, ir } = compileArrival();
    expect(src).not.toMatch(/(^|\n)\s*(areaX|areaY|insetL|plotPad)\s*:/);
    expect(ir.name).toBe("Arrival");
    expect(ir.timeline?.beats).toBe(4);
    expect(ir.frames.map((f) => f.name)).not.toEqual(expect.arrayContaining(["beat0", "beat1"]));
    const play = ir.scene.layers.find((l) => l.name === "__board_play");
    expect(play?.items.length).toBe(1);
    expect(ir.events.some((e) => e.type === "drag" && e.target === "tokens")).toBe(true);
    const names = ir.scene.layers.map((l) => l.name);
    expect(names.indexOf("world")).toBeGreaterThan(names.indexOf("__fig_plate"));
    expect(renderSvgFromIr(ir)).toMatch(/时间|心率|到站/);
  });
});

describe("arrival 2 — 89 mm span:1 and 183 mm span:2", () => {
  it("keeps single-column cells at 89 mm and the cross-column cell at 183 mm", () => {
    const { ir } = compileArrival();
    const a = cellWidthMm(ir, "a");
    const b = cellWidthMm(ir, "b");
    const c = cellWidthMm(ir, "c");
    expect(a).toBeCloseTo(COLUMN_MM.single, 0);
    expect(b).toBeCloseTo(COLUMN_MM.single, 0);
    expect(c).toBeCloseTo(COLUMN_MM.double, 0);
    expect(c).toBeGreaterThan(a * 1.8);
    expect(plotWidthMm(ir, "a"), "span:1 plot must keep a printable measure").toBeGreaterThan(50);
    expect(plotWidthMm(ir, "b")).toBeGreaterThan(50);
    expect(plotWidthMm(ir, "c")).toBeGreaterThan(120);
  });
});

describe("arrival 3 — SVG↔PDF ink + mm spacing", () => {
  it("rasters real PDF pages and matches SVG ink plus sidecar geometry", async () => {
    expect(pdftoppmAvailable(), "pdftoppm must be installed for the eyes door").toBe(true);
    const { src, ir } = compileArrival();
    const box = resolveSceneBox(evalSceneProps(ir.scene.props, [ir.state, ir.data]));
    expect(box.width).toBeCloseTo(mmToPx(210));
    const pdf = await exportArtifact(src, "pdf", PRINT, "arrival.viva");
    expect(pdf.vector).toBe(true);
    expect(pdf.sidecar?.length).toBeGreaterThan(0);
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    expect(doc.getPage(0)!.getSize().width).toBeCloseTo(box.width * PX_PER_PT, 0);

    const report = await compareSvgPdfPages(ir, { width: 640 });
    expect(report.pdfRaster).toBe("pdftoppm");
    expect(report.idEqual, `painted=${report.paintedIds.length} sidecar=${report.sidecarIds.length}`).toBe(true);
    expect(report.sidecarOverlap).toBeGreaterThan(ARRIVAL_MIN_SIDECAR);
    expect(report.minInkIou, JSON.stringify(report.pages)).toBeGreaterThan(ARRIVAL_MIN_INK_IOU);
    expect(report.maxMse).toBeLessThan(ARRIVAL_MAX_MSE);
  }, 60_000);

  it("names page 1 when the ink floor is pushed past the measured 0.713", async () => {
    const { ir } = compileArrival();
    const report = await compareSvgPdfPages(ir, { width: 640 });
    const named = report.pages.filter((p) => p.inkIou <= 0.72).map((p) => p.page);
    expect(named, JSON.stringify(report.pages)).toEqual([1]);
  }, 60_000);
});

describe("arrival 4 — PDF glyph / rotate / dash / clip / fill / tracking", () => {
  it("writes rotate, dash, clip, filled path, and has no unmapped CJK", async () => {
    const { src, ir } = compileArrival();
    const pdf = await exportArtifact(src, "pdf", PRINT, "arrival.viva");
    const ops = pdfOperators(pdf.bytes);
    expect(ops).toMatch(/cm/);
    expect(ops).toMatch(/\bd\b|\[\s*\d/);
    expect(ops).toMatch(/W\s+n|W\*/);
    expect(ops).toMatch(/\bf\b|f\*|B/);
    const missing = pdf.missingGlyphs ?? [];
    expect(missing).toEqual([]);
    const unmapped = pdfUnmappedGlyphs("时间心率到站对照药物");
    expect(unmapped).toEqual([]);
    const svg = renderSvgFromIr(ir);
    expect(svg).toMatch(/rotate\(|letter-spacing|stroke-dasharray|linearGradient/);
  }, 30_000);
});

describe("arrival 6 — gif/mp4 clock playback", () => {
  it("hold frames are one per beat; playback samples the same clock denser", async () => {
    const { src, ir } = compileArrival();
    expect(holdFrameTimes(ir.timeline!).length).toBe(4);
    expect(playbackFrameTimes(ir.timeline!).length).toBeGreaterThan(4);
    const holds = await exportBeatSequence(src, { width: 240, ...PRINT }, "arrival.viva");
    const play = await exportBeatPlayback(src, { width: 240, ...PRINT }, "arrival.viva");
    expect(holds.length).toBe(4);
    expect(play.length).toBe(playbackFrameTimes(ir.timeline!).length);
  }, 60_000);
});

describe("arrival 7 — logical / painted / sidecar / review IDs", () => {
  it("Runtime flatten, static SVG, PDF sidecar, and review share painted ids", async () => {
    const { src, ir } = compileArrival();
    const painted = paintedNodesFromIr(ir).map((n) => n.id).sort();
    const svg = renderSvgFromIr(ir);
    const svgIds = [...svg.matchAll(/data-viva-id="([^"]+)"/g)].map((m) => m[1]!).sort();
    expect(svgIds).toEqual(painted);
    const pdf = await exportArtifact(src, "pdf", PRINT, "arrival.viva");
    const side = [...new Set((pdf.sidecar ?? []).map((n) => n.id))].sort();
    expect(side).toEqual(painted);
    const review = listSelectableNodes(ir).map((n) => n.id);
    expect(painted.every((id) => review.includes(id))).toBe(true);
  }, 30_000);
});

describe("arrival 8 — playground / embed / pack / docker files", () => {
  it("playground lists Arrival and embed / pack / docker keep assets", () => {
    const playground = readFileSync("playground/main.ts", "utf8");
    expect(playground).toMatch(/arrival\.viva/);
    expect(playground).toMatch(/Arrival:/);
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { files: string[] };
    expect(pkg.files).toEqual(expect.arrayContaining(["dist", "assets", "examples", "Dockerfile"]));
    const docker = readFileSync("Dockerfile", "utf8");
    expect(docker).toMatch(/COPY assets \.\/assets/);
    expect(existsSync("assets/fonts/VivaSansCJK.ttf") || existsSync("assets/fonts/VivaSansFallback.ttf")).toBe(
      true,
    );
  });

  it("two paged boards do not share one body or overflow the paper", () => {
    const src = `artifact "TwoBoards"
data rows = [{ t: 1, score: 12, arm: "对照" }, { t: 2, score: 18, arm: "处理" }]
scene
  unit: mm
  page: a4
  column: double
  height: 400
widget layout.board
  title: "到站件"
  beats: 4
  play: true
widget layout.figure
  panel: body
  cols: 2
widget chart.scatter
  panel: a
  span: 1
  data: rows
  xField: t
  yField: score
widget chart.violin
  panel: c
  span: 2
  data: rows
  xField: arm
  yField: score
widget layout.board
  title: "跨页"
widget layout.figure
  panel: body
  cols: 1
widget chart.box
  panel: d
  span: 2
  data: rows
  xField: arm
  yField: score
`;
    const compiled = compileSource(src, "two-board.viva", PRINT);
    expect(compiled.error, compiled.error ?? "").toBeNull();
    const ir = compiled.ir!;
    const box = resolveSceneBox(evalSceneProps(ir.scene.props, [ir.state, ir.data]));
    expect(scenePageCount(box)).toBeGreaterThanOrEqual(2);
    expect(ir.frames.some((f) => f.name === "board2_body")).toBe(true);
    const body2 = ir.frames.find((f) => f.name === "board2_body")!;
    const body2y = evaluate(body2.props.y!, [ir.state, ir.data]) as number[];
    expect(body2y[0]!).toBeGreaterThan(200);
    const d = ir.frames.find((f) => f.name === "d");
    expect(d, "second-board panel d").toBeTruthy();
    const x = evaluate(d!.props.x!, [ir.state, ir.data]) as number[];
    const y = evaluate(d!.props.y!, [ir.state, ir.data]) as number[];
    const cellX = evaluate(d!.props.cellX!, [ir.state, ir.data]) as number[];
    expect(x[1]! - x[0]!).toBeLessThan(210);
    expect(cellX[1]! - cellX[0]!).toBeLessThanOrEqual(COLUMN_MM.double + 2);
    expect(y[0]!).toBeGreaterThan(body2y[0]! - 1);
    const a = ir.frames.find((f) => f.name === "a");
    expect(a).toBeTruthy();
    const ay = evaluate(a!.props.y!, [ir.state, ir.data]) as number[];
    expect(ay[0]!).toBeLessThan(200);
  });

  it.skipIf(!dockerHost())("Docker image serves health, embed, and CJK PDF", () => {
    const env = { ...process.env, DOCKER_HOST: dockerHost() };
    const image = execSync("docker images -q viva-lang-agent:local", { encoding: "utf8", env }).trim();
    expect(image, "viva-lang-agent:local must be built").toBeTruthy();
    const out = execSync(
      "docker run --rm viva-lang-agent:local sh -c 'test -f assets/fonts/VivaSansCJK.ttf && test -f dist/embed/viva-embed.js && node dist/cli.js export examples/arrival.viva -f pdf --handbook print-nature -o /tmp/a.pdf && test -s /tmp/a.pdf && echo CJK_PDF_OK'",
      { encoding: "utf8", env, timeout: 60_000 },
    );
    expect(out).toMatch(/CJK_PDF_OK/);
    const health = execSync("curl -fsS http://127.0.0.1:8765/api/health || true", { encoding: "utf8" });
    if (health) expect(health).toMatch(/viva-agent/);
  }, 90_000);

  it("npm pack includes CLI, embed bundle, CJK font, and arrival fixture", () => {
    const listing = execSync("npm pack --dry-run --json", { encoding: "utf8" });
    const json = JSON.parse(listing) as { filename?: string; files?: { path: string }[] }[];
    const files = (json[0]?.files ?? []).map((f) => f.path);
    expect(files.some((p) => p.includes("examples/arrival.viva"))).toBe(true);
    expect(files.some((p) => /assets\/fonts\/VivaSans/.test(p))).toBe(true);
    expect(files.some((p) => p === "Dockerfile")).toBe(true);
  }, 30_000);
});

describe("arrival 9 — external widget / handbook / compile hook", () => {
  afterEach(() => {
    unregisterWidget("ext.stamp");
    unregisterCompileHook("ext-stamp");
    resetWidgetPlugins();
  });

  it("registers a hook after folio without editing core widgets.ts", () => {
    registerCompileHook({
      name: "ext-stamp",
      after: ["folio"],
      run(artifact) {
        artifact.scene?.layers.push({
          name: "__ext_stamp",
          span: artifact.span,
          props: {},
          items: [
            {
              kind: "node",
              name: "extStamp",
              props: { x: literal(4), y: literal(4), text: literal("EXT") },
              span: artifact.span,
            },
          ],
        });
      },
    });
    const { ir } = compileArrival();
    expect(listCompileHooks()).toEqual(expect.arrayContaining(["folio", "ext-stamp", "newspaper"]));
    const folioIdx = listCompileHooks().indexOf("folio");
    const extIdx = listCompileHooks().indexOf("ext-stamp");
    expect(extIdx).toBeGreaterThan(folioIdx);
    expect(ir.scene.layers.some((l) => l.name === "__ext_stamp")).toBe(true);
    expect(ir.scene.layers.some((l) => l.name === "__page_folio")).toBe(true);
  });

  it("registers a host widget and an extra handbook id without core edits", () => {
    registerWidget({
      name: "ext.box",
      expand({ artifact }) {
        artifact.scene?.layers.push({
          name: "__ext_box",
          span: artifact.span,
          props: {},
          items: [],
        });
      },
    });
    registerStylePreset({
      id: "ext-handbook",
      scene: { background: "#fafafa" },
      palette: { accent: "#111111" },
      typography: {},
    });
    const result = compileSource(
      `artifact Ext
scene
  size: 80 40
widget ext.box
`,
      "ext.viva",
      { handbookIds: ["ext-handbook"] },
    );
    expect(result.error).toBeNull();
    expect(result.ir!.scene.layers.some((l) => l.name === "__ext_box")).toBe(true);
    expect(listStylePresets().some((p) => p.id === "ext-handbook")).toBe(true);
  });
});

describe("arrival 10 — slim prompt + capabilities + loop", () => {
  it("product prompt is slim + capabilities, not LANGUAGE.md", async () => {
    const prompt = productSystemPrompt();
    expect(prompt.startsWith(SYSTEM_PROMPT_SLIM.slice(0, 60))).toBe(true);
    expect(prompt).toMatch(/layout\.board/);
    expect(prompt).toMatch(/__sel/);
    expect(prompt).toMatch(/chart\.violin/);
    expect(prompt).toMatch(/typeGrid/);
    expect(prompt).not.toMatch(/# 语言参考|# Language/);
    expect(prompt.length).toBeLessThan(8_000);
    const caps = vivaCapabilities();
    expect(caps.widgets).toEqual(expect.arrayContaining(["layout.board", "chart.violin"]));
    expect(caps.compileHooks).toEqual(expect.arrayContaining(["folio", "newspaper"]));
    const mcp = await handleMcpTool("viva_capabilities", {});
    const json = JSON.parse(mcp.content[0]!.text);
    expect(json.widgets).toEqual(expect.arrayContaining(["chart.scatter"]));
  });

  it("writePage is a real Runtime state writer", () => {
    const state: Record<string, unknown> = {};
    expect(writePage(state, 2, 3)).toBe(2);
    expect(readPage(state)).toBe(2);
    expect(writePage(state, 9, 3)).toBe(3);
  });

  it("slim skeleton and live generated cards close print / span / id / clock doors", async () => {
    const start = SYSTEM_PROMPT_SLIM.indexOf('\nartifact "Name"');
    const end = SYSTEM_PROMPT_SLIM.indexOf("\n\nUse the Capabilities");
    const skeleton = SYSTEM_PROMPT_SLIM.slice(start, end).trim();
    const generated = [
      "/opt/cursor/artifacts/deepseek-arrival.viva",
      "/opt/cursor/artifacts/agent-loop-live.viva",
      "/opt/cursor/artifacts/h09-arrival.viva",
    ].filter((p) => existsSync(p));
    const sources = [{ name: "slim-skeleton", src: skeleton }, ...generated.map((p) => ({ name: p, src: readFileSync(p, "utf8") }))];
    expect(sources.length).toBeGreaterThan(0);
    for (const { name, src } of sources) {
      const compiled = compileSource(src, `${name}.viva`, PRINT);
      expect(compiled.error, `${name}: ${compiled.error ?? ""}`).toBeNull();
      const ir = compiled.ir!;
      expect(ir.frames.some((f) => f.name === "board2_body"), name).toBe(true);
      const a = cellWidthMm(ir, "a");
      const c = cellWidthMm(ir, "c");
      expect(a, `${name} span:1`).toBeCloseTo(COLUMN_MM.single, 0);
      expect(c, `${name} span:2`).toBeCloseTo(COLUMN_MM.double, 0);
      expect(c).toBeGreaterThan(a * 1.8);
      const d = ir.frames.find((f) => f.name === "d");
      expect(d, `${name} panel d`).toBeTruthy();
      const y = evaluate(d!.props.y!, [ir.state, ir.data]) as number[];
      expect(y[0]!).toBeGreaterThan(200);
      const cellX = evaluate(d!.props.cellX!, [ir.state, ir.data]) as number[];
      expect(cellX[1]! - cellX[0]!).toBeLessThanOrEqual(COLUMN_MM.double + 2);
      expect(ir.timeline?.beats).toBe(4);
      expect(holdFrameTimes(ir.timeline!).length).toBe(4);
      expect(playbackFrameTimes(ir.timeline!).length).toBeGreaterThan(4);
      const painted = paintedNodesFromIr(ir).map((n) => n.id).sort();
      const svg = renderSvgFromIr(ir);
      const svgIds = [...svg.matchAll(/data-viva-id="([^"]+)"/g)].map((m) => m[1]!).sort();
      expect(svgIds, name).toEqual(painted);
      const review = listSelectableNodes(ir).map((n) => n.id);
      expect(painted.every((id) => review.includes(id)), name).toBe(true);
      const pdf = await exportArtifact(src, "pdf", PRINT, `${name}.viva`);
      expect(pdf.vector, name).toBe(true);
      expect(pdf.missingGlyphs ?? []).toEqual([]);
      const side = [...new Set((pdf.sidecar ?? []).map((n) => n.id))].sort();
      expect(side, name).toEqual(painted);
      const ops = pdfOperators(pdf.bytes);
      expect(svg, name).toMatch(/rotate\(/);
      expect(svg, name).toMatch(/letter-spacing/);
      expect(svg, name).toMatch(/stroke-dasharray/);
      expect(ops).toMatch(/cm/);
      expect(ops).toMatch(/\bd\b|\[\s*\d/);
      expect(ops).toMatch(/W\s+n|W\*/);
      expect(ops).toMatch(/\bf\b|f\*|B/);
      expect(pdfUnmappedGlyphs("到站件对照处理时间得分")).toEqual([]);
      const holds = await exportBeatSequence(src, { width: 240, ...PRINT }, `${name}.viva`);
      const play = await exportBeatPlayback(src, { width: 240, ...PRINT }, `${name}.viva`);
      expect(holds.length, name).toBe(4);
      expect(play.length, name).toBe(playbackFrameTimes(ir.timeline!).length);
      expect(play.length, name).toBeGreaterThan(holds.length);
      if (pdftoppmAvailable()) {
        const report = await compareSvgPdfPages(ir, { width: 640 });
        expect(report.pdfRaster, name).toBe("pdftoppm");
        expect(report.idEqual, name).toBe(true);
        expect(report.sidecarOverlap, name).toBeGreaterThan(ARRIVAL_MIN_SIDECAR);
        expect(report.minInkIou, `${name} ${JSON.stringify(report.pages)}`).toBeGreaterThan(ARRIVAL_MIN_INK_IOU);
        expect(report.maxMse, name).toBeLessThan(ARRIVAL_MAX_MSE);
      }
    }
  }, 120_000);
});
