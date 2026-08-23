import { describe, expect, it } from "vitest";
import { copyFileSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileSource } from "../../src/pipeline.js";
import { renderSvgFromIr } from "../../src/export/static-svg.js";
import { exportArtifact } from "../../src/export/index.js";
import { domainMap, domainUnmap, scalesFromFrameProps } from "../../src/space.js";
import { resolveCjkFontPath } from "../../src/export/pdf-font.js";
import { flattenNodesFromIr } from "../../src/export/static-svg.js";
import { evaluate, truthy } from "../../src/eval.js";
import { mmToPx, resolveSceneBox, scenePageCount, viewBoxToScene, COLUMN_MM, PAGE_MM } from "../../src/space/scene-box.js";
import { PDFDocument } from "pdf-lib";
import { handleMcpTool } from "../../src/mcp/tools.js";
import { SYSTEM_PROMPT_SLIM } from "../../src/llm/system-prompt-slim.js";
import { simulate } from "../../src/simulate.js";
import { applySelSummary } from "../../src/layout/summary-stats.js";

describe("vision pillars: board, mm, log, hover object, CJK pdf", () => {
  it("layout.board creates safe/title/body/lower frames", () => {
    const src = readFileSync("examples/board.viva", "utf8");
    expect(src).not.toMatch(/safe:|titleH:|lowerH:|node headline|node lowerThird/);
    const result = compileSource(src, "board.viva");
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["safe", "title", "body", "lower"]),
    );
    expect(result.ir!.scene.layers.some((l) => l.name === "__board_guides")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__body_marks")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__board_copy")).toBe(true);
  });

  it("resolves unit: mm and single-column 89 mm to CSS px", () => {
    const box = resolveSceneBox({ unit: "mm", column: "single", height: 68 });
    expect(box.column).toBe("single");
    expect(box.width).toBeCloseTo(mmToPx(COLUMN_MM.single));
    expect(box.height).toBeCloseTo(mmToPx(68));
    const paperSrc = readFileSync("examples/paper-column.viva", "utf8");
    expect(paperSrc).not.toMatch(/areaX|areaY/);
    const paper = compileSource(paperSrc, "paper.viva");
    expect(paper.error).toBeNull();
    expect(evaluate(paper.ir!.frames[0]!.props.xScale!, [paper.ir!.state, paper.ir!.data])).toBe(
      "log",
    );
    const svg = renderSvgFromIr(paper.ir!);
    expect(svg).toMatch(/viewBox="0 0 336/);
  });

  it("sizes an omitted A4 page and slices a tall column into two PDF pages", async () => {
    const sheet = resolveSceneBox({ unit: "mm", page: "a4" });
    expect(sheet.page?.name).toBe("a4");
    expect(sheet.width).toBeCloseTo(mmToPx(PAGE_MM.a4.w));
    expect(sheet.height).toBeCloseTo(mmToPx(PAGE_MM.a4.h));
    expect(scenePageCount(sheet)).toBe(1);
    const tall = resolveSceneBox({ unit: "mm", page: "a4", column: "single", height: 400 });
    expect(tall.width).toBeCloseTo(mmToPx(PAGE_MM.a4.w));
    expect(tall.height).toBeCloseTo(mmToPx(400));
    expect(scenePageCount(tall)).toBe(2);
    const src = readFileSync("examples/paper-pages.viva", "utf8");
    expect(src).not.toMatch(/insetL|areaX|areaY/);
    const pdf = await exportArtifact(src, "pdf", { handbookIds: ["print-nature"] }, "paper-pages.viva");
    expect(pdf.vector).toBe(true);
    const doc = await PDFDocument.load(pdf.bytes);
    expect(doc.getPageCount()).toBe(2);
    const size = doc.getPage(0)!.getSize();
    expect(size.height).toBeCloseTo(mmToPx(PAGE_MM.a4.h) * (72 / 96), 0);
    expect(size.width).toBeCloseTo(mmToPx(PAGE_MM.a4.w) * (72 / 96), 0);
    const compiled = compileSource(src, "paper-pages.viva", { handbookIds: ["print-nature"] });
    expect(compiled.error).toBeNull();
    const scopes = [compiled.ir!.state, compiled.ir!.data];
    const cellA = evaluate(compiled.ir!.frames.find((f) => f.name === "a")!.props.cellY!, scopes) as [
      number,
      number,
    ];
    const cellB = evaluate(compiled.ir!.frames.find((f) => f.name === "b")!.props.cellY!, scopes) as [
      number,
      number,
    ];
    expect(cellA[1]).toBeLessThanOrEqual(PAGE_MM.a4.h - 4);
    expect(cellB[0]).toBeGreaterThanOrEqual(PAGE_MM.a4.h);
    expect(cellB[1]).toBeLessThanOrEqual(PAGE_MM.a4.h * 2);
    const folio = compiled.ir!.scene.layers.find((l) => l.name === "__page_folio");
    expect(folio).toBeTruthy();
    const folioTexts = folio!.items
      .filter((i) => i.kind === "node")
      .map((i) => (i.kind === "node" ? evaluate(i.props.text, [compiled.ir!.state, compiled.ir!.data]) : ""));
    expect(folioTexts).toEqual([
      "1 / 2",
      "2 / 2",
      "Single-column 89 mm on A4, two slices (continued)",
    ]);
    const sheetSrc = `artifact Sheet
scene
  unit: mm
  page: a4
  background: #ffffff
`;
    const one = compileSource(sheetSrc, "sheet.viva");
    expect(one.error).toBeNull();
    expect(one.ir!.scene.layers.some((l) => l.name === "__page_folio")).toBe(false);
  });

  it("maps log scales through domainMap", () => {
    const y = domainMap(10, [1, 100], [400, 40], true, "log");
    const mid = domainMap(10, [1, 100], [40, 400], false, "log");
    expect(mid).toBeCloseTo(220);
    expect(y).toBeCloseTo(220);
    const scales = scalesFromFrameProps("p", {
      x: [0, 100],
      y: [0, 100],
      xlim: [1, 100],
      ylim: [1, 100],
      xScale: "log",
      yScale: "log",
    });
    expect(scales.xScale).toBe("log");
  });

  it("emits structured __hover, brush, and cross-panel highlight state", () => {
    const result = compileSource(
      `artifact H
data series = [{ x: 1, y: 2, grp: "A" }, { x: 2, y: 4, grp: "B" }]
scene
  size: 400 240
widget chart.scatter
  data: series
  xField: x
  yField: y
  group: grp
  xlim: 0 3
  ylim: 0 5
  areaX: 40 360
  areaY: 30 200
`,
      "h.viva",
    );
    expect(result.error).toBeNull();
    expect(Object.keys(result.ir!.state).sort()).toEqual(
      expect.arrayContaining([
        "__brush",
        "__highlightGrp",
        "__hover",
        "__sel",
        "__tip",
        "__tipX",
        "__tipY",
      ]),
    );
    expect(result.ir!.events.some((e) => e.type === "hover" && e.target === "mark")).toBe(true);
    expect(result.ir!.events.some((e) => e.type === "dragstart")).toBe(true);
    const hover = result.ir!.events.find((e) => e.type === "hover")!;
    expect(hover.body.some((s) => s.kind === "assign" && s.target[0] === "__hover")).toBe(true);
    expect(hover.body.some((s) => s.kind === "assign" && s.target[0] === "__highlightGrp")).toBe(true);
    expect(hover.body.some((s) => s.kind === "assign" && s.target[0] === "__tipX")).toBe(true);
  });

  it("keeps paper-cjk live: follow-cursor tip in scene millimetres", () => {
    for (const file of [
      "paper-cjk.viva",
      "paper-column.viva",
      "figure-grid.viva",
      "figure-span.viva",
      "box.viva",
      "violin.viva",
      "time-axis.viva",
      "brackets.viva",
      "paper-pages.viva",
      "paper-spread.viva",
    ]) {
      expect(readFileSync(`examples/${file}`, "utf8")).not.toMatch(/interactive:\s*false/);
    }
    const src = readFileSync("examples/paper-cjk.viva", "utf8");
    const result = compileSource(src, "paper-cjk.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    expect(Object.keys(result.ir!.state)).toEqual(
      expect.arrayContaining(["__tip", "__tipX", "__tipY", "__hover", "__brush"]),
    );
    expect(viewBoxToScene(mmToPx(89), mmToPx(68), mmToPx(1)).x).toBeCloseTo(89);
    const world = simulate(result.ir!, {
      events: [
        {
          type: "hover",
          target: "mark",
          event: { x: 40, y: 28 },
          item: { x: 2, y: 18.4 },
        },
      ],
    });
    expect(world.state.__tip).toBe("2, 18.4");
    expect(world.state.__tipX).toBe(40);
    expect(world.state.__tipY).toBe(28);
    const tip = result.ir!.scene.layers
      .find((l) => l.name === "__chart_hud")
      ?.items.find((i) => i.kind === "node" && i.name === "chartTip");
    expect(tip?.kind).toBe("node");
    if (tip?.kind === "node") {
      const x = evaluate(tip.props.x!, [world.state]);
      const y = evaluate(tip.props.y!, [world.state]);
      expect(x).toBeGreaterThan(40);
      expect(x).toBeLessThan(89);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(28);
      expect(truthy(evaluate(tip.props.visible!, [{ __tip: "" }]))).toBe(false);
      expect(truthy(evaluate(tip.props.visible!, [world.state]))).toBe(true);
    }
    const svg = renderSvgFromIr(result.ir!);
    expect(svg).not.toMatch(/>2, 18\.4</);
  });

  it("keeps a page-2 mm tip on the second A4 slice", () => {
    const src = readFileSync("examples/paper-pages.viva", "utf8");
    const result = compileSource(src, "paper-pages.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    expect(result.ir!.events.some((e) => e.type === "hover" && e.target === "box")).toBe(true);
    const folio = result.ir!.scene.layers.find((l) => l.name === "__page_folio");
    expect(folio).toBeTruthy();
    expect(
      folio!.items.some((i) => i.kind === "node" && i.name.startsWith("__page_folio")),
    ).toBe(true);
    const world = simulate(result.ir!, {
      events: [
        {
          type: "hover",
          target: "box",
          event: { x: 40, y: 320 },
          item: { arm: "placebo", y: 12 },
        },
      ],
    });
    expect(world.state.__tip).toBe("placebo, 12");
    expect(world.state.__tipX).toBe(40);
    expect(world.state.__tipY).toBe(320);
    const tip = result.ir!.scene.layers
      .find((l) => l.name === "__chart_hud")
      ?.items.find((i) => i.kind === "node" && i.name === "chartTip");
    expect(tip?.kind).toBe("node");
    if (tip?.kind === "node") {
      const y = evaluate(tip.props.y!, [world.state]) as number;
      expect(y).toBeGreaterThanOrEqual(PAGE_MM.a4.h);
      expect(y).toBeLessThan(400);
      const slipped = evaluate(tip.props.y!, [{ __tipY: 300 }]) as number;
      expect(slipped).toBeGreaterThanOrEqual(PAGE_MM.a4.h);
    }
  });

  it("lets a host CJK font win over the bundled subset", () => {
    const bundled = resolveCjkFontPath();
    expect(bundled).toMatch(/VivaSansFallback\.ttf$/);
    const host = join(tmpdir(), `viva-host-cjk-${process.pid}.ttf`);
    copyFileSync(bundled!, host);
    const prev = process.env.VIVA_PDF_CJK_FONT;
    try {
      expect(resolveCjkFontPath({ fontPath: host })).toBe(host);
      process.env.VIVA_PDF_CJK_FONT = host;
      expect(resolveCjkFontPath()).toBe(host);
      process.env.VIVA_PDF_CJK_FONT = "/no/such/viva-cjk.ttf";
      expect(resolveCjkFontPath()).toMatch(/VivaSansFallback\.ttf$/);
      expect(resolveCjkFontPath({ fontPath: "/no/such/viva-cjk.ttf" })).toMatch(
        /VivaSansFallback\.ttf$/,
      );
    } finally {
      if (prev === undefined) delete process.env.VIVA_PDF_CJK_FONT;
      else process.env.VIVA_PDF_CJK_FONT = prev;
      unlinkSync(host);
    }
  });

  it("embeds CJK in vector PDF instead of replacing with ?", async () => {
    expect(resolveCjkFontPath()).toMatch(/VivaSansFallback\.ttf$/);
    const { PDFDocument } = await import("pdf-lib");
    const { embedPdfFonts, pdfSafeText, pickPdfFont } = await import(
      "../../src/export/pdf-font.js"
    );
    const doc = await PDFDocument.create();
    const fonts = await embedPdfFonts(doc);
    expect(fonts.hasCjk).toBe(true);
    const phrases = [
      "模型负责意图，编译器负责复杂性",
      "点击数字 +1",
      "摘要",
      "方法",
      "结果",
      "点击上方章节切换交互论文内容",
      "时间 (周)",
      "心率 (次每分)",
      "单栏投稿图",
      "多面板综合图",
      "虚拟临床队列",
      "图文排版 · 科学图板",
      "栏宽是度量，纸页是刀口",
    ];
    for (const phrase of phrases) {
      expect(pdfSafeText(pickPdfFont(fonts, phrase), phrase)).toBe(phrase);
    }
    const exampleHan = new Set<string>();
    for (const file of readdirSync("examples").filter((name) => name.endsWith(".viva"))) {
      for (const ch of readFileSync(join("examples", file), "utf8")) {
        if (ch >= "\u4e00" && ch <= "\u9fff") exampleHan.add(ch);
      }
    }
    expect(exampleHan.size).toBeGreaterThan(80);
    expect([...exampleHan].filter((ch) => pdfSafeText(fonts.rich, ch) !== ch)).toEqual([]);
    const src = readFileSync("examples/paper-cjk.viva", "utf8");
    const pdf = await exportArtifact(src, "pdf", {}, "paper-cjk.viva");
    const text = Buffer.from(pdf.bytes).toString("latin1");
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).not.toMatch(/\?{8,}/);
    expect(pdf.bytes.byteLength).toBeGreaterThan(2000);
  }, 30_000);

  it("defaults MCP prompt to slim", async () => {
    const out = await handleMcpTool("viva_prompt", { handbookIds: [] });
    expect(out.content[0]!.text.startsWith(SYSTEM_PROMPT_SLIM.slice(0, 40))).toBe(true);
    const full = await handleMcpTool("viva_prompt", { variant: "full", handbookIds: [] });
    expect(full.content[0]!.text).toContain("Minimal template");
  });

  it("maps categorical / band values and inverts brush into the data domain", () => {
    const mid = domainMap(1, [-0.5, 2.5], [40, 340], false, "band");
    expect(mid).toBeCloseTo(190);
    expect(domainUnmap(190, [-0.5, 2.5], [40, 340], false, "band")).toBeCloseTo(1);
    const logScene = domainMap(10, [1, 100], [40, 400], false, "log");
    expect(domainUnmap(logScene, [1, 100], [40, 400], false, "log")).toBeCloseTo(10);
    const scales = scalesFromFrameProps("p", {
      x: [0, 300],
      y: [0, 200],
      xlim: [-0.5, 2.5],
      ylim: [0, 80],
      xScale: "band",
      xCats: ["placebo", "drug-A", "drug-B"],
    });
    expect(scales.xScale).toBe("band");
    expect(scales.xCats).toEqual(["placebo", "drug-A", "drug-B"]);
  });

  it("places grouped legends outside the plot and encodes string categories", () => {
    const src = readFileSync("examples/category-legend.viva", "utf8");
    expect(src).not.toMatch(/areaX|areaY/);
    const result = compileSource(src, "category-legend.viva", {
      handbookIds: ["print-nature"],
    });
    expect(result.error).toBeNull();
    const ir = result.ir!;
    const frame = ir.frames[0]!;
    expect(evaluate(frame.props.xScale!, [ir.state, ir.data])).toBe("band");
    const cats = evaluate(frame.props.xCats!, [ir.state, ir.data]);
    expect(cats).toEqual(["placebo", "drug-A", "drug-B"]);
    const rows = ir.data.arms as { __bandX?: number }[];
    expect(rows.map((r) => r.__bandX)).toEqual([0, 1, 2, 0, 1, 2]);
    const flat = flattenNodesFromIr(ir);
    const plot = flat.nodes.find((n) => n.name.endsWith("_plotBg"));
    const legend = flat.nodes.find((n) => /_leg_0$/.test(n.name));
    expect(plot).toBeTruthy();
    expect(legend).toBeTruthy();
    const plotRight = Number(plot!.props.x) + Number(plot!.props.w);
    expect(Number(legend!.props.x)).toBeGreaterThan(plotRight);
    const drag = ir.events.find((e) => e.type === "dragstart");
    expect(drag?.body.some((s) => s.kind === "assign" && s.target[1] === "dx0")).toBe(true);

    const brushed = compileSource(
      `artifact B
data series = [{ x: 1, y: 2 }, { x: 5, y: 8 }]
scene
  size: 400 240
widget chart.scatter
  data: series
  xField: x
  yField: y
  xlim: 0 10
  ylim: 0 10
  areaX: 0 200
  areaY: 0 200
`,
      "brush.viva",
    );
    expect(brushed.error).toBeNull();
    const world = simulate(brushed.ir!, {
      events: [
        {
          type: "dragstart",
          target: "__chart_1_plotBg",
          event: { x: 40, y: 160 },
        },
        {
          type: "drag",
          target: "__chart_1_plotBg",
          event: { x: 160, y: 40 },
        },
      ],
    });
    const brush = world.state.__brush as {
      on: number;
      dx0: number;
      dy0: number;
      dx1: number;
      dy1: number;
    };
    expect(brush.on).toBe(1);
    expect(brush.dx0).toBeCloseTo(2);
    expect(brush.dy0).toBeCloseTo(2);
    expect(brush.dx1).toBeCloseTo(8);
    expect(brush.dy1).toBeCloseTo(8);
  });

  it("expands Atlas (e)(f) through chart.vector / chart.funnel plugins", () => {
    const src = readFileSync("examples/figure-atlas.viva", "utf8");
    const result = compileSource(src, "figure-atlas.viva", {
      handbookIds: ["print-nature"],
    });
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["a", "b", "c", "d", "e", "f"]),
    );
    expect(result.ir!.scene.layers.some((l) => l.name === "__e_marks")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__f_marks")).toBe(true);
    const fFrame = result.ir!.frames.find((f) => f.name === "f")!;
    expect(evaluate(fFrame.props.yScale!, [result.ir!.state, result.ir!.data])).toBe("band");
  });

  it("links brush across panels that share xField and isolates the rest", () => {
    const result = compileSource(
      `artifact L
data left = [{ t: 1, y: 2 }, { t: 5, y: 8 }]
data right = [{ t: 1, y: 4 }, { t: 5, y: 9 }]
data other = [{ z: 1, y: 2 }]
scene
  size: 600 240
widget layout.figure
  x: 0
  y: 0
  w: 600
  h: 240
  cols: 2
  rows: 1
  labels: false
widget chart.scatter
  panel: a
  data: left
  xField: t
  yField: y
  xlim: 0 10
  ylim: 0 10
widget chart.scatter
  panel: b
  data: right
  xField: t
  yField: y
  xlim: 0 10
  ylim: 0 10
`,
      "link.viva",
    );
    expect(result.error).toBeNull();
    const start = result.ir!.events.find(
      (e) => e.type === "dragstart" && e.target === "a_plotBg",
    );
    expect(start?.body.some((s) => s.kind === "assign" && s.target[1] === "xField")).toBe(
      true,
    );
    const marks = result.ir!.scene.layers.find((l) => l.name === "__b_marks")!;
    const forItem = marks.items.find((i) => i.kind === "for");
    expect(forItem?.kind).toBe("for");
    if (forItem?.kind === "for") {
      const mark = forItem.body[0];
      expect(mark?.kind).toBe("node");
      if (mark?.kind === "node") {
        const src = JSON.stringify(mark.props.opacity);
        expect(src).toContain('["__brush","xField"]');
        expect(src).toContain('["__brush","frame"]');
      }
    }
  });

  it("parses ISO dates as a time axis and formats month ticks", () => {
    const src = readFileSync("examples/time-axis.viva", "utf8");
    expect(src).not.toMatch(/areaX|areaY/);
    const result = compileSource(src, "time-axis.viva");
    expect(result.error).toBeNull();
    const frame = result.ir!.frames[0]!;
    expect(evaluate(frame.props.xScale!, [result.ir!.state, result.ir!.data])).toBe("time");
    const rows = result.ir!.data.visits as { __timeX?: number }[];
    expect(rows[0]?.__timeX).toBe(Date.parse("2024-01-07"));
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const labels = axes.items
      .filter((i) => i.kind === "node" && i.name.includes("_xtick_"))
      .map((i) => (i.kind === "node" ? evaluate(i.props.text, [{}, {}]) : ""));
    expect(labels.some((t) => String(t).includes("2024-") || String(t).includes("/"))).toBe(
      true,
    );
  });

  it("layout.board beats cut a storyboard strip", () => {
    const src = readFileSync("examples/storyboard.viva", "utf8");
    expect(src).not.toMatch(/safe:|titleH:|lowerH:|node headline|node lowerThird/);
    const result = compileSource(src, "storyboard.viva");
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["safe", "title", "body", "lower", "beat0", "beat3"]),
    );
    expect(result.ir!.scene.layers.some((l) => l.name === "__beat0_marks")).toBe(true);
    const layerNames = result.ir!.scene.layers.map((l) => l.name);
    expect(layerNames).toContain("__board_play");
    expect(layerNames.indexOf("__board_play")).toBeGreaterThan(layerNames.indexOf("__beat0_marks"));
    expect(Object.keys(result.ir!.state)).toContain("__beat");
    expect(result.ir!.ticks.length).toBeGreaterThan(0);
    const world = simulate(result.ir!, { ticks: 1 });
    expect(world.state.__beat).toBe(1);
    const after = simulate(result.ir!, { ticks: 4 });
    expect(after.state.__beat).toBe(0);
    const play = result.ir!.scene.layers.find((l) => l.name === "__board_play")!;
    const veil0 = play.items.find((i) => i.kind === "node" && i.name === "board_veil_0");
    expect(veil0?.kind).toBe("node");
    if (veil0?.kind === "node") {
      expect(evaluate(veil0.props.visible!, [{ __beat: 0 }])).toBe(false);
      expect(evaluate(veil0.props.visible!, [{ __beat: 1 }])).toBe(true);
    }
    expect(src).not.toMatch(/interactive:\s*false/);
    expect(result.ir!.events.some((e) => e.type === "hover")).toBe(true);
    expect(result.ir!.events.some((e) => e.type === "drag")).toBe(true);
  });

  it("hides box and violin summaries that are outside __sel keys", () => {
    const box = compileSource(readFileSync("examples/box.viva", "utf8"), "box.viva");
    expect(box.error).toBeNull();
    const marks = box.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    const firstBox = marks.items.find((i) => i.kind === "node" && i.name === "box");
    expect(firstBox?.kind).toBe("node");
    if (firstBox?.kind === "node") {
      expect(firstBox.props.visible).toBeDefined();
      const keep = evaluate(firstBox.props.visible, [
        { __sel: { n: 1, keys: ["placebo"] }, __brush: { frame: "other" } },
      ]);
      const drop = evaluate(firstBox.props.visible, [
        { __sel: { n: 1, keys: ["drug-A"] }, __brush: { frame: "other" } },
      ]);
      expect(keep).toBe(true);
      expect(drop).toBe(false);
    }
    const violin = compileSource(readFileSync("examples/violin.viva", "utf8"), "vl.viva");
    const vMarks = violin.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    const firstViolin = vMarks.items.find((i) => i.kind === "node" && i.name === "violin");
    expect(firstViolin?.kind).toBe("node");
    if (firstViolin?.kind === "node") {
      expect(JSON.stringify(firstViolin.props.visible)).toContain("__sel");
    }
  });

  it("recomputes a box from visit keys in __sel instead of hiding the arm", () => {
    const result = compileSource(
      readFileSync("examples/linked-summary.viva", "utf8"),
      "linked-summary.viva",
    );
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name === "__b_marks")!;
    const boxNode = marks.items.find((i) => i.kind === "node" && i.name === "box");
    expect(boxNode?.kind).toBe("node");
    if (boxNode?.kind !== "node") return;
    const data = result.ir!.data as Record<string, unknown>;
    const raw = {
      __boxData: "rows",
      __boxKey: "placebo",
      __boxXField: "arm",
      __boxYField: "score",
      __boxCats: ["placebo", "drug-A", "drug-B"],
      __boxPart: "body",
      __chartBox: true,
      frame: "b",
      q1: 11,
      y: 14,
    };
    const visit = applySelSummary(raw, {
      data,
      state: { __sel: { n: 1, keys: [1] }, __brush: { frame: "a" } },
    });
    expect(visit.visible).toBe(true);
    expect(visit.q1).toBe(12);
    expect(visit.y).toBe(12);
    const other = applySelSummary(raw, {
      data,
      state: { __sel: { n: 1, keys: ["drug-A"] }, __brush: { frame: "a" } },
    });
    expect(other.visible).toBe(false);
  });

  it("recomputes a violin density from visit keys in __sel instead of hiding the arm", () => {
    const result = compileSource(
      readFileSync("examples/linked-summary.viva", "utf8"),
      "linked-summary.viva",
    );
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name === "__c_marks")!;
    const violinNode = marks.items.find((i) => i.kind === "node" && i.name === "violin");
    expect(violinNode?.kind).toBe("node");
    if (violinNode?.kind === "node") {
      expect(violinNode.props.__violinData).toMatchObject({ kind: "string", value: "rows" });
      expect(violinNode.props.__violinPart).toMatchObject({ kind: "string", value: "shape" });
    }
    const data = result.ir!.data as Record<string, unknown>;
    const raw = {
      __violinData: "rows",
      __violinKey: "placebo",
      __violinXField: "arm",
      __violinYField: "score",
      __violinCats: ["placebo", "drug-A", "drug-B"],
      __violinPart: "shape",
      __violinFrame: "c",
      __violinCx: 100,
      __violinYmin: 8,
      __violinYmax: 28,
      __violinPy0: 40,
      __violinPy1: 320,
      __violinYScale: "linear",
      __violinHalf: 20,
      d: "M 0,0 Z",
      frame: undefined,
    };
    const visit = applySelSummary(raw, {
      data,
      state: { __sel: { n: 1, keys: [1] }, __brush: { frame: "a" } },
    });
    expect(visit.visible).toBe(true);
    expect(String(visit.d)).toMatch(/^M /);
    expect(visit.d).not.toBe("M 0,0 Z");
    const med = applySelSummary(
      { ...raw, __violinPart: "med", y1: 13, y2: 13 },
      { data, state: { __sel: { n: 1, keys: [1] }, __brush: { frame: "a" } } },
    );
    expect(med.y1).toBe(12);
    expect(med.y2).toBe(12);
    const other = applySelSummary(raw, {
      data,
      state: { __sel: { n: 1, keys: ["drug-A"] }, __brush: { frame: "a" } },
    });
    expect(other.visible).toBe(false);
    const ownBrush = applySelSummary(raw, {
      data,
      state: { __sel: { n: 1, keys: [1] }, __brush: { frame: "c" } },
    });
    expect(ownBrush.d).toBe("M 0,0 Z");
  });

  it("keeps source category keys on band-axis box/violin so visit 1 is not drug-A", () => {
    const result = compileSource(
      readFileSync("examples/linked-summary.viva", "utf8"),
      "linked-summary.viva",
    );
    expect(result.error).toBeNull();
    const boxMarks = result.ir!.scene.layers.find((l) => l.name === "__b_marks")!;
    const boxNode = boxMarks.items.find((i) => i.kind === "node" && i.name === "box");
    expect(boxNode?.kind).toBe("node");
    if (boxNode?.kind !== "node") return;
    expect(boxNode.props.__boxKey).toMatchObject({ kind: "string", value: "placebo" });
    expect(boxNode.props.__boxXField).toMatchObject({ kind: "string", value: "arm" });
    const ir = structuredClone(result.ir!);
    Object.assign(ir.state, { __sel: { n: 1, keys: [1] }, __brush: { frame: "a" } });
    const boxes = flattenNodesFromIr(ir).nodes.filter((n) => n.name === "box");
    const vis = boxes.filter((n) => n.props.visible);
    expect(vis).toHaveLength(3);
    expect(boxes.find((n) => n.props.__boxKey === "placebo")?.props.q1).toBe(12);
    expect(boxes.find((n) => n.props.__boxKey === "drug-A")?.props.q1).toBe(20);
    const violins = flattenNodesFromIr(ir).nodes.filter((n) => n.name === "violin");
    expect(violins.filter((n) => n.props.visible)).toHaveLength(3);
    expect(violins[0]?.props.d).not.toBeUndefined();
    const baseline = flattenNodesFromIr(result.ir!).nodes.find((n) => n.name === "violin");
    expect(String(violins[0]?.props.d)).not.toBe(String(baseline?.props.d));
    const drugA = structuredClone(result.ir!);
    Object.assign(drugA.state, { __sel: { n: 1, keys: ["drug-A"] }, __brush: { frame: "a" } });
    const svg = renderSvgFromIr(drugA);
    expect(svg.match(/data-viva-name="violin"/g)?.length).toBe(1);
    expect(svg.match(/data-viva-name="box"/g)?.length).toBe(1);
  });

  it("lets the compiler own linked-summary chrome instead of inset magic numbers", () => {
    const src = readFileSync("examples/linked-summary.viva", "utf8");
    expect(src).not.toMatch(/insetL|insetR|insetT|insetB|areaX|areaY/);
    expect(src).not.toMatch(/^\s+(x|y|w|h|gutter|margin):/m);
    const result = compileSource(src, "linked-summary.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(expect.arrayContaining(["a", "b", "c", "d"]));
  });

  it("reconnects line segments from visit keys in __sel instead of hiding the series", () => {
    const result = compileSource(
      readFileSync("examples/linked-summary.viva", "utf8"),
      "linked-summary.viva",
    );
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name === "__d_marks")!;
    const seg = marks.items.find((i) => i.kind === "node" && i.name === "seg_0");
    expect(seg?.kind).toBe("node");
    if (seg?.kind === "node") {
      expect(seg.props.__lineData).toMatchObject({ kind: "string", value: "rows" });
      expect(seg.props.__lineKey).toMatchObject({ kind: "string", value: "placebo" });
    }
    const data = result.ir!.data as Record<string, unknown>;
    const raw = {
      __lineData: "rows",
      __lineKey: "placebo",
      __lineSeries: "arm",
      __lineXPos: "t",
      __lineYField: "score",
      __lineCats: ["placebo", "drug-A", "drug-B"],
      __lineIndex: 0,
      __lineFrame: "d",
      frame: "d",
      x1: 1,
      y1: 12,
      x2: 2,
      y2: 14,
    };
    const skip = applySelSummary(raw, {
      data,
      state: { __sel: { n: 1, keys: [1] }, __brush: { frame: "a" } },
    });
    expect(skip.visible).toBe(false);
    const hop = applySelSummary(raw, {
      data,
      state: { __sel: { n: 2, keys: [1, 3] }, __brush: { frame: "a" } },
    });
    expect(hop.visible).toBe(true);
    expect(hop.x1).toBe(1);
    expect(hop.y1).toBe(12);
    expect(hop.x2).toBe(3);
    expect(hop.y2).toBe(11);
    const other = applySelSummary(raw, {
      data,
      state: { __sel: { n: 1, keys: ["drug-A"] }, __brush: { frame: "a" } },
    });
    expect(other.visible).toBe(false);
    const ir = structuredClone(result.ir!);
    Object.assign(ir.state, { __sel: { n: 2, keys: [1, 3] }, __brush: { frame: "a" } });
    const segs = flattenNodesFromIr(ir).nodes.filter((n) => String(n.name).startsWith("seg_"));
    const painted = segs.filter((n) => n.props.visible);
    expect(painted).toHaveLength(3);
    const placebo = painted.find((n) => n.props.__lineKey === "placebo");
    expect(placebo?.props.y1).toBeDefined();
  });

  it("links a scatter brush onto a box summary through shared __sel keys", () => {
    const result = compileSource(
      readFileSync("examples/linked-summary.viva", "utf8"),
      "linked-summary.viva",
    );
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name === "__b_marks")!;
    const boxNode = marks.items.find((i) => i.kind === "node" && i.name === "box");
    expect(boxNode?.kind).toBe("node");
    if (boxNode?.kind === "node") {
      const hideB = evaluate(boxNode.props.visible, [
        { __sel: { n: 1, keys: ["drug-A"] }, __brush: { frame: "a" } },
      ]);
      const keepA = evaluate(boxNode.props.visible, [
        { __sel: { n: 1, keys: ["placebo"] }, __brush: { frame: "a" } },
      ]);
      expect(keepA).toBe(true);
      expect(hideB).toBe(false);
    }
  });

  it("chart.box expands compiler quartiles onto a band axis", () => {
    const src = readFileSync("examples/box.viva", "utf8");
    const result = compileSource(src, "box.viva", { handbookIds: ["print-nature"] });
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    const names = marks.items
      .filter((i) => i.kind === "node")
      .map((i) => (i.kind === "node" ? i.name : ""));
    expect(names.some((n) => n === "box")).toBe(true);
    expect(names.some((n) => n.startsWith("boxWhisker_"))).toBe(true);
    expect(names.some((n) => n.startsWith("boxMed_"))).toBe(true);
  });

  it("toggles __sel from a legend swatch click", () => {
    const result = compileSource(
      readFileSync("examples/linked-filter.viva", "utf8"),
      "linked-filter.viva",
    );
    expect(result.error).toBeNull();
    expect(readFileSync("examples/linked-filter.viva", "utf8")).not.toMatch(
      /insetL|insetR|insetT|insetB|gutter:|margin:/,
    );
    const picked = simulate(result.ir!, {
      events: [{ type: "click", target: "a_leg_0" }],
    });
    expect(picked.state.__highlightGrp).toBe("A");
    expect((picked.state.__sel as { keys: string[]; n: number }).keys).toContain("A");
    expect((picked.state.__sel as { n: number }).n).toBe(1);
    const cleared = simulate(result.ir!, {
      events: [
        { type: "click", target: "a_leg_0" },
        { type: "click", target: "a_leg_0" },
      ],
    });
    expect(cleared.state.__highlightGrp).toBeNull();
    expect((cleared.state.__sel as { n: number }).n).toBe(0);
  });

  it("hides other-panel marks that are outside the shared __sel filter", () => {
    const result = compileSource(
      readFileSync("examples/linked-filter.viva", "utf8"),
      "linked-filter.viva",
    );
    expect(result.error).toBeNull();
    const marks = result.ir!.scene.layers.find((l) => l.name === "__b_marks")!;
    const forItem = marks.items.find((i) => i.kind === "for");
    expect(forItem?.kind).toBe("for");
    if (forItem?.kind === "for") {
      const mark = forItem.body[0];
      expect(mark?.kind).toBe("node");
      if (mark?.kind === "node") {
        expect(mark.props.visible).toBeDefined();
        const src = JSON.stringify(mark.props.visible);
        expect(src).toContain("__sel");
        expect(src).toContain("has");
        const hideA = evaluate(mark.props.visible, [
          {
            __sel: { n: 2, keys: ["A"] },
            __brush: { frame: "a" },
            row: { x: 1, y: 8, grp: "A" },
          },
        ]);
        const hideC = evaluate(mark.props.visible, [
          {
            __sel: { n: 2, keys: ["A"] },
            __brush: { frame: "a" },
            row: { x: 4, y: 2, grp: "C" },
          },
        ]);
        expect(hideA).toBe(true);
        expect(hideC).toBe(false);
      }
    }
  });

  it("collects a shared __sel key set while brushing", () => {
    const result = compileSource(
      `artifact S
data series = [{ x: 1, y: 2, grp: "A" }, { x: 8, y: 8, grp: "B" }]
scene
  size: 400 240
widget chart.scatter
  data: series
  xField: x
  yField: y
  group: grp
  xlim: 0 10
  ylim: 0 10
  areaX: 0 200
  areaY: 0 200
`,
      "sel.viva",
    );
    expect(result.error).toBeNull();
    const drag = result.ir!.events.find((e) => e.type === "drag");
    expect(drag?.body.some((s) => s.kind === "for")).toBe(true);
    const world = simulate(result.ir!, {
      events: [
        { type: "dragstart", target: "__chart_1_plotBg", event: { x: 10, y: 190 } },
        { type: "drag", target: "__chart_1_plotBg", event: { x: 50, y: 150 } },
      ],
    });
    const sel = world.state.__sel as { n: number; keys: unknown[] };
    expect(sel.n).toBeGreaterThan(0);
    expect(sel.keys).toContain("A");
    expect(sel.keys).not.toContain("B");
    const kept = simulate(result.ir!, {
      events: [
        { type: "dragstart", target: "__chart_1_plotBg", event: { x: 10, y: 190 } },
        { type: "drag", target: "__chart_1_plotBg", event: { x: 50, y: 150 } },
        { type: "dragend", target: "__chart_1_plotBg", event: { x: 50, y: 150 } },
      ],
    });
    expect((kept.state.__sel as { n: number }).n).toBeGreaterThan(0);
    expect(kept.state.__brush).toMatchObject({ on: 1 });
    const cleared = simulate(result.ir!, {
      events: [
        { type: "dragstart", target: "__chart_1_plotBg", event: { x: 10, y: 190 } },
        { type: "dragend", target: "__chart_1_plotBg", event: { x: 11, y: 191 } },
      ],
    });
    expect((cleared.state.__sel as { n: number }).n).toBe(0);
    expect(cleared.state.__brush).toMatchObject({ on: 0 });
  });

  it("uses a lasso window when the brush trail is longer than a box", () => {
    const result = compileSource(
      `artifact Lasso
data series = [{ x: 2, y: 2, grp: "A" }, { x: 8, y: 8, grp: "B" }]
scene
  size: 400 240
widget chart.scatter
  data: series
  xField: x
  yField: y
  group: grp
  xlim: 0 10
  ylim: 0 10
  areaX: 0 200
  areaY: 0 200
`,
      "lasso.viva",
    );
    expect(result.error).toBeNull();
    const world = simulate(result.ir!, {
      events: [
        { type: "dragstart", target: "__chart_1_plotBg", event: { x: 20, y: 180 } },
        { type: "drag", target: "__chart_1_plotBg", event: { x: 60, y: 180 } },
        { type: "drag", target: "__chart_1_plotBg", event: { x: 60, y: 140 } },
        { type: "drag", target: "__chart_1_plotBg", event: { x: 20, y: 140 } },
        { type: "drag", target: "__chart_1_plotBg", event: { x: 20, y: 175 } },
      ],
    });
    const brush = world.state.__brush as { mode: boolean; on: number };
    expect(brush.mode).toBe(true);
    expect(brush.on).toBe(1);
    const sel = world.state.__sel as { keys: unknown[] };
    expect(sel.keys).toContain("A");
    expect(sel.keys).not.toContain("B");
  });

  it("expands significance brackets and violin density", () => {
    const br = compileSource(readFileSync("examples/brackets.viva", "utf8"), "br.viva");
    expect(br.error).toBeNull();
    const axes = br.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const names = axes.items
      .filter((i) => i.kind === "node")
      .map((i) => (i.kind === "node" ? i.name : ""));
    expect(names.some((n) => n.includes("_brk_"))).toBe(true);
    expect(names.some((n) => n.includes("_brkLbl_"))).toBe(true);
    const vl = compileSource(readFileSync("examples/violin.viva", "utf8"), "vl.viva");
    expect(vl.error).toBeNull();
    const marks = vl.ir!.scene.layers.find((l) => l.name.endsWith("_marks"))!;
    expect(marks.items.some((i) => i.kind === "node" && i.name === "violin")).toBe(true);
  });

  it("layout.board splits body into left/right frames", () => {
    const result = compileSource(
      `artifact Split
scene
  size: 1280 720
widget layout.board
  w: 1280
  h: 720
  splits: 2
  guides: false
`,
      "split.viva",
    );
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["safe", "title", "body", "lower", "left", "right"]),
    );
  });

  it("layout.board typeGrid paints a baseline and type columns", () => {
    const result = compileSource(
      readFileSync("examples/board-typegrid.viva", "utf8"),
      "typegrid.viva",
    );
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["safe", "title", "body", "lower", "type0", "type11"]),
    );
    expect(result.ir!.scene.layers.some((l) => l.name === "__board_typeGrid")).toBe(true);
    const grid = result.ir!.scene.layers.find((l) => l.name === "__board_typeGrid")!;
    expect(grid.items.filter((i) => i.kind === "node").length).toBeGreaterThan(20);
    const col0 = result.ir!.frames.find((f) => f.name === "type0")!;
    const x = evaluate(col0.props.x, [result.ir!.state, result.ir!.data]) as number[];
    const safe = result.ir!.frames.find((f) => f.name === "safe")!;
    const safeX = evaluate(safe.props.x, [result.ir!.state, result.ir!.data]) as number[];
    expect(x[0]).toBeCloseTo(safeX[0]!);
    expect(x[1]).toBeCloseTo(safeX[0]! + (safeX[1]! - safeX[0]!) / 12);
  });

  it("layout.board bleed creates trim/bleed frames and crop marks", () => {
    const result = compileSource(
      `artifact Bleed
scene
  size: 1280 720
widget layout.board
  w: 1280
  h: 720
  bleed: 16
  guides: false
`,
      "bleed.viva",
    );
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["safe", "title", "body", "lower", "bleed", "trim"]),
    );
    const trim = result.ir!.frames.find((f) => f.name === "trim")!;
    const x = evaluate(trim.props.x, [result.ir!.state, result.ir!.data]) as number[];
    expect(x[0]).toBeCloseTo(16);
    expect(x[1]).toBeCloseTo(1264);
    expect(result.ir!.scene.layers.some((l) => l.name === "__board_crop")).toBe(true);
    const crop = result.ir!.scene.layers.find((l) => l.name === "__board_crop")!;
    expect(crop.items.filter((i) => i.kind === "node").length).toBe(8);
  });
});
