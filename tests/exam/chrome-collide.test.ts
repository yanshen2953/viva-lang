import { describe, expect, it } from "vitest";
import { compileSource } from "../../src/pipeline.js";
import { evaluate } from "../../src/eval.js";
import {
  estimateTextWidthPx,
  growInsetsForNeighbors,
  placePaperChrome,
  rectsOverlap,
  thinXTicks,
  wrapTextLines,
} from "../../src/layout/chrome-collide.js";

describe("paper chrome collision", () => {
  it("wraps a long title on spaces before mid-word breaks", () => {
    const lines = wrapTextLines("Survival and response by treatment cohort", 80, 12, 0.35);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(" ")).toMatch(/Survival/);
    expect(lines.join(" ")).toMatch(/cohort/);
    for (const line of lines) {
      expect(estimateTextWidthPx(line, 12, 0.35)).toBeLessThanOrEqual(80 + 12);
    }
  });

  it("keeps leftover words on the last line when capped", () => {
    const lines = wrapTextLines(
      "Serum concentration of inflammatory cytokine",
      40,
      9,
      0.2,
      3,
    );
    expect(lines.length).toBe(3);
    expect(lines.join("").replace(/\s/g, "")).toMatch(/cytokine/);
  });

  it("drops overlapping x-tick labels but keeps the ends", () => {
    const kept = thinXTicks([
      { label: "January", x: 10 },
      { label: "February", x: 28 },
      { label: "March", x: 46 },
      { label: "April", x: 64 },
    ]);
    expect(kept[0]?.label).toBe("January");
    expect(kept[kept.length - 1]?.label).toBe("April");
    expect(kept.length).toBeLessThan(4);
    for (let i = 1; i < kept.length; i++) {
      const a = kept[i - 1]!;
      const b = kept[i]!;
      const aw = estimateTextWidthPx(a.label, 8, 0.08);
      const bw = estimateTextWidthPx(b.label, 8, 0.08);
      expect(a.x + aw / 2 + 3).toBeLessThanOrEqual(b.x - bw / 2 + 0.01);
    }
  });

  it("nudges a rotated y-title left of measured y-tick boxes", () => {
    const { chrome, rects } = placePaperChrome(
      { px0: 80, px1: 360, py0: 40, py1: 220 },
      (px) => px,
      false,
      {
        yCaption: "Concentration (µM)",
        yTicks: [
          { label: "10000", y: 50 },
          { label: "5000", y: 120 },
          { label: "0", y: 210 },
        ],
        xTicks: [{ label: "0", x: 80 }, { label: "10", x: 360 }],
      },
    );
    const yTitle = rects.find((r) => r.id === "yTitle")!;
    const ticks = rects.filter((r) => r.id.startsWith("ytick-"));
    expect(yTitle).toBeTruthy();
    expect(ticks.length).toBe(3);
    for (const tick of ticks) {
      expect(rectsOverlap(yTitle, tick, 1)).toBe(false);
    }
    expect(chrome.yTitleX).toBeLessThan(chrome.yTickX);
  });

  it("shifts a chart title right of the (a) panel label", () => {
    const { chrome, rects } = placePaperChrome(
      { px0: 20, px1: 300, py0: 24, py1: 200 },
      (px) => px,
      false,
      {
        title: "RESPONSE BY VISIT",
        panelLabel: "(a)",
        yTicks: [{ label: "0", y: 190 }],
        xTicks: [{ label: "1", x: 40 }],
      },
      { x0: 0, y0: 0, x1: 320, y1: 220 },
    );
    const title = rects.find((r) => r.id === "title")!;
    const label = rects.find((r) => r.id === "panel-label")!;
    expect(title).toBeTruthy();
    expect(label).toBeTruthy();
    expect(rectsOverlap(title, label, 1)).toBe(false);
    expect(chrome.titleX).toBeGreaterThan(label.x + label.w);
  });

  it("keeps a right legend clear of the colorbar", () => {
    const { rects } = placePaperChrome(
      { px0: 40, px1: 220, py0: 30, py1: 200 },
      (px) => px,
      false,
      {
        colorbar: true,
        cbarLabels: ["0.00", "4.00"],
        legendAt: "right",
        legendKeys: ["high", "mid", "low"],
        yTicks: [{ label: "0", y: 190 }],
        xTicks: [{ label: "1", x: 80 }],
      },
      { x0: 0, y0: 0, x1: 360, y1: 240 },
    );
    const cbar = rects.find((r) => r.id === "cbar")!;
    const legends = rects.filter((r) => r.id.startsWith("legend-"));
    expect(cbar).toBeTruthy();
    expect(legends.length).toBe(3);
    for (const legend of legends) {
      expect(rectsOverlap(cbar, legend, 1)).toBe(false);
    }
  });

  it("compiles a labeled panel so title and (a) boxes do not overlap", () => {
    const result = compileSource(
      `artifact Collide
data series = [{ x: 1, y: 20 }, { x: 2, y: 40 }]
scene
  size: 480 280
  background: #ffffff
widget layout.figure
  cols: 1
  rows: 1
  gutter: 8
  margin: 8
widget chart.line
  panel: a
  data: series
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 50
  xLabel: Time
  xUnit: week
  yLabel: Score
  title: "RESPONSE BY VISIT"
  interactive: false
`,
      "collide.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const ir = result.ir!;
    const env = [ir.state, ir.data];
    const nodes = ir.scene.layers.flatMap((l) => l.items.filter((i) => i.kind === "node"));
    const title = nodes.find((n) => n.kind === "node" && n.name === "a_title");
    const label = nodes.find((n) => n.kind === "node" && /_lab_a$/.test(n.name));
    expect(title?.kind).toBe("node");
    expect(label?.kind).toBe("node");
    if (title?.kind === "node" && label?.kind === "node") {
      const tx = evaluate(title.props.x, env) as number;
      const ty = evaluate(title.props.y, env) as number;
      const lx = evaluate(label.props.x, env) as number;
      const ly = evaluate(label.props.y, env) as number;
      const titleText = evaluate(title.props.text, env) as string;
      const labelText = evaluate(label.props.text, env) as string;
      const titleBox = {
        id: "t",
        x: tx,
        y: ty - 12 * 0.75,
        w: estimateTextWidthPx(titleText, 12, 0.35),
        h: 12,
      };
      const labelBox = {
        id: "l",
        x: lx,
        y: ly - 11,
        w: estimateTextWidthPx(labelText, 11, 0.15),
        h: 13,
      };
      expect(rectsOverlap(titleBox, labelBox, 1)).toBe(false);
    }
  });

  it("paints fewer x ticks when long category labels would collide", () => {
    const result = compileSource(
      `artifact Tight
data rows = [
  { x: 0, y: 4 }
  { x: 1, y: 6 }
  { x: 2, y: 3 }
  { x: 3, y: 8 }
]
scene
  size: 140 120
  background: #ffffff
widget chart.bar
  data: rows
  xField: x
  yField: y
  xlim: -0.5 3.5
  ylim: 0 10
  xCats: ["January", "February", "March", "April"]
  interactive: false
`,
      "tight.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const labels = axes.items
      .filter((i) => i.kind === "node" && /_xtick_\d+$/.test(i.name))
      .map((i) => (i.kind === "node" ? evaluate(i.props.text, [{}, {}]) : ""));
    expect(labels[0]).toBe("January");
    expect(labels[labels.length - 1]).toBe("April");
    expect(labels.length).toBeLessThan(4);
  });

  it("wraps a long x-axis caption to the plot width", () => {
    const { chrome, rects } = placePaperChrome(
      { px0: 40, px1: 160, py0: 20, py1: 140 },
      (px) => px,
      false,
      {
        xCaption: "Follow-up time since randomization",
        yCaption: "Score",
        yTicks: [{ label: "0", y: 130 }],
        xTicks: [{ label: "0", x: 40 }, { label: "12", x: 160 }],
      },
    );
    expect(chrome.xTitleLines.length).toBeGreaterThan(1);
    expect(chrome.xTitleLines.join(" ")).toMatch(/Follow-up/);
    expect(chrome.xTitleLines.join(" ")).toMatch(/randomization/);
    const box = rects.find((r) => r.id === "xTitle")!;
    expect(box.h).toBeGreaterThan(9);
  });

  it("wraps a long y-axis caption to the plot height", () => {
    const { chrome, rects } = placePaperChrome(
      { px0: 80, px1: 280, py0: 20, py1: 140 },
      (px) => px,
      false,
      {
        yCaption: "Serum concentration of inflammatory cytokine",
        xCaption: "Week",
        yTicks: [{ label: "0", y: 130 }],
        xTicks: [{ label: "1", x: 80 }],
      },
    );
    expect(chrome.yTitleLines.length).toBeGreaterThan(1);
    expect(chrome.yTitleLines.join(" ")).toMatch(/Serum/);
    expect(chrome.yTitleLines.join(" ")).toMatch(/cytokine/);
    const box = rects.find((r) => r.id === "yTitle")!;
    expect(box.w).toBeGreaterThan(9);
  });

  it("grows the right inset when chrome overlaps the neighbor cell", () => {
    const grow = growInsetsForNeighbors(
      [{ id: "legend-0", x: 168, y: 20, w: 40, h: 12 }],
      { x0: 0, y0: 0, x1: 180, y1: 120 },
      [
        {
          cell: { x0: 188, y0: 0, x1: 360, y1: 120 },
          rects: [{ id: "yTitle", x: 186, y: 30, w: 10, h: 60 }],
        },
      ],
      2,
    );
    expect(grow.r).toBeGreaterThan(0.5);
  });

  it("emits wrapped chart title lines on a narrow scene", () => {
    const result = compileSource(
      `artifact Wrap
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  size: 160 140
  background: #ffffff
widget chart.line
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  title: "Survival and response by treatment cohort"
  interactive: false
`,
      "wrap.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const titles = axes.items.filter((i) => i.kind === "node" && /_title(_\d+)?$/.test(i.name));
    expect(titles.length).toBeGreaterThan(1);
    const texts = titles.map((i) =>
      i.kind === "node" ? String(evaluate(i.props.text, [{}, {}])) : "",
    );
    expect(texts.join(" ")).toMatch(/Survival/);
    expect(texts.join(" ")).toMatch(/cohort/);
  });

  it("emits wrapped axis title lines on a short plot", () => {
    const result = compileSource(
      `artifact AxisWrap
data rows = [{ x: 1, y: 2 }, { x: 2, y: 4 }]
scene
  size: 200 140
  background: #ffffff
widget chart.line
  data: rows
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 5
  xLabel: "Follow-up time since randomization"
  yLabel: "Serum concentration of inflammatory cytokine"
  interactive: false
`,
      "axis-wrap.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const axes = result.ir!.scene.layers.find((l) => l.name.endsWith("_axes"))!;
    const xTitles = axes.items.filter((i) => i.kind === "node" && /_xTitle(_\d+)?$/.test(i.name));
    const yTitles = axes.items.filter((i) => i.kind === "node" && /_yTitle(_\d+)?$/.test(i.name));
    expect(xTitles.length + yTitles.length).toBeGreaterThan(2);
    const texts = [...xTitles, ...yTitles].map((i) =>
      i.kind === "node" ? String(evaluate(i.props.text, [{}, {}])) : "",
    );
    expect(texts.join(" ")).toMatch(/Follow-up|randomization|Serum|cytokine/);
  });

  it("keeps adjacent-panel chrome boxes from overlapping", () => {
    const result = compileSource(
      `artifact Neighbors
data left = [
  { x: 1, y: 20, grp: "placebo-control" }
  { x: 2, y: 40, grp: "active-drug" }
  { x: 1, y: 18, grp: "placebo-control" }
  { x: 2, y: 36, grp: "active-drug" }
]
data right = [{ x: 1, y: 12 }, { x: 2, y: 18 }]
scene
  size: 360 180
  background: #ffffff
widget layout.figure
  cols: 2
  rows: 1
  gutter: 8
  margin: 6
widget chart.line
  panel: a
  data: left
  xField: x
  yField: y
  group: grp
  xlim: 0 3
  ylim: 0 50
  title: "LEFT"
  interactive: false
widget chart.line
  panel: b
  data: right
  xField: x
  yField: y
  xlim: 0 3
  ylim: 0 24
  yLabel: "Serum concentration of inflammatory cytokine"
  title: "RIGHT"
  interactive: false
`,
      "neighbors.viva",
      { handbookIds: ["print-nature"] },
    );
    expect(result.error).toBeNull();
    const ir = result.ir!;
    const env = [ir.state, ir.data];
    const nodes = ir.scene.layers.flatMap((l) => l.items.filter((i) => i.kind === "node"));
    const aLegs = nodes.filter((n) => n.kind === "node" && /^a_legLbl_/.test(n.name));
    const bTitles = nodes.filter((n) => n.kind === "node" && /b_yTitle/.test(n.name));
    expect(aLegs.length).toBeGreaterThan(0);
    expect(bTitles.length).toBeGreaterThan(0);
    for (const leg of aLegs) {
      if (leg.kind !== "node") continue;
      const lx = evaluate(leg.props.x, env) as number;
      const ly = evaluate(leg.props.y, env) as number;
      const text = String(evaluate(leg.props.text, env));
      const boxA = {
        id: "a",
        x: lx,
        y: ly - 6,
        w: estimateTextWidthPx(text, 8, 0.1),
        h: 12,
      };
      for (const title of bTitles) {
        if (title.kind !== "node") continue;
        const tx = evaluate(title.props.x, env) as number;
        const ty = evaluate(title.props.y, env) as number;
        const ttext = String(evaluate(title.props.text, env));
        const tw = estimateTextWidthPx(ttext, 9, 0.2);
        const boxB = { id: "b", x: tx - 5, y: ty - tw / 2, w: 11, h: tw };
        expect(rectsOverlap(boxA, boxB, 1)).toBe(false);
      }
    }
  });
});
