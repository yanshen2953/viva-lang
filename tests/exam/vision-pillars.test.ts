import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compileSource } from "../../src/pipeline.js";
import { renderSvgFromIr } from "../../src/export/static-svg.js";
import { exportArtifact } from "../../src/export/index.js";
import { domainMap, domainUnmap, scalesFromFrameProps } from "../../src/space.js";
import { resolveCjkFontPath } from "../../src/export/pdf-font.js";
import { flattenNodesFromIr } from "../../src/export/static-svg.js";
import { evaluate } from "../../src/eval.js";
import { mmToPx, resolveSceneBox, COLUMN_MM } from "../../src/space/scene-box.js";
import { handleMcpTool } from "../../src/mcp/tools.js";
import { SYSTEM_PROMPT_SLIM } from "../../src/llm/system-prompt-slim.js";
import { simulate } from "../../src/simulate.js";

describe("vision pillars: board, mm, log, hover object, CJK pdf", () => {
  it("layout.board creates safe/title/body/lower frames", () => {
    const src = readFileSync("examples/board.viva", "utf8");
    const result = compileSource(src, "board.viva");
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["safe", "title", "body", "lower"]),
    );
    expect(result.ir!.scene.layers.some((l) => l.name === "__board_guides")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__body_marks")).toBe(true);
  });

  it("resolves unit: mm and single-column 89 mm to CSS px", () => {
    const box = resolveSceneBox({ unit: "mm", column: "single", height: 68 });
    expect(box.column).toBe("single");
    expect(box.width).toBeCloseTo(mmToPx(COLUMN_MM.single));
    expect(box.height).toBeCloseTo(mmToPx(68));
    const paper = compileSource(readFileSync("examples/paper-column.viva", "utf8"), "paper.viva");
    expect(paper.error).toBeNull();
    expect(evaluate(paper.ir!.frames[0]!.props.xScale!, [paper.ir!.state, paper.ir!.data])).toBe(
      "log",
    );
    const svg = renderSvgFromIr(paper.ir!);
    expect(svg).toMatch(/viewBox="0 0 336/);
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
      expect.arrayContaining(["__brush", "__highlightGrp", "__hover", "__sel", "__tip"]),
    );
    expect(result.ir!.events.some((e) => e.type === "hover" && e.target === "mark")).toBe(true);
    expect(result.ir!.events.some((e) => e.type === "dragstart")).toBe(true);
    const hover = result.ir!.events.find((e) => e.type === "hover")!;
    expect(hover.body.some((s) => s.kind === "assign" && s.target[0] === "__hover")).toBe(true);
    expect(hover.body.some((s) => s.kind === "assign" && s.target[0] === "__highlightGrp")).toBe(true);
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
    ];
    for (const phrase of phrases) {
      expect(pdfSafeText(pickPdfFont(fonts, phrase), phrase)).toBe(phrase);
    }
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
    const result = compileSource(src, "storyboard.viva");
    expect(result.error).toBeNull();
    expect(result.ir!.frames.map((f) => f.name)).toEqual(
      expect.arrayContaining(["safe", "title", "body", "lower", "beat0", "beat3"]),
    );
    expect(result.ir!.scene.layers.some((l) => l.name === "__beat0_marks")).toBe(true);
    expect(result.ir!.scene.layers.some((l) => l.name === "__board_play")).toBe(true);
    expect(Object.keys(result.ir!.state)).toContain("__beat");
    expect(result.ir!.ticks.length).toBeGreaterThan(0);
    const world = simulate(result.ir!, { ticks: 1 });
    expect(world.state.__beat).toBe(1);
    const after = simulate(result.ir!, { ticks: 4 });
    expect(after.state.__beat).toBe(0);
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
    expect(kept.state.__brush).toMatchObject({ on: 0 });
    const cleared = simulate(result.ir!, {
      events: [
        { type: "dragstart", target: "__chart_1_plotBg", event: { x: 10, y: 190 } },
        { type: "dragend", target: "__chart_1_plotBg", event: { x: 11, y: 191 } },
      ],
    });
    expect((cleared.state.__sel as { n: number }).n).toBe(0);
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
    expect(x[0]).toBeCloseTo(64);
    expect(x[1]).toBeCloseTo(64 + (1280 - 128) / 12);
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
